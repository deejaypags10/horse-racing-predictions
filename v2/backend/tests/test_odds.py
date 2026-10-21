import math

import pytest

from edge.odds import decimal_to_us, fair_decimal, market_probabilities, overround, parse_odds


@pytest.mark.parametrize("raw,decimal", [
    ("5-2", 3.5), ("5/2", 3.5), ("9-5", 2.8), ("EVEN", 2.0), ("evs", 2.0), ("12", 13.0), (12, 13.0),
    ("1-9", 1 + 1 / 9), ({"numerator": 5, "denominator": 2}, 3.5), ({"numerator": 12, "denominator": None}, 13.0),
    (" 7 - 2 ", 4.5), ("99-1", 100.0),
])
def test_parse_odds(raw, decimal):
    o = parse_odds(raw)
    assert o is not None and math.isclose(o.decimal, decimal, rel_tol=1e-3)


@pytest.mark.parametrize("raw", [None, "", "SCR", "abc", "5-0", -3, {"numerator": None}, "0"])
def test_parse_odds_rejects(raw):
    assert parse_odds(raw) is None


def test_odds_are_clamped():
    assert parse_odds("1-100").decimal == 1.05
    assert parse_odds("5000-1").decimal == 1000.0


def test_decimal_bare_numbers_when_not_to_one():
    assert parse_odds("3.5", to_one=False).decimal == 3.5


def test_market_probabilities_sum_to_one_and_skip_missing():
    q = market_probabilities([3.5, 2.8, None, 6.0])
    assert q[2] is None
    assert math.isclose(sum(x for x in q if x is not None), 1.0)
    assert overround([2.0, 3.0, 4.0]) > 1.0


def test_power_correction_sharpens_favourite():
    flat = market_probabilities([2.0, 5.0, 10.0])
    sharp = market_probabilities([2.0, 5.0, 10.0], power=1.2)
    assert sharp[0] > flat[0] and sharp[2] < flat[2]


def test_fair_and_us_rendering():
    assert fair_decimal(0.25) == 4.0
    assert fair_decimal(0) is None
    assert decimal_to_us(3.5) == "5-2"
    assert decimal_to_us(2.8) == "9-5"
    assert decimal_to_us(13.0) == "12-1"
    assert decimal_to_us(1.0) is None
