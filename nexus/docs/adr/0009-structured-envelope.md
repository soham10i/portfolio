# 0009. A structured operating envelope

Date: 2026-10-30

## Status

Accepted (owner decision on open question Q2, before P2). Replaces the flat `envelope` map of
the v1 action contract.

## Context

In P0 an action's `envelope` was a flat map of names to numbers. A key ending in `_max` or
`_min` was read as a bound on the param named by the rest of the key, and every other key was
free-form. That made the meaning depend on spelling: `temp_rate_max_degc_per_min` would be read
as a bound on a param `temp_rate_max_degc_per`. P2's gate enforces the envelope, so the shape
has to be unambiguous before any code depends on it. No pack exists outside this repository yet,
so a breaking change is cheap now and expensive later.

## Decision

```yaml
envelope:
  params:                         # inclusive bounds on declared numeric params; gate + connector
    temp: {max: 240}
  limits:                         # named limits the connector enforces, e.g. rates
    temp_ramp_degc_per_minute: 10
```

- `envelope.params` maps a param name to `{min, max}` (at least one). The gate denies a proposal
  whose value is outside the bounds (`ENVELOPE_EXCEEDED`); the connector checks again.
- `envelope.limits` maps a name to a number. The gate does not interpret them; they are passed to
  the binding and are visible to CEL as `envelope.limits.<name>`.
- The semantic rule `ENVELOPE_PARAM_MISMATCH` now checks that every bounded param is declared,
  is `number` or `integer`, and that `min <= max`. The `_min`/`_max` suffix rule is gone.

The contract version stays `"1"`: nothing outside this repository has used v1.

## Alternatives considered

- **Keep the suffix rule.** No change, but the gate would inherit the ambiguity.
- **Put bounds only in the params JSON Schema (`minimum`/`maximum`).** Those describe what the
  connector accepts at all; the envelope is the narrower, operational range, and it is the part
  that changes per site. Keeping them separate lets a site tighten the envelope without editing
  the param types.

## Consequences

- Every example pack and test was converted; `stf.pack.yaml` now reads
  `params: {temp: {max: 240}}` and `limits: {temp_ramp_degc_per_minute: 10}`.
- Open question Q2 is resolved.
