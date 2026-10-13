import hashlib
import json
import math
import re


PARTNERS = {'northstar', 'orbit'}
REGIONS = {'North', 'South', 'East', 'West', 'Central'}
ORDER_ID = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$')
ORDER_FIELDS = {'schemaVersion', 'partner', 'orderId', 'region', 'quantity', 'amountMinor'}


def validate_order(value: object) -> dict:
    if not isinstance(value, dict) or set(value) != ORDER_FIELDS:
        raise ValueError('Order must contain only the required schema fields.')
    if value['schemaVersion'] != 1 or type(value['schemaVersion']) is not int:
        raise ValueError('schemaVersion must be 1.')
    if type(value['partner']) is not str or value['partner'] not in PARTNERS:
        raise ValueError('partner is not allowlisted.')
    if type(value['orderId']) is not str or not ORDER_ID.fullmatch(value['orderId']):
        raise ValueError('orderId has invalid syntax.')
    if type(value['region']) is not str or value['region'] not in REGIONS:
        raise ValueError('region is not configured.')
    for name, upper in (('quantity', 10000), ('amountMinor', 99999999999)):
        number = value[name]
        if type(number) is not int or isinstance(number, bool) or not math.isfinite(number) or not 1 <= number <= upper:
            raise ValueError(f'{name} is outside the allowed integer range.')
    return dict(value)


def _compact(value: object) -> str:
    return json.dumps(value, ensure_ascii=True, separators=(',', ':'))


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


def identify(order: dict) -> dict:
    valid = validate_order(order)
    business_key = _compact([valid['partner'], valid['orderId']])
    canonical = _compact([1, valid['partner'], valid['orderId'], valid['region'], valid['quantity'], valid['amountMinor']])
    return {
        'businessKey': business_key,
        'canonical': canonical,
        'payloadDigest': _sha256(canonical),
        'idempotencyKey': _sha256(_compact(['field-relay-mock-v1', valid['partner'], valid['orderId']])),
    }


def _object_without_duplicates(pairs: list[tuple[str, object]]) -> dict:
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('Duplicate JSON key.')
        result[key] = value
    return result


def _reject_constant(value: str) -> object:
    raise ValueError(f'Non-finite JSON number: {value}')


def decode_order(body: bytes) -> dict:
    try:
        value = json.loads(body.decode('utf-8'), object_pairs_hook=_object_without_duplicates, parse_constant=_reject_constant)
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
        raise ValueError('Invalid JSON order body.') from error
    return validate_order(value)
