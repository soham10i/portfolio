"""P2 A3-A7: the decision procedure, one case per row of P2.md §3, plus staleness, taint,
fail-closed and determinism."""

from __future__ import annotations

from datetime import timedelta

import pytest

from nexus.gate import ALLOW, DENY, NEEDS_APPROVAL, Policy, Snapshot, StateValue, evaluate

from .gate_support import NOW, fresh, lab_pack, proposal, snapshot

PACKS = {"lab": lab_pack()}
POLICY = Policy()
UNTRUSTED = [{"source": "doc", "ref": "corpus/manual.md#L3", "triggered": True}]


def decide(p=None, snap=None, policy=POLICY):
    return evaluate(p if p is not None else proposal(), PACKS, policy, snap or snapshot(), NOW)


# (id, proposal, snapshot, policy, outcome, codes, approvals_required)
CASES = [
    ("1 kill switch", proposal(), snapshot(kill_switch=True), POLICY, DENY, ["KILL_SWITCH"], 0),
    ("2 no rationale", proposal(rationale=""), None, POLICY, DENY, ["PROPOSAL_INVALID"], 0),
    ("2 not an object", ["x"], None, POLICY, DENY, ["PROPOSAL_INVALID"], 0),
    ("3 unknown pack", proposal("oven:tank.fill"), None, POLICY, DENY, ["UNKNOWN_ACTION"], 0),
    ("3 unknown action", proposal("lab:tank.melt"), None, POLICY, DENY, ["UNKNOWN_ACTION"], 0),
    ("4 below minimum", proposal(amount=-1), None, POLICY, DENY, ["PARAMS_INVALID"], 0),
    ("4 wrong type", proposal(amount="ten"), None, POLICY, DENY, ["PARAMS_INVALID"], 0),
    ("4 extra param", proposal(params={"amount": 1, "x": 2}), None, POLICY, DENY, ["PARAMS_INVALID"], 0),
    ("5 L0", proposal("lab:tank.watch"), None, POLICY, DENY, ["AUTONOMY_OBSERVE_ONLY"], 0),
    ("5 L1", proposal("lab:tank.drain"), None, POLICY, DENY, ["AUTONOMY_ADVISE_ONLY"], 0),
    (
        "5 policy caps L3 to L1",
        proposal(),
        None,
        Policy(max_autonomy={"lab": "L1"}),
        DENY,
        ["AUTONOMY_ADVISE_ONLY"],
        0,
    ),
    ("6 envelope", proposal(amount=60), None, POLICY, DENY, ["ENVELOPE_EXCEEDED"], 0),
    (
        "7 rate limit",
        proposal(),
        snapshot(recent_decisions={"lab:tank.fill": [fresh(5), fresh(30)]}),
        POLICY,
        DENY,
        ["RATE_LIMITED"],
        0,
    ),
    ("8 stale", proposal(), snapshot(age_s=11), POLICY, DENY, ["STATE_STALE"], 0),
    ("8 unknown", proposal("lab:tank.valve"), None, POLICY, DENY, ["STATE_UNKNOWN"], 0),
    ("8 error", proposal("lab:tank.broken"), None, POLICY, DENY, ["PRECONDITION_ERROR"], 0),
    ("8 not a bool", proposal("lab:tank.level_only"), None, POLICY, DENY, ["PRECONDITION_ERROR"], 0),
    ("8 false", proposal(), snapshot(mode="busy"), POLICY, DENY, ["PRECONDITION_FAILED"], 0),
    (
        "5-8 collect",
        proposal(amount=60),
        snapshot(level=90.0, mode="busy"),
        POLICY,
        DENY,
        ["ENVELOPE_EXCEEDED", "PRECONDITION_FAILED", "PRECONDITION_FAILED"],
        0,
    ),
    ("9 tainted trigger", proposal(context=UNTRUSTED), None, POLICY, NEEDS_APPROVAL, ["TAINTED_TRIGGER"], 1),
    (
        "9 no trigger",
        proposal(context=[{"source": "user", "ref": "msg/1", "triggered": False}]),
        None,
        POLICY,
        NEEDS_APPROVAL,
        ["NO_TRIGGER"],
        1,
    ),
    (
        "9 no trusted item",
        proposal(context=[{"source": "tool", "ref": "t/1", "triggered": False}]),
        None,
        POLICY,
        NEEDS_APPROVAL,
        ["NO_TRIGGER", "TAINTED_CONTEXT"],
        1,
    ),
    (
        "10 policy caps L3 to L2",
        proposal(),
        None,
        Policy(max_autonomy={"lab": "L2"}),
        NEEDS_APPROVAL,
        ["AUTONOMY_L2"],
        1,
    ),
    (
        "10 high risk",
        proposal("lab:tank.heat"),
        None,
        POLICY,
        NEEDS_APPROVAL,
        ["AUTONOMY_L2", "RISK_HIGH"],
        1,
    ),
    (
        "10 critical takes two",
        proposal("lab:tank.purge"),
        None,
        POLICY,
        NEEDS_APPROVAL,
        ["AUTONOMY_L2", "RISK_HIGH"],
        2,
    ),
    ("11 allow", proposal(), None, POLICY, ALLOW, [], 0),
    ("11 cap above the level", proposal(), None, Policy(max_autonomy={"lab": "L4"}), ALLOW, [], 0),
]


