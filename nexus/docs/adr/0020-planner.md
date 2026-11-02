# 0020. The planner proposes; code and the gate decide

Date: 2026-10-31

## Status

Accepted (P6).

## Context

P6 adds the first component in which a language model chooses actions. The model can be wrong,
can be steered by text in a document it is shown (prompt injection), and can be confidently
wrong in a way that looks plausible. The P2 gate already decides every proposal, and only
`user` and `system` triggers authorize (blueprint §4.5). The planner must not weaken either.

## Decision

- **Only a candidate plan comes from the model.** Everything after that is deterministic code:
  - the catalog (L2+ actions only, effective autonomy after the policy cap);
  - the checks (known action, params schema, unique ids, dependencies inside the plan and
    acyclic, known context ids, `max_steps`);
  - the taint mapping, the dependency order and the gate call.
  `Planner` has no executor and no binding; it stops at `gate.decide`.
- **The planner writes the proposal's context, not the model.** The request is the only `user`
  item. Every context item keeps its own source (`tool`, `doc` or `external`; `ContextItem`
  refuses `user` and `system`). Exactly one item is the trigger.
- **A `user` trigger has to be earned.** A step keeps it only if it relied on the request
  (`uses` contains `user`) and the critic marked it `requested: true`. A missing review counts
  as not requested. Otherwise the step is retriggered by the context item it used, so the gate
  answers NEEDS_APPROVAL with TAINTED_TRIGGER. With no such item it is dropped, together with
  every step that depends on it.
- **A critic call reviews every plan** before the gate, with the same free budget. Its verdict
  is accept, revise (feed the problems back, next round) or abstain.
- **No revision after a gate DENY.** The planner reports the gate's reasons; it does not re-plan
  to find a variant the gate would allow. Dependents of a denied step are `blocked`.
- **Abstaining is an answer.** `plan.abstained` (by the planner or the critic) and
  `plan.gave_up` (rounds exhausted, or no provider) record why nothing was proposed.
  `plan.proposed` records each step with its decision id. All three go to `session/<id>`.
- **Budgets:** `max_steps` 6, `max_rounds` 3 (at most one critic call per round),
  `max_output_tokens` 1024, `temperature` 0, `max_cost_usd` 0.

## Alternatives

- **Let the model mark its own taint.** One injected sentence ("the user asked for this") would
  turn a document into an authorization. Rejected: the model's `trigger` is only a hint, and
  code can only ever move it away from `user`.
- **Tool calling (function-call APIs).** Provider-specific, not on every free tier, and it hides
  the plan as a whole from the checks and the critic. A typed JSON plan works with every
  provider the router has.
- **No critic.** Half the calls, but nothing would independently check that the request asked
  for each step. Kept as `critic=False` for tests and for a future cheaper mode.
- **Re-plan after a DENY.** Would teach the loop to search for what gets past the gate.

## Consequences

- A plan costs two to six model calls. On the free tier that is the binding constraint, so the
  evaluation is recorded once and replayed (P6.md §4).
- A step the critic forgets to review is never `user`-triggered. That fails closed: at worst a
  human is asked to approve something the request did ask for.
- The planner trusts the gate for envelopes, rate limits, approvals and the kill switch; it
  duplicates none of them.
