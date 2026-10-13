import json
import unittest
from pathlib import Path

from integration.vendor.contract import decode_order, identify, validate_order


ROOT = Path(__file__).parents[1]
VECTORS = json.loads((ROOT / 'fixtures' / 'contract-vectors.json').read_text(encoding='utf-8'))
VALID = VECTORS[0]['order']


class ContractTests(unittest.TestCase):
    def test_shared_vectors_pin_independent_identity(self):
        for vector in VECTORS:
            self.assertEqual(identify(validate_order(vector['order'])), {
                key: vector[key] for key in ('businessKey', 'canonical', 'payloadDigest', 'idempotencyKey')
            })

    def test_validation_rejects_wrong_types_bounds_and_unknown_fields(self):
        self.assertEqual(validate_order({**VALID, 'quantity': 1, 'amountMinor': 1})['quantity'], 1)
        self.assertEqual(validate_order({**VALID, 'quantity': 10000, 'amountMinor': 99999999999})['amountMinor'], 99999999999)
        invalid = [
            {**VALID, 'extra': 'no'}, {**VALID, 'schemaVersion': '1'}, {**VALID, 'partner': 1},
            {**VALID, 'orderId': 7}, {**VALID, 'region': []}, {**VALID, 'quantity': '3'},
            {**VALID, 'amountMinor': '4250'}, {**VALID, 'schemaVersion': True}, {**VALID, 'partner': 'other'},
            {**VALID, 'orderId': '-bad'}, {**VALID, 'orderId': 'a' * 65}, {**VALID, 'orderId': 'é'},
            {**VALID, 'region': 'north'}, {**VALID, 'quantity': True}, {**VALID, 'amountMinor': False},
            {**VALID, 'quantity': 1.5}, {**VALID, 'amountMinor': 1.5}, {**VALID, 'quantity': 0},
            {**VALID, 'quantity': 10001}, {**VALID, 'amountMinor': 0}, {**VALID, 'amountMinor': 100000000000},
        ]
        for field in VALID:
            candidate = dict(VALID)
            del candidate[field]
            invalid.append(candidate)
        for candidate in invalid:
            with self.subTest(candidate=candidate):
                with self.assertRaises(ValueError):
                    validate_order(candidate)

    def test_decode_order_rejects_duplicate_keys_and_non_object(self):
        with self.assertRaises(ValueError):
            decode_order(b'{"schemaVersion":1,"schemaVersion":1}')
        with self.assertRaises(ValueError):
            decode_order(b'[]')
        for number in (b'NaN', b'Infinity', b'-Infinity'):
            with self.subTest(number=number):
                with self.assertRaises(ValueError):
                    decode_order(b'{"schemaVersion":' + number + b'}')


if __name__ == '__main__':
    unittest.main()
