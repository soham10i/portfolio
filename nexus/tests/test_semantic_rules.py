"""A4: each semantic rule, on in-memory documents derived from the valid examples."""

from __future__ import annotations

import copy

import pytest

from nexus.contracts import load_document, validate

from .support import EXAMPLES

VALID = EXAMPLES / "valid"


def base(name: str) -> dict:
    return copy.deepcopy(load_document(VALID / name))


def codes(kind: str, doc: dict) -> list[tuple[str, str]]:
    return [(i.code, i.pointer) for i in validate(kind, doc)]


def test_duplicate_action():
    doc = base("stf.pack.yaml")
    doc["actions"].append(copy.deepcopy(doc["actions"][0]))
    assert codes("pack", doc) == [("DUPLICATE_ACTION", "/actions/4/id")]


def test_duplicate_observable():
    doc = base("stf.pack.yaml")
    doc["observables"].insert(1, copy.deepcopy(doc["observables"][0]))
    assert codes("pack", doc) == [("DUPLICATE_OBSERVABLE", "/observables/1/id")]


def test_unknown_sandbox():
    doc = base("stf.pack.yaml")
    doc["sandboxes"] = []
    assert codes("pack", doc) == [
        ("UNKNOWN_SANDBOX", "/actions/1/sandbox"),
        ("UNKNOWN_SANDBOX", "/actions/2/sandbox"),
    ]


def test_unknown_compensation():
    doc = base("echo.pack.yaml")
    doc["actions"][0]["compensation"]["action"] = "echo.shout"
    assert codes("pack", doc) == [("UNKNOWN_COMPENSATION", "/actions/0/compensation/action")]


def test_compensation_cycle_through_another_action():
    doc = base("echo.pack.yaml")
    other = copy.deepcopy(doc["actions"][0])
    other["id"] = "echo.unsay"
    doc["actions"][0]["compensation"]["action"] = "echo.unsay"
    doc["actions"].append(other)  # echo.unsay compensates with echo.say
    assert codes("pack", doc) == [
        ("SELF_COMPENSATION_LOOP", "/actions/0/compensation/action"),
        ("SELF_COMPENSATION_LOOP", "/actions/1/compensation/action"),
    ]


def test_self_compensation_is_allowed():
    # oven.set_zone_temp restores the previous setpoint with itself; see OPEN_QUESTIONS.md
    doc = base("stf.pack.yaml")
    assert doc["actions"][1]["compensation"]["action"] == doc["actions"][1]["id"]
    assert codes("pack", doc) == []


def test_chain_into_a_self_compensating_action_is_allowed():
    doc = base("stf.pack.yaml")
    doc["actions"][3]["compensation"]["action"] = "oven.set_zone_temp"
    doc["actions"][3]["compensation"]["params"] = {"zone": "1", "temp": "150"}
    assert codes("pack", doc) == []


def test_envelope_param_mismatch_in_pack_and_action():
    doc = base("stf.pack.yaml")
    doc["actions"][1]["envelope"]["params"]["pressure"] = {"min": 1}
    assert codes("pack", doc) == [("ENVELOPE_PARAM_MISMATCH", "/actions/1/envelope/params/pressure")]
    action = base("echo-say.action.yaml")
    action["envelope"] = {"params": {"volume": {"max": 3}}, "limits": {"text_max": 10, "budget": 5}}
    assert codes("action", action) == [("ENVELOPE_PARAM_MISMATCH", "/envelope/params/volume")]


def test_envelope_bounds_must_be_numeric_params_and_not_inverted():
    action = base("echo-say.action.yaml")
    action["envelope"] = {"params": {"text": {"max": 3}}}
    assert codes("action", action) == [("ENVELOPE_PARAM_MISMATCH", "/envelope/params/text")]
    doc = base("stf.pack.yaml")
    doc["actions"][1]["envelope"]["params"]["temp"] = {"min": 200, "max": 180}
    assert codes("pack", doc) == [("ENVELOPE_PARAM_MISMATCH", "/actions/1/envelope/params/temp")]
    doc["actions"][1]["envelope"]["params"]["temp"] = {"min": 180, "max": 180}
    assert codes("pack", doc) == []


@pytest.mark.parametrize(
    "envelope", [{}, {"params": {"temp": {}}}, {"temp_max": 240}, {"params": {"temp": {"max": "240"}}}]
)
def test_envelope_shape_is_enforced_by_the_schema(envelope):
    doc = base("stf.pack.yaml")
    doc["actions"][1]["envelope"] = envelope
    assert {code for code, _ in codes("pack", doc)} == {"SCHEMA"}


@pytest.mark.parametrize("path", ["../x", "a/../../b", "/etc", "~/x", "C:/x", "file:///etc", "https://x/y"])
def test_path_escape_in_knowledge(path):
    doc = base("stf.pack.yaml")
    doc["knowledge"] = ["corpus/", path]
    assert codes("pack", doc) == [("PATH_ESCAPE", "/knowledge/1")]


@pytest.mark.parametrize(
    ("spec", "ok"),
    [
        ("api/openapi.yaml", True),
        ("https://example.com/o.json", True),
        ("../openapi.yaml", False),
        ("http://example.com/o.json", False),
    ],
)
def test_path_escape_in_openapi_spec(spec, ok):
    doc = base("echo.pack.yaml")
    doc["connector"] = {"kind": "openapi", "spec": spec, "base_url_env": "ECHO_URL"}
    assert codes("pack", doc) == ([] if ok else [("PATH_ESCAPE", "/connector/spec")])


@pytest.mark.parametrize(("name", "required"), [("needs-approval", 0), ("allow", 1), ("deny", 2)])
def test_approvals_mismatch(name, required):
    doc = base(f"{name}.decision.json")
    doc["approvals_required"] = required
    assert codes("decision", doc) == [("APPROVALS_MISMATCH", "/approvals_required")]


@pytest.mark.parametrize(("name", "prev"), [("genesis", "0" * 64), ("second", None)])
def test_prev_hash_rule(name, prev):
    doc = base(f"{name}.event.json")
    doc["prev_hash"] = prev
    assert codes("event", doc) == [("PREV_HASH_RULE", "/prev_hash")]


def test_trigger_count_in_proposal_and_evidence():
    doc = base("set-zone-temp.proposal.json")
    for item in doc["context"]:
        item["triggered"] = True
    expected = [("TRIGGER_COUNT", f"/context/{i}/triggered") for i in range(1, len(doc["context"]))]
    assert codes("proposal", doc) == expected
    evidence = base("set-zone-temp.evidence.json")
    evidence["proposal"] = doc
    assert codes("evidence", evidence) == [(c, "/proposal" + p) for c, p in expected]


def test_semantic_rules_wait_for_a_structurally_valid_document():
    doc = base("stf.pack.yaml")
    doc["actions"].append(copy.deepcopy(doc["actions"][0]))
    doc["version"] = "1.0"
    assert {c for c, _ in codes("pack", doc)} == {"SCHEMA"}


def test_issues_are_sorted_and_deterministic():
    doc = base("stf.pack.yaml")
    doc["sandboxes"] = []
    doc["actions"].append(copy.deepcopy(doc["actions"][0]))
    first = validate("pack", doc)
    assert first == sorted(first) == validate("pack", copy.deepcopy(doc))


def test_pointer_escapes_tilde_and_slash():
    doc = base("genesis.event.json")
    doc["payload"] = {}
    doc["extra/key~"] = 1
    (issue,) = validate("event", doc)
    assert issue.code == "SCHEMA" and issue.pointer == ""
    assert "extra/key~" in issue.message