@pytest.mark.parametrize(
    ("p", "snap", "policy", "outcome", "codes", "approvals"),
    [c[1:] for c in CASES],
    ids=[c[0] for c in CASES],
)
def test_decision_table(p, snap, policy, outcome, codes, approvals):
    verdict = decide(p, snap, policy)
    assert (verdict.outcome, verdict.codes, verdict.approvals_required) == (outcome, codes, approvals)
    assert all(r.message for r in verdict.reasons)


def test_kill_switch_overrides_everything_else():
    verdict = decide(proposal(amount=60, context=UNTRUSTED), snapshot(kill_switch=True, mode="busy"))
    assert verdict.codes == ["KILL_SWITCH"]


def test_rate_limit_ignores_decisions_outside_the_window():
    old = {"lab:tank.fill": [NOW - timedelta(seconds=61), NOW - timedelta(seconds=60)]}
    assert decide(snap=snapshot(recent_decisions=old)).outcome == ALLOW
    one = {"lab:tank.fill": [fresh(1)]}
    assert decide(snap=snapshot(recent_decisions=one)).outcome == ALLOW


def test_state_versions_list_every_key_preconditions_read():
    assert decide().state_versions == {"tank.mode": 5, "tank.level": 3}


# ── A4: staleness ──────────────────────────────────────────────────────────────


@pytest.mark.parametrize(("age", "stale"), [(0, False), (10, False), (10.001, True), (3600, True)])
def test_staleness_boundary_is_max_age_s(age, stale):
    verdict = decide(snap=snapshot(age_s=age))
    assert ("STATE_STALE" in verdict.codes) is stale
    assert verdict.outcome == (DENY if stale else ALLOW)


def test_stale_message_names_the_key_and_its_age():
    (reason,) = decide(snap=snapshot(age_s=42)).reasons
    assert "tank.level" in reason.message and "42.0 s old (max 10 s)" in reason.message


def test_stale_state_no_precondition_reads_does_not_deny():
    stale_unread = snapshot(extra={("lab", "valve[2].open"): StateValue(True, 1, fresh(999))})
    assert decide(snap=stale_unread).outcome == ALLOW


