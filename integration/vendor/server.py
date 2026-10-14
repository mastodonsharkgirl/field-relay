import argparse
import hmac
import json
import os
import re
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from .contract import decode_order
from .store import VendorStore


MAX_BODY = 16 * 1024
KEY = re.compile(r'^[0-9a-f]{64}$')
REQUEST_ID = re.compile(r'^[A-Za-z0-9_-]{1,64}$')
SCENARIOS = {'healthy', '429_once', '429_twice', '429_repeat', '429_huge_retry_after', '503_once', '401', '403', '422', 'timeout_before_commit', 'timeout_after_commit', 'malformed_success', 'mismatched_readback', 'readback_unavailable', 'readback_blocked', 'hold_after_commit', 'rollback_transaction', 'redirect', 'slow_body', 'oversized_response'}


SCENARIOS.update({'malformed_success_absent', 'wrong_content_type_success', 'malformed_429',
                  'malformed_401', 'malformed_403', 'malformed_422', 'malformed_500',
                  'claimed_receipt_mismatch'})
READBACK_ACTIONS = {'mismatched_readback', 'readback_unavailable', 'readback_blocked', 'claimed_receipt_mismatch', 'malformed_404', 'slow_404', 'invalid_404', 'mismatched_404'}
SCENARIOS.update(READBACK_ACTIONS)
SCENARIOS.add('hold_before_commit')


class DeadlineReader:
    """Unbuffered request reader so slow-drip bytes share one request deadline."""
    def __init__(self, connection, handler):
        self.connection, self.handler = connection, handler

    def _recv(self, size):
        self.handler._remaining()
        return self.connection.recv(size)

    def readline(self, limit=-1):
        chunks = []
        while limit < 0 or sum(map(len, chunks)) < limit:
            byte = self._recv(1)
            if not byte: break
            chunks.append(byte)
            if byte == b'\n': break
        return b''.join(chunks)

    def read(self, size=-1):
        if size < 0: raise ValueError('bounded reads required')
        chunks, remaining = [], size
        while remaining:
            part = self._recv(remaining)
            if not part: break
            chunks.append(part)
            remaining -= len(part)
        return b''.join(chunks)

    def close(self):
        return None


def expand_scenario(sequence):
    post, get = [], []
    for action in sequence:
        if action in READBACK_ACTIONS: get.append(action)
        elif action == '429_once': post.extend(('429', 'healthy'))
        elif action == '429_twice': post.extend(('429', '429', 'healthy'))
        elif action == '429_repeat': post.extend(('429',) * 8)
        elif action == '503_once': post.extend(('503', 'healthy'))
        else: post.append(action)
    return post, get


