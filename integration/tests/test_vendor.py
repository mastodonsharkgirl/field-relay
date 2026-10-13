import http.client
import json
import os
import subprocess
import socket
import sqlite3
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path

from integration.vendor.contract import identify


ROOT = Path(__file__).parents[1]
VECTORS = json.loads((ROOT / 'fixtures' / 'contract-vectors.json').read_text(encoding='utf-8'))
ORDER = VECTORS[0]['order']


class VendorStoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / 'state'

    def tearDown(self):
        self.tmp.cleanup()

    def test_changed_payload_preserves_original_receipt(self):
        from integration.vendor.store import VendorStore

        store = VendorStore(self.path, 'new')
        self.addCleanup(store.close)
        order = ORDER
        key = identify(order)['idempotencyKey']
        status, receipt = store.create_or_replay(order, key, 'first')
        replay_status, replay = store.create_or_replay(order, key, 'repeat')
        conflict_status, _ = store.create_or_replay({**order, 'quantity': order['quantity'] + 1}, key, 'changed')
        self.assertEqual((status, replay_status, conflict_status), (201, 200, 409))
        self.assertEqual(receipt['vendorOrderId'], replay['vendorOrderId'])
        self.assertEqual(store.get_order(key)['order'], order)
        self.assertEqual(store.list_orders()['count'], 1)

    def test_business_key_is_unique_even_with_another_key(self):
        from integration.vendor.store import VendorStore

        store = VendorStore(self.path, 'new')
        self.addCleanup(store.close)
        key = identify(ORDER)['idempotencyKey']
        self.assertEqual(store.create_or_replay(ORDER, key, 'first')[0], 201)
        self.assertEqual(store.create_or_replay(ORDER, 'a' * 64, 'other')[0], 409)
        self.assertEqual(store.list_orders()['count'], 1)

    def test_one_hundred_orders_cap_without_mutation(self):
        from integration.vendor.store import VendorStore

        store = VendorStore(self.path, 'new')
        self.addCleanup(store.close)
        for index in range(100):
            order = {**ORDER, 'orderId': f'N-{index}'}
            self.assertEqual(store.create_or_replay(order, identify(order)['idempotencyKey'], str(index))[0], 201)
        last = {**ORDER, 'orderId': 'N-100'}
        self.assertEqual(store.create_or_replay(last, identify(last)['idempotencyKey'], 'last')[0], 422)
        listing = store.list_orders()
        self.assertEqual(listing['count'], 100)
        self.assertLess(len(json.dumps(listing, separators=(',', ':')).encode()), 65536)

    def test_resume_retains_receipt_and_rejects_unsafe_state_modes(self):
        from integration.vendor.store import VendorStore

        store = VendorStore(self.path, 'new')
        key = identify(ORDER)['idempotencyKey']
        _, receipt = store.create_or_replay(ORDER, key, 'first')
        store.close()
        resumed = VendorStore(self.path, 'resume')
        self.addCleanup(resumed.close)
        self.assertEqual(resumed.get_order(key)['vendorOrderId'], receipt['vendorOrderId'])
        with self.assertRaises(ValueError):
            VendorStore(self.path, 'new')
        with self.assertRaises(ValueError):
            VendorStore(Path(self.tmp.name) / 'missing', 'resume')

    def test_resume_rejects_corrupt_or_unknown_database_without_replacing_it(self):
        from integration.vendor.store import VendorStore

        corrupt = Path(self.tmp.name) / 'corrupt'
        corrupt.mkdir()
        corrupt_db = corrupt / 'vendor.sqlite'
        corrupt_db.write_bytes(b'not a sqlite database')
        with self.assertRaises(ValueError):
            VendorStore(corrupt, 'resume')
        self.assertEqual(corrupt_db.read_bytes(), b'not a sqlite database')
        versioned = Path(self.tmp.name) / 'versioned'
        store = VendorStore(versioned, 'new')
        store.close()
        connection = sqlite3.connect(versioned / 'vendor.sqlite')
        try:
            connection.execute("UPDATE metadata SET value='99' WHERE name='schemaVersion'")
            connection.commit()
        finally:
            connection.close()
        with self.assertRaises(ValueError):
            VendorStore(versioned, 'resume')

    def test_concurrent_same_and_changed_payloads_create_one_order(self):
        from integration.vendor.store import VendorStore

        store = VendorStore(self.path, 'new')
        self.addCleanup(store.close)
        key = identify(ORDER)['idempotencyKey']
        outcomes = []
        def submit(order, request_id):
            outcomes.append(store.create_or_replay(order, key, request_id)[0])
        threads = [threading.Thread(target=submit, args=(ORDER if index % 2 == 0 else {**ORDER, 'quantity': 4}, f'r{index}')) for index in range(8)]
        for thread in threads: thread.start()
        for thread in threads: thread.join()
        self.assertEqual(outcomes.count(201), 1)
        self.assertEqual(outcomes.count(200) + outcomes.count(409), 7)
        self.assertEqual(store.list_orders()['count'], 1)


class VendorHttpTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.state = Path(self.tmp.name) / 'state'
        self.token = 'ordinary-test-token'
        self.admin = 'admin-test-token'
        self.env = {'PATH': os.environ['PATH'], 'SYSTEMROOT': os.environ['SYSTEMROOT'], 'PYTHONPATH': str(ROOT.parents[0]), 'FIELD_RELAY_VENDOR_TOKEN': self.token,
               'FIELD_RELAY_VENDOR_ADMIN_TOKEN': self.admin}
        self.start_server('new')

    def start_server(self, mode):
        self.proc = subprocess.Popen(
            [sys.executable, '-m', 'integration.vendor.server', '--state-dir', str(self.state), '--mode', mode],
            cwd=ROOT.parents[0], env=self.env, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )
        line = self.proc.stdout.readline().strip()
        self.ready = json.loads(line)
        self.port = self.ready['port']

    def restart_server(self):
        self.proc.terminate()
        self.proc.wait(timeout=5)
        self.proc.stdout.close()
        self.proc.stderr.close()
        self.start_server('resume')

    def tearDown(self):
        self.proc.terminate()
        self.proc.wait(timeout=5)
        self.proc.stdout.close()
        self.proc.stderr.close()
        self.tmp.cleanup()

    def request(self, method, path, body=None, token=None, extra=None):
        headers = {'Host': f'127.0.0.1:{self.port}'}
        if token is not None:
            headers['Authorization'] = f'Bearer {token}'
        headers.update(extra or {})
        connection = http.client.HTTPConnection('127.0.0.1', self.port, timeout=2)
        try:
            connection.request(method, path, body=body, headers=headers)
            response = connection.getresponse()
            data = response.read()
            return response.status, dict(response.getheaders()), json.loads(data) if data else None
        finally:
            connection.close()

    def order_headers(self, order=ORDER):
        return {'Content-Type': 'application/json', 'Idempotency-Key': identify(order)['idempotencyKey'], 'X-Request-Id': 'request_1'}

    def test_auth_host_origin_and_admin_separation(self):
        self.assertEqual(self.request('GET', '/v1/health')[0], 401)
        self.assertEqual(self.request('GET', '/v1/health', token='wrong')[0], 401)
        self.assertEqual(self.request('GET', '/v1/health', token=self.token, extra={'Origin': 'https://example.test'})[0], 400)
        self.assertEqual(self.request('POST', '/__lab/scenarios', b'{}', self.token, {'Content-Type': 'application/json'})[0], 403)
        status, headers, health = self.request('GET', '/v1/health', token=self.token)
        self.assertEqual(status, 200)
        self.assertEqual(headers['Cache-Control'], 'no-store')
        self.assertEqual(health['storeId'], self.ready['storeId'])

    def test_host_empty_origin_and_admin_shape_are_rejected_safely(self):
        self.assertEqual(self.request('GET', '/v1/health', token=self.token, extra={'Host': 'localhost'})[0], 400)
        self.assertEqual(self.request('GET', '/v1/health', token=self.token, extra={'Origin': ''})[0], 400)
        for body in (b'[]', b'null', b'1', b'{"action":"observe","idempotencyKey":"' + b'a' * 64 + b'","extra":true}', b'{"action":"configure","idempotencyKey":"' + b'a' * 64 + b'","scenario":[{}]}'):
            status, _, error = self.request('POST', '/__lab/scenarios', body, self.admin, {'Content-Type': 'application/json'})
            self.assertEqual(status, 422)
            self.assertEqual(error['message'], 'Synthetic vendor request rejected.')
        self.assertEqual(self.request('POST', '/__lab/scenarios', b'{}', self.admin, {'Content-Type': 'text/plain'})[0], 415)

    def test_short_body_and_slow_drip_never_create_an_order(self):
        key = identify(ORDER)['idempotencyKey']
        header = (f'POST /v1/orders HTTP/1.1\r\nHost: 127.0.0.1:{self.port}\r\nAuthorization: Bearer {self.token}\r\nContent-Type: application/json\r\nIdempotency-Key: {key}\r\nX-Request-Id: short\r\nContent-Length: 50\r\n\r\n{{}}').encode()
        with socket.create_connection(('127.0.0.1', self.port), timeout=2) as connection:
            connection.sendall(header)
            connection.shutdown(socket.SHUT_WR)
            self.assertIn(b' 400 ', connection.recv(1024))
        drip = b'GET /v1/health HTTP/1.1\r\nHost: '
        started = time.monotonic()
        with socket.create_connection(('127.0.0.1', self.port), timeout=2) as connection:
            for byte in drip:
                try: connection.send(bytes([byte]))
                except OSError: break
                time.sleep(.09)
            try: connection.recv(1)
            except OSError: pass
        self.assertLess(time.monotonic() - started, 1.6)
        self.assertEqual(self.request('GET', '/v1/orders', token=self.token)[2]['count'], 0)

    def test_create_replay_conflict_and_http_readback(self):
        body = json.dumps(ORDER).encode()
        status, _, first = self.request('POST', '/v1/orders', body, self.token, self.order_headers())
        self.assertEqual((status, first['replayed']), (201, False))
        status, _, replay = self.request('POST', '/v1/orders', body, self.token, self.order_headers())
        self.assertEqual((status, replay['replayed'], replay['vendorOrderId']), (200, True, first['vendorOrderId']))
        changed = {**ORDER, 'quantity': 4}
        self.assertEqual(self.request('POST', '/v1/orders', json.dumps(changed).encode(), self.token, self.order_headers(changed))[0], 409)
        read = self.request('GET', '/v1/orders/' + identify(ORDER)['idempotencyKey'], token=self.token)
        self.assertEqual((read[0], read[2]['order']), (200, ORDER))

    def test_invalid_framing_and_body_are_rejected(self):
        self.assertEqual(self.request('POST', '/v1/orders', b'{}', self.token, {'Content-Type': 'application/json', 'X-Request-Id': 'x'})[0], 400)
        headers = self.order_headers()
        headers['Content-Type'] = 'text/plain'
        self.assertEqual(self.request('POST', '/v1/orders', b'{}', self.token, headers)[0], 415)
        self.assertEqual(self.request('POST', '/v1/orders', b'{' * 17000, self.token, self.order_headers())[0], 413)

    def test_duplicate_headers_are_rejected_before_order_mutation(self):
        raw = (
            f'POST /v1/orders HTTP/1.1\r\nHost: 127.0.0.1:{self.port}\r\n'
            f'Authorization: Bearer {self.token}\r\nContent-Type: application/json\r\n'
            f'Idempotency-Key: {identify(ORDER)["idempotencyKey"]}\r\n'
            'Idempotency-Key: ' + 'a' * 64 + '\r\nX-Request-Id: duplicate\r\nContent-Length: 2\r\n\r\n{}'
        ).encode()
        with socket.create_connection(('127.0.0.1', self.port), timeout=2) as connection:
            connection.sendall(raw)
            self.assertIn(b' 400 ', connection.recv(1024))
        self.assertEqual(self.request('GET', '/v1/orders', token=self.token)[2]['count'], 0)

    def test_held_post_commits_before_response_and_get_can_observe_it(self):
        key = identify(ORDER)['idempotencyKey']
        scenario = json.dumps({'action': 'configure', 'idempotencyKey': key, 'scenario': ['hold_after_commit']}).encode()
        self.assertEqual(self.request('POST', '/__lab/scenarios', scenario, self.admin, {'Content-Type': 'application/json'})[0], 200)
        result = []
        def post():
            result.append(self.request('POST', '/v1/orders', json.dumps(ORDER).encode(), self.token, self.order_headers())[0])
        thread = threading.Thread(target=post)
        thread.start()
        deadline = time.monotonic() + 2
        while time.monotonic() < deadline and self.request('GET', '/v1/orders', token=self.token)[2]['count'] == 0:
            time.sleep(.02)
        self.assertEqual(self.request('GET', '/v1/orders/' + key, token=self.token)[0], 200)
        release = json.dumps({'action': 'release', 'idempotencyKey': key}).encode()
        self.assertEqual(self.request('POST', '/__lab/scenarios', release, self.admin, {'Content-Type': 'application/json'})[0], 200)
        thread.join(2)
        self.assertEqual(result, [201])

    def configure(self, key, scenario):
        body = json.dumps({'action': 'configure', 'idempotencyKey': key, 'scenario': scenario}).encode()
        return self.request('POST', '/__lab/scenarios', body, self.admin, {'Content-Type': 'application/json'})

    def test_readback_faults_are_durable_and_do_not_mutate_the_committed_order(self):
        key = identify(ORDER)['idempotencyKey']
        self.assertEqual(self.configure(key, ['healthy', 'mismatched_readback', 'readback_unavailable', 'readback_blocked'])[0], 200)
        self.assertEqual(self.request('POST', '/v1/orders', json.dumps(ORDER).encode(), self.token, self.order_headers())[0], 201)
        mismatch = self.request('GET', '/v1/orders/' + key, token=self.token)
        self.assertEqual(mismatch[0], 200)
        self.assertNotEqual(mismatch[2]['payloadDigest'], identify(ORDER)['payloadDigest'])
        self.assertEqual(self.request('GET', '/v1/orders/' + key, token=self.token)[0], 503)
        self.assertEqual(self.request('GET', '/v1/orders/' + key, token=self.token)[0], 423)
        observed = self.request('GET', '/v1/orders/' + key, token=self.token)
        self.assertEqual((observed[0], observed[2]['order']), (200, ORDER))

    def test_rollback_fault_leaves_no_order_or_phantom_audit_then_allows_retry(self):
        key = identify(ORDER)['idempotencyKey']
        self.assertEqual(self.configure(key, ['rollback_transaction'])[0], 200)
        status = self.request('POST', '/v1/orders', json.dumps(ORDER).encode(), self.token, self.order_headers())[0]
        self.assertEqual(status, 500)
        self.assertEqual(self.request('GET', '/v1/orders/' + key, token=self.token)[0], 404)
        self.assertEqual(self.request('GET', '/v1/orders', token=self.token)[2]['count'], 0)
        connection = sqlite3.connect(self.state / 'vendor.sqlite')
        try:
            self.assertEqual(connection.execute('SELECT COUNT(*) FROM request_audit').fetchone()[0], 0)
        finally:
            connection.close()
        self.assertEqual(self.request('POST', '/v1/orders', json.dumps(ORDER).encode(), self.token, self.order_headers())[0], 201)

    def test_post_fault_sequences_ignore_gets_and_survive_restart(self):
        key = identify(ORDER)['idempotencyKey']
        self.assertEqual(self.configure(key, ['429_twice'])[0], 200)
        body = json.dumps(ORDER).encode()
        self.assertEqual(self.request('POST', '/v1/orders', body, self.token, self.order_headers())[0], 429)
        self.restart_server()
        self.assertEqual(self.request('GET', '/v1/orders/' + key, token=self.token)[0], 404)
        self.assertEqual(self.request('POST', '/v1/orders', body, self.token, self.order_headers())[0], 429)
        self.assertEqual(self.request('POST', '/v1/orders', body, self.token, self.order_headers())[0], 201)
        for permanent, expected in (('401', 401), ('403', 403), ('422', 422)):
            order = {**ORDER, 'orderId': f'P-{permanent}'}
            other = identify(order)['idempotencyKey']
            self.assertEqual(self.configure(other, [permanent])[0], 200)
            self.assertEqual(self.request('POST', '/v1/orders', json.dumps(order).encode(), self.token, self.order_headers(order))[0], expected)
            self.assertEqual(self.request('POST', '/v1/orders', json.dumps(order).encode(), self.token, self.order_headers(order))[0], expected)

    def test_remaining_fixed_post_faults_and_exact_readback(self):
        body = json.dumps(ORDER).encode()
        cases = (('429_once', 429, 201), ('503_once', 503, 201), ('malformed_success', 200), ('timeout_after_commit',))
        for index, item in enumerate(cases):
            order = {**ORDER, 'orderId': f'F-{index}'}
            key = identify(order)['idempotencyKey']
            self.assertEqual(self.configure(key, [item[0]])[0], 200)
            if item[0] == 'timeout_after_commit':
                with self.assertRaises((TimeoutError, OSError)):
                    self.request('POST', '/v1/orders', json.dumps(order).encode(), self.token, self.order_headers(order))
                self.assertEqual(self.request('GET', '/v1/orders/' + key, token=self.token)[2]['order'], order)
                continue
            statuses = [self.request('POST', '/v1/orders', json.dumps(order).encode(), self.token, self.order_headers(order))[0] for _ in item[1:]]
            self.assertEqual(tuple(statuses), item[1:])
            if item[0] == 'malformed_success':
                self.assertEqual(self.request('GET', '/v1/orders/' + key, token=self.token)[2]['order'], order)

    def test_http_capacity_and_independent_clients(self):
        statuses = []
        def post(order, request_id):
            headers = self.order_headers(order); headers['X-Request-Id'] = request_id
            statuses.append(self.request('POST', '/v1/orders', json.dumps(order).encode(), self.token, headers)[0])
        first = {**ORDER, 'orderId': 'C-0'}
        threads = [threading.Thread(target=post, args=(first if i % 2 == 0 else {**first, 'quantity': 4}, f'c{i}')) for i in range(8)]
        for thread in threads: thread.start()
        for thread in threads: thread.join()
        self.assertEqual((statuses.count(201), statuses.count(200) + statuses.count(409)), (1, 7))
        for index in range(1, 100): post({**ORDER, 'orderId': f'C-{index}'}, f'fill{index}')
        overflow = {**ORDER, 'orderId': 'C-100'}
        post(overflow, 'overflow')
        listing = self.request('GET', '/v1/orders', token=self.token)[2]
        self.assertEqual((statuses[-1], listing['count']), (422, 100))
        self.assertLess(len(json.dumps(listing, separators=(',', ':')).encode()), 65536)


if __name__ == '__main__':
    unittest.main()
