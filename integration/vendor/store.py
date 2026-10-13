import json
import secrets
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

from .contract import identify, validate_order


SCHEMA_VERSION = 1
MAX_ORDERS = 100


class VendorStore:
    def __init__(self, path: Path, mode: str):
        if mode not in ('new', 'resume'):
            raise ValueError('mode must be new or resume')
        self.path = Path(path)
        self.db_path = self.path / 'vendor.sqlite'
        if mode == 'new':
            if self.path.exists():
                raise ValueError('new mode requires a new state directory')
            self.path.mkdir(parents=True)
            self._initialize()
        else:
            if not self.db_path.is_file():
                raise ValueError('resume mode requires an existing vendor database')
            self._verify()

    def _connect(self):
        connection = sqlite3.connect(self.db_path, timeout=.25, isolation_level=None)
        connection.row_factory = sqlite3.Row
        connection.execute('PRAGMA foreign_keys = ON')
        connection.execute('PRAGMA busy_timeout = 250')
        return connection

    def _initialize(self):
        connection = self._connect()
        try:
            connection.executescript('''
                PRAGMA journal_mode = WAL;
                CREATE TABLE metadata (name TEXT PRIMARY KEY, value TEXT NOT NULL);
                CREATE TABLE orders (
                    id INTEGER PRIMARY KEY,
                    idempotency_key TEXT NOT NULL UNIQUE,
                    business_key TEXT NOT NULL UNIQUE,
                    canonical TEXT NOT NULL,
                    payload_digest TEXT NOT NULL,
                    order_json TEXT NOT NULL,
                    vendor_order_id TEXT NOT NULL UNIQUE,
                    committed_at TEXT NOT NULL
                );
                CREATE TABLE request_audit (
                    id INTEGER PRIMARY KEY,
                    request_id TEXT NOT NULL,
                    idempotency_key TEXT,
                    event TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE scenarios (
                    idempotency_key TEXT PRIMARY KEY,
                    sequence_json TEXT NOT NULL,
                    next_index INTEGER NOT NULL DEFAULT 0,
                    request_count INTEGER NOT NULL DEFAULT 0
                );
            ''')
            connection.execute('INSERT INTO metadata(name, value) VALUES (?, ?)', ('schemaVersion', str(SCHEMA_VERSION)))
            connection.execute('INSERT INTO metadata(name, value) VALUES (?, ?)', ('storeId', 'store-' + secrets.token_hex(12)))
        finally:
            connection.close()

    def _verify(self):
        try:
            connection = self._connect()
            version = connection.execute("SELECT value FROM metadata WHERE name='schemaVersion'").fetchone()
            store_id = connection.execute("SELECT value FROM metadata WHERE name='storeId'").fetchone()
            if version is None or store_id is None or version['value'] != str(SCHEMA_VERSION):
                raise ValueError('vendor database has an unknown schema version')
        except sqlite3.DatabaseError as error:
            raise ValueError('vendor database is corrupt') from error
        finally:
            if 'connection' in locals():
                connection.close()

    def _store_id(self, connection):
        return connection.execute("SELECT value FROM metadata WHERE name='storeId'").fetchone()['value']

    @staticmethod
    def _now():
        return datetime.now(UTC).isoformat(timespec='milliseconds').replace('+00:00', 'Z')

    def _receipt(self, row, replayed=None):
        receipt = {
            'schemaVersion': 1, 'vendorOrderId': row['vendor_order_id'],
            'idempotencyKey': row['idempotency_key'], 'businessKey': row['business_key'],
            'payloadDigest': row['payload_digest'], 'order': json.loads(row['order_json']),
            'committedAt': row['committed_at'], 'storeId': row['store_id'],
        }
        if replayed is not None:
            receipt['replayed'] = replayed
        return receipt

    def create_or_replay(self, order: dict, key: str, request_id: str):
        valid = validate_order(order)
        identity = identify(valid)
        if key != identity['idempotencyKey']:
            return 409, {'code': 'idempotency_key_mismatch'}
        connection = self._connect()
        try:
            connection.execute('BEGIN IMMEDIATE')
            row = connection.execute('''SELECT orders.*, (SELECT value FROM metadata WHERE name='storeId') store_id
                FROM orders WHERE idempotency_key=?''', (key,)).fetchone()
            if row:
                if row['canonical'] == identity['canonical']:
                    connection.execute('INSERT INTO request_audit(request_id,idempotency_key,event,created_at) VALUES(?,?,?,?)', (request_id, key, 'replay', self._now()))
                    connection.commit()
                    return 200, self._receipt(row, True)
                connection.execute('INSERT INTO request_audit(request_id,idempotency_key,event,created_at) VALUES(?,?,?,?)', (request_id, key, 'conflict', self._now()))
                connection.commit()
                return 409, {'code': 'idempotency_conflict'}
            business = connection.execute('SELECT 1 FROM orders WHERE business_key=?', (identity['businessKey'],)).fetchone()
            if business:
                connection.execute('INSERT INTO request_audit(request_id,idempotency_key,event,created_at) VALUES(?,?,?,?)', (request_id, key, 'business_conflict', self._now()))
                connection.commit()
                return 409, {'code': 'business_key_conflict'}
            count = connection.execute('SELECT COUNT(*) count FROM orders').fetchone()['count']
            if count >= MAX_ORDERS:
                connection.execute('INSERT INTO request_audit(request_id,idempotency_key,event,created_at) VALUES(?,?,?,?)', (request_id, key, 'capacity_rejected', self._now()))
                connection.commit()
                return 422, {'code': 'order_capacity_reached'}
            committed_at = self._now()
            vendor_order_id = 'vendor-' + secrets.token_hex(12)
            connection.execute('''INSERT INTO orders(idempotency_key,business_key,canonical,payload_digest,order_json,vendor_order_id,committed_at)
                VALUES(?,?,?,?,?,?,?)''', (key, identity['businessKey'], identity['canonical'], identity['payloadDigest'], json.dumps(valid, separators=(',', ':')), vendor_order_id, committed_at))
            connection.execute('INSERT INTO request_audit(request_id,idempotency_key,event,created_at) VALUES(?,?,?,?)', (request_id, key, 'committed', committed_at))
            row = connection.execute('''SELECT orders.*, (SELECT value FROM metadata WHERE name='storeId') store_id
                FROM orders WHERE idempotency_key=?''', (key,)).fetchone()
            connection.commit()
            return 201, self._receipt(row, False)
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def get_order(self, key: str):
        connection = self._connect()
        try:
            row = connection.execute('''SELECT orders.*, (SELECT value FROM metadata WHERE name='storeId') store_id
                FROM orders WHERE idempotency_key=?''', (key,)).fetchone()
            return self._receipt(row) if row else None
        finally:
            connection.close()

    def list_orders(self):
        connection = self._connect()
        try:
            rows = connection.execute('SELECT idempotency_key,business_key,payload_digest,vendor_order_id,committed_at FROM orders ORDER BY id').fetchall()
            return {'schemaVersion': 1, 'storeId': self._store_id(connection), 'count': len(rows), 'orders': [
                {'idempotencyKey': row['idempotency_key'], 'businessKey': row['business_key'], 'payloadDigest': row['payload_digest'], 'vendorOrderId': row['vendor_order_id'], 'committedAt': row['committed_at']} for row in rows]}
        finally:
            connection.close()

    def consume_scenario(self, key):
        connection = self._connect()
        try:
            connection.execute('BEGIN IMMEDIATE')
            row = connection.execute('SELECT * FROM scenarios WHERE idempotency_key=?', (key,)).fetchone()
            if not row:
                connection.commit(); return 'healthy', 0
            sequence = json.loads(row['sequence_json'])
            index = row['next_index']
            action = sequence[index] if index < len(sequence) else 'healthy'
            connection.execute('UPDATE scenarios SET next_index=?, request_count=request_count+1 WHERE idempotency_key=?', (index + 1, key))
            connection.commit()
            return action, index + 1
        finally:
            connection.close()

    def configure_scenario(self, key, sequence):
        connection = self._connect()
        try:
            connection.execute('BEGIN IMMEDIATE')
            connection.execute('INSERT INTO scenarios(idempotency_key,sequence_json,next_index,request_count) VALUES(?,?,0,0) ON CONFLICT(idempotency_key) DO UPDATE SET sequence_json=excluded.sequence_json,next_index=0,request_count=0', (key, json.dumps(sequence, separators=(',', ':'))))
            connection.commit()
        finally:
            connection.close()

    def observe_scenario(self, key):
        connection = self._connect()
        try:
            row = connection.execute('SELECT next_index,request_count FROM scenarios WHERE idempotency_key=?', (key,)).fetchone()
            return {'phase': 'configured' if row else 'healthy', 'sequence': row['next_index'] if row else 0, 'requestCount': row['request_count'] if row else 0}
        finally:
            connection.close()

    def close(self):
        return None
