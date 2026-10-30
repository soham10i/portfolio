# Open questions

Ambiguities found while building a part. Each entry: the question, the interim answer
used, and who decides. Resolved entries move to an ADR.

## P0

### Q1. May an action compensate with itself?

The brief names the rule `SELF_COMPENSATION_LOOP` but defines it as "compensation chains must not
cycle (A→B→A)". Restoring a previous setpoint is naturally done by the same action
(`oven.set_zone_temp` with `prev.…setpoint`), and the blueprint's examples do exactly that.

**Interim:** a self-compensation (A→A) is allowed, because a compensation is never itself
compensated. Only cycles through at least one other action are rejected. Every action on the
cycle is reported. **Decides:** owner, before P3 (execution and rollback).

### Q2. Envelope keys that end in `_min` or `_max` but are not parameter bounds

`ENVELOPE_PARAM_MISMATCH` treats any envelope key ending in `_max`/`_min` as a bound on the param
named by the prefix. A key like `temp_rate_max_degc_per_min` is therefore read as a bound on a
param `temp_rate_max_degc_per`. The STF example uses `temp_ramp_degc_per_minute` to avoid this.

**Interim:** keep the suffix rule as specified; other envelope keys are free-form. **Better,
for P2:** make the envelope structured (`{param: {min, max}}` plus named limits) when CEL
evaluation arrives. That is a contract change and needs an ADR. **Decides:** owner, in P2.

### Q3. How exactly is schema ↔ pydantic parity checked?

The brief asks for the same valid/invalid verdict from `validate()` and the model on every example,
with semantic-only cases excluded and listed. Semantic rules are not in the models.

**Interim:** `tests/test_parity.py` lists the ten semantic-only invalid examples explicitly
(and checks the list is exactly the invalid examples without `SCHEMA` in their codes). For them it
asserts the model *accepts* the document; for every other example the verdicts must be equal.
**Decides:** owner; revisit if the models gain semantic validators.

### Q4. Do semantic rules run on structurally invalid documents?

**Interim:** no. Semantic rules run only when there are no `SCHEMA` issues, so they can rely on
the shape and never crash on missing fields. A document can therefore need two fix rounds.
**Decides:** owner; acceptable for a CLI, revisit for an editor integration.

### Q5. YAML timestamps

`yaml.safe_load` turns `2026-10-30T10:00:00Z` into a `datetime`, which then fails the
`date-time` string format and differs from the same document in JSON.

**Interim:** the loader is a `SafeLoader` subclass with only the implicit timestamp resolver
removed, so timestamps stay strings, exactly as in JSON. It is still a safe loader (no arbitrary
objects). **Decides:** settled unless an objection appears.

### Q6. `ValidationIssue` field order

The brief writes `ValidationIssue(code, pointer, message)` and also asks for issues sorted by
pointer. The dataclass is declared `(pointer, code, message)` with `order=True`, so the natural
sort is by pointer. Fields are always used by name.

**Interim:** keep `(pointer, code, message)`. **Decides:** owner; trivial to change before P1.

### Q7. Licence check strings

`pip-licenses` reports licence names as packages declare them, so the deny list matches partial
strings: `GPL;AGPL;LGPL;GNU General Public License;GNU Affero General Public License;GNU Lesser
General Public License` with `--partial-match` (Makefile `LICENSE_DENY`). Note that "LGPL" and
"GPL" also match any licence *name* containing those letters.

**Interim:** this list. If a permissive package is ever flagged by a partial match, add an
explicit `--ignore-packages` entry with a comment, never a broader exception. **Decides:** owner.

### Q8. psycopg is LGPL, which the licence rule forbids

The brief lists `psycopg[binary]` for the DB test, and its licence rule forbids LGPL;
`pip-licenses` reports psycopg 3.3.6 as `LGPL-3.0-only`.

**Interim:** asyncpg (Apache-2.0) replaces psycopg, recorded in ADR-0007. **Decides:** owner,
before P1 picks the runtime driver. If psycopg is preferred, the licence rule needs an explicit
LGPL exception instead.
