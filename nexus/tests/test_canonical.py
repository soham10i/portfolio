"""P1 A2, A3: RFC 8785 canonical JSON, and real hashes on the example events."""

from __future__ import annotations

import json
import math
import struct

import pytest

from nexus.store.canonical import canonical_json, event_hash

from .support import EXAMPLES


def _f(bits: int) -> float:
    return struct.unpack(">d", bits.to_bytes(8, "big"))[0]


def test_rfc8785_section_3_2_2_example():
    data = {
        "numbers": [333333333.33333329, 1e30, 4.50, 2e-3, 0.000000000000000000000000001],
        "string": '\N{EURO SIGN}$\x0f\nA\'B"\\\\"/',
        "literals": [None, True, False],
    }
    assert canonical_json(data) == (
        b'{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],'
        b'"string":"\xe2\x82\xac$\\u000f\\nA\'B\\"\\\\\\\\\\"/"}'
    )


def test_rfc8785_key_order_is_utf16_not_code_points():
    data = {
        "\N{EURO SIGN}": "Euro Sign",
        "\r": "Carriage Return",
        "\N{HEBREW LETTER DALET WITH DAGESH}": "Hebrew Letter Dalet With Dagesh",
        "1": "One",
        "\U0001f600": "Emoji: Grinning Face",
        "\u0080": "Control",
        "\N{LATIN SMALL LETTER O WITH DIAERESIS}": "Latin Small Letter O With Diaeresis",
    }
    keys = list(json.loads(canonical_json(data)))
    assert keys == [
        "\r",
        "1",
        "\u0080",
        "\N{LATIN SMALL LETTER O WITH DIAERESIS}",
        "\N{EURO SIGN}",
        "\U0001f600",
        "\N{HEBREW LETTER DALET WITH DAGESH}",
    ]


# RFC 8785 Appendix B: IEEE 754 bit patterns and their ECMAScript serialisation.
NUMBER_VECTORS = [
    (0x0000000000000000, "0"),
    (0x8000000000000000, "0"),
    (0x0000000000000001, "5e-324"),
    (0x8000000000000001, "-5e-324"),
    (0x7FEFFFFFFFFFFFFF, "1.7976931348623157e+308"),
    (0xFFEFFFFFFFFFFFFF, "-1.7976931348623157e+308"),
    (0x4340000000000000, "9007199254740992"),
    (0xC340000000000000, "-9007199254740992"),
    (0x4430000000000000, "295147905179352830000"),
    (0x44B52D02C7E14AF5, "9.999999999999997e+22"),
    (0x44B52D02C7E14AF6, "1e+23"),
    (0x44B52D02C7E14AF7, "1.0000000000000001e+23"),
    (0x444B1AE4D6E2EF4E, "999999999999999700000"),
    (0x444B1AE4D6E2EF4F, "999999999999999900000"),
    (0x444B1AE4D6E2EF50, "1e+21"),
    (0x3EB0C6F7A0B5ED8C, "9.999999999999997e-7"),
    (0x3EB0C6F7A0B5ED8D, "0.000001"),
    (0x41B3DE4355555553, "333333333.3333332"),
    (0x41B3DE4355555554, "333333333.33333325"),
    (0x41B3DE4355555555, "333333333.3333333"),
    (0x41B3DE4355555556, "333333333.3333334"),
    (0x41B3DE4355555557, "333333333.33333343"),
    (0xBECBF647612F3696, "-0.0000033333333333333333"),
    (0x43143FF3C1CB0959, "1424953923781206.2"),
]


@pytest.mark.parametrize(("bits", "expected"), NUMBER_VECTORS, ids=[e for _, e in NUMBER_VECTORS])
def test_rfc8785_number_serialisation(bits, expected):
    assert canonical_json(_f(bits)).decode() == expected


@pytest.mark.parametrize("value", [math.nan, math.inf, -math.inf, 2**53, -(2**53)])
def test_values_jcs_cannot_represent_exactly_are_rejected(value):
    with pytest.raises(ValueError):
        canonical_json({"x": value})


def _example(name: str) -> dict:
    return json.loads((EXAMPLES / "valid" / f"{name}.event.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("name", ["genesis", "second"])
def test_example_events_carry_their_real_hash(name):
    event = _example(name)
    assert event["hash"] == event_hash(event)


def test_second_example_links_to_genesis():
    genesis, second = _example("genesis"), _example("second")
    assert (second["stream"], second["seq"]) == (genesis["stream"], 2)
    assert second["prev_hash"] == genesis["hash"]


def test_hash_ignores_the_hash_field_and_nothing_else():
    event = _example("genesis")
    assert event_hash({**event, "hash": "0" * 64}) == event["hash"]
    assert event_hash({**event, "payload": {"user": "someone else"}}) != event["hash"]