# ── A5: taint ──────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("source", ["doc", "tool", "external"])
def test_untrusted_trigger_turns_allow_into_approval_and_quotes_the_ref(source):
    context = [
        {"source": "user", "ref": "msg/1", "triggered": False},
        {"source": source, "ref": "item/7", "triggered": True},
    ]
    verdict = decide(proposal(context=context))
    assert (verdict.outcome, verdict.codes) == (NEEDS_APPROVAL, ["TAINTED_TRIGGER"])
    assert "'item/7'" in verdict.reasons[0].message and source in verdict.reasons[0].message


@pytest.mark.parametrize("source", ["user", "system"])
def test_trusted_trigger_with_untrusted_context_is_allowed(source):
    context = [
        {"source": source, "ref": "msg/1", "triggered": True},
        {"source": "doc", "ref": "corpus/a.md", "triggered": False},
    ]
    assert decide(proposal(context=context)).outcome == ALLOW


@pytest.mark.parametrize(
    "p",
    [proposal(amount=60, context=UNTRUSTED), proposal("lab:tank.watch", context=UNTRUSTED)],
    ids=["envelope", "L0"],
)
def test_taint_never_upgrades_a_deny(p):
    verdict = decide(p)
    assert verdict.outcome == DENY and "TAINTED_TRIGGER" not in verdict.codes


# ── A6: fail closed ────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "snap",
    [
        snapshot(level="full"),  # wrong type: invisible, so unknown
        snapshot(level=None),
        Snapshot({("lab", "tank.mode"): StateValue("idle", 1, fresh())}),  # missing key
        Snapshot(
            {
                ("other", "tank.level"): StateValue(1.0, 1, fresh()),  # another pack's entity
                ("lab", "tank.mode"): StateValue("idle", 1, fresh()),
            }
        ),
        Snapshot(
            {
                ("lab", "tank.level.raw"): StateValue(1.0, 1, fresh()),  # undeclared key
                ("lab", "tank.mode"): StateValue("idle", 1, fresh()),
            }
        ),
    ],
    ids=["wrong-type", "null", "missing", "other-entity", "undeclared"],
)
def test_bad_or_missing_state_is_state_unknown(snap):
    verdict = decide(snap=snap)
    assert (verdict.outcome, verdict.codes) == (DENY, ["STATE_UNKNOWN"])
    assert "tank.level" in verdict.reasons[0].message


@pytest.mark.parametrize("p", [None, 42, "x", {}, {"action": 7}, proposal(action="nocolon")])
def test_garbage_proposals_are_denied_not_raised(p):
    verdict = evaluate(p, PACKS, POLICY, snapshot(), NOW)
    assert verdict.outcome == DENY and verdict.codes == ["PROPOSAL_INVALID"]


def test_long_reason_messages_are_truncated_to_the_schema_limit():
    context = [{"source": "doc", "ref": "r" * 256, "triggered": True}]
    (reason,) = decide(proposal(context=context)).reasons
    assert len(reason.message) <= 500


# ── A7: determinism ────────────────────────────────────────────────────────────


def test_same_inputs_give_the_same_verdict_1000_times():
    cases = [(c[1], c[2], c[3]) for c in CASES]
    first = [decide(*c) for c in cases]
    for _ in range(1000 // len(cases) + 1):
        assert [decide(*c) for c in cases] == first


@pytest.mark.parametrize(("integer", "double"), [(10, 10.0), (50, 50.0), (0, 0.0)])
def test_int_and_double_params_decide_alike(integer, double):
    assert decide(proposal(amount=integer)) == decide(proposal(amount=double))


def test_int_and_double_at_the_envelope_and_precondition_edges():
    assert decide(proposal(amount=50)).outcome == ALLOW
    assert decide(proposal(amount=50.0001)).codes == ["ENVELOPE_EXCEEDED"]
    full = snapshot(level=50)  # an integer in a 'number' observable
    assert decide(proposal(amount=50), full).outcome == ALLOW
    assert decide(proposal(amount=50.5), snapshot(level=50)).codes == [
        "ENVELOPE_EXCEEDED",
        "PRECONDITION_FAILED",
    ]