def create_server(store_path: Path, mode: str, token: str, admin_token: str) -> ThreadingHTTPServer:
    store = VendorStore(store_path, mode)
    barriers = {}
    barrier_lock = threading.Lock()

    class Handler(BaseHTTPRequestHandler):
        server_version = 'FieldRelayMock/1'
        sys_version = ''

        def log_message(self, *_):
            return

        def setup(self):
            super().setup()
            self.rfile = DeadlineReader(self.connection, self)

        def handle_one_request(self):
            self._deadline = time.monotonic() + .75
            return super().handle_one_request()

        def _remaining(self):
            remaining = self._deadline - time.monotonic()
            if remaining <= 0: raise TimeoutError
            self.connection.settimeout(remaining)

        def _error(self, status, code, request_id='server', retry_after=None):
            headers = {'Retry-After': retry_after} if retry_after is not None else {}
            self._json(status, {'schemaVersion': 1, 'code': code, 'requestId': request_id, 'message': 'Synthetic vendor request rejected.'}, headers)

        def _json(self, status, value, headers=None):
            body = json.dumps(value, separators=(',', ':')).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 'no-store')
            for name, value in (headers or {}).items():
                self.send_header(name, value)
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _redirect(self, key):
            self.send_response(302)
            self.send_header('Location', '/v1/orders/' + key)
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', '0')
            self.end_headers()

        def _malformed_response(self, action):
            status = 200 if action == 'malformed_success_absent' else 201 if action == 'wrong_content_type_success' else int(action.removeprefix('malformed_'))
            body = b'not-json' if action == 'wrong_content_type_success' else b'{'
            self.send_response(status)
            self.send_header('Content-Type', 'text/plain' if action == 'wrong_content_type_success' else 'application/json')
            self.send_header('Cache-Control', 'no-store')
            if status == 429: self.send_header('Retry-After', '1')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _slow_json(self, status, value):
            body = json.dumps(value, separators=(',', ':')).encode()
            split = max(1, len(body) // 2)
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            try:
                self.wfile.write(body[:split])
                self.wfile.flush()
                time.sleep(1)
                self.wfile.write(body[split:])
            except (BrokenPipeError, ConnectionResetError):
                return

        def _oversized_response(self, status):
            body = b'{"schemaVersion":1,"padding":"' + b'x' * (64 * 1024) + b'"}'
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                return

        def _headers_ok(self):
            names = ('Content-Length', 'Authorization', 'Idempotency-Key', 'X-Request-Id')
            if self.headers.get('Transfer-Encoding'):
                self._error(400, 'unsupported_framing'); return False
            if any(len(self.headers.get_all(name, [])) != 1 for name in names if self.headers.get_all(name, [])):
                self._error(400, 'duplicate_header'); return False
            if self.headers.get_all('Origin', []):
                self._error(400, 'origin_rejected'); return False
            if self.headers.get('Host') != f'127.0.0.1:{self.server.server_port}':
                self._error(400, 'host_rejected'); return False
            return True

        def _auth(self, wanted):
            value = self.headers.get('Authorization', '')
            if not value.startswith('Bearer ') or not hmac.compare_digest(value[7:], wanted):
                self._error(401, 'unauthorized'); return False
            return True

        def _body(self):
            length = self.headers.get('Content-Length')
            try: size = int(length)
            except (TypeError, ValueError): self._error(400, 'invalid_content_length'); return None
            if size < 0 or size > MAX_BODY:
                self._error(413, 'body_too_large'); return None
            try:
                self._remaining()
                body = self.rfile.read(size)
                if len(body) != size:
                    self._error(400, 'incomplete_body'); return None
                if time.monotonic() > self._deadline:
                    self._error(400, 'body_timeout'); return None
                return body
            except TimeoutError: self._error(400, 'body_timeout'); return None

        def _request_id(self):
            value = self.headers.get('X-Request-Id')
            if value is None or not REQUEST_ID.fullmatch(value):
                self._error(400, 'invalid_request_id'); return None
            return value

        def do_GET(self):
            if not self._headers_ok() or not self._auth(token): return
            if self.path == '/v1/health':
                self._json(200, {'schemaVersion': 1, 'service': 'field-relay-mock-vendor', 'contractVersion': 1, 'instanceId': self.server.instance_id, 'storeId': store.list_orders()['storeId']}); return
            if self.path == '/v1/orders': self._json(200, store.list_orders()); return
            prefix = '/v1/orders/'
            if self.path.startswith(prefix) and KEY.fullmatch(self.path[len(prefix):]):
                key = self.path[len(prefix):]
                request_id = self._request_id()
                if request_id is None: return
                action, _ = store.consume_scenario(key, 'get', request_id)
                if action == 'malformed_404': self._malformed_response(action); return
                if action == 'invalid_404': self._json(404, {'schemaVersion': 1}); return
                if action == 'mismatched_404': self._error(404, 'not_found', 'another-request'); return
                if action == 'slow_404':
                    self._slow_json(404, {'schemaVersion': 1, 'code': 'not_found', 'requestId': request_id, 'message': 'Synthetic vendor request rejected.'}); return
                if action == 'readback_unavailable': self._error(503, 'synthetic_readback_unavailable'); return
                if action == 'readback_blocked': self._error(423, 'synthetic_readback_blocked'); return
                receipt = store.get_order(key)
                if action == 'mismatched_readback' and receipt:
                    receipt['payloadDigest'] = '0' * 64
                    self._json(200, receipt)
                elif action == 'claimed_receipt_mismatch' and receipt:
                    receipt['vendorOrderId'] = 'vendor-other-confirmation'
                    self._json(200, receipt)
                elif receipt: self._json(200, receipt)
                else: self._error(404, 'not_found', request_id)
                return
            self._error(404, 'not_found')

        def do_POST(self):
            if not self._headers_ok(): return
            if self.path == '/__lab/scenarios':
                admin_value = self.headers.get('Authorization', '')
                if not admin_value.startswith('Bearer ') or not hmac.compare_digest(admin_value[7:], admin_token):
                    self._error(403 if admin_value.startswith('Bearer ') else 401, 'admin_required')
                    return
                if self.headers.get('Content-Type') != 'application/json': self._error(415, 'content_type_required'); return
                body = self._body()
                if body is None: return
                try: payload = json.loads(body.decode())
                except (UnicodeDecodeError, json.JSONDecodeError): self._error(400, 'invalid_json'); return
                if not isinstance(payload, dict): self._error(422, 'invalid_scenario'); return
                action, key = payload.get('action'), payload.get('idempotencyKey')
                if action not in ('configure', 'observe', 'release') or not isinstance(key, str) or not KEY.fullmatch(key): self._error(422, 'invalid_scenario'); return
                if action == 'configure':
                    sequence = payload.get('scenario')
                    if set(payload) != {'action', 'idempotencyKey', 'scenario'} or not isinstance(sequence, list) or not 1 <= len(sequence) <= 8 or any(not isinstance(item, str) or item not in SCENARIOS for item in sequence): self._error(422, 'invalid_scenario'); return
                    post, get = expand_scenario(sequence)
                    if len(post) > 16 or len(get) > 8: self._error(422, 'invalid_scenario'); return
                    with barrier_lock: barriers[key] = threading.Event()
                    store.configure_scenario(key, post, get); self._json(200, store.observe_scenario(key)); return
                if action == 'release':
                    if set(payload) != {'action', 'idempotencyKey'}: self._error(422, 'invalid_scenario'); return
                    with barrier_lock: barriers.setdefault(key, threading.Event()).set()
                    self._json(200, store.observe_scenario(key)); return
                if set(payload) != {'action', 'idempotencyKey'}: self._error(422, 'invalid_scenario'); return
                self._json(200, store.observe_scenario(key)); return
            if not self._auth(token): return
            if self.path != '/v1/orders': self._error(404, 'not_found'); return
            request_id = self._request_id()
            key = self.headers.get('Idempotency-Key')
            if request_id is None: return
            if key is None or not KEY.fullmatch(key): self._error(400, 'invalid_idempotency_key', request_id); return
            if self.headers.get('Content-Type') != 'application/json': self._error(415, 'content_type_required', request_id); return
            body = self._body()
            if body is None: return
            try: order = decode_order(body)
            except ValueError: self._error(422, 'invalid_order', request_id); return
            action, _ = store.consume_scenario(key, 'post', request_id)
            if action in {'malformed_success_absent', 'wrong_content_type_success', 'malformed_429', 'malformed_401', 'malformed_403', 'malformed_422', 'malformed_500'}:
                self._malformed_response(action); return
            faults = {'429': 429, '503': 503, '401': 401, '403': 403, '422': 422}
            if action == '429_huge_retry_after':
                self._error(429, 'synthetic_429_huge_retry_after', request_id, '9' * 256); return
            if action in faults:
                self._error(faults[action], 'synthetic_' + action, request_id, '1' if action == '429' else None); return
            if action == 'redirect':
                self._redirect(key); return
            if action == 'timeout_before_commit': time.sleep(5); return
            if action == 'hold_before_commit':
                with barrier_lock: barrier = barriers.setdefault(key, threading.Event())
                barrier.wait(5)
            try:
                status, receipt = store.create_or_replay(order, key, request_id, _rollback_for_test=action == 'rollback_transaction')
            except RuntimeError:
                self._error(500, 'synthetic_transaction_rollback', request_id); return
            if action == 'hold_after_commit':
                with barrier_lock: barrier = barriers.setdefault(key, threading.Event())
                barrier.wait(5)
            if action == 'timeout_after_commit': time.sleep(5); return
            if action == 'slow_body':
                self._slow_json(status, receipt); return
            if action == 'oversized_response':
                self._oversized_response(status); return
            if action == 'malformed_success': self._json(200, {'schemaVersion': 1}); return
            self._json(status, receipt if status < 400 else {'schemaVersion': 1, 'requestId': request_id, **receipt})

    class BoundedServer(ThreadingHTTPServer):
        def get_request(self):
            request, address = super().get_request()
            request.settimeout(.75)
            return request, address

    server = BoundedServer(('127.0.0.1', 0), Handler)
    server.instance_id = 'instance-' + os.urandom(8).hex()
    server.vendor_store = store
    return server


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--state-dir', required=True)
    parser.add_argument('--mode', choices=('new', 'resume'), required=True)
    args = parser.parse_args()
    token = os.environ.get('FIELD_RELAY_VENDOR_TOKEN')
    admin_token = os.environ.get('FIELD_RELAY_VENDOR_ADMIN_TOKEN')
    if not token or not admin_token:
        raise SystemExit('Vendor credentials are unavailable.')
    server = create_server(Path(args.state_dir), args.mode, token, admin_token)
    print(json.dumps({'port': server.server_port, 'instanceId': server.instance_id, 'storeId': server.vendor_store.list_orders()['storeId']}, separators=(',', ':')), flush=True)
    try: server.serve_forever()
    finally: server.vendor_store.close(); server.server_close()


if __name__ == '__main__': main()
