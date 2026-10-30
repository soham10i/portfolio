# 0001. Record architecture decisions

Date: 2026-10-30

## Status

Accepted

## Context

NEXUS is built in parts (P0–P17) over months, often by an agent working from a brief. Each part
makes choices that later parts depend on: a schema shape, a datastore, an expression language.
If those choices exist only in chat logs or commit messages, a later part can quietly undo them,
and nobody can tell whether a divergence was deliberate.

## Decision

We record every significant architecture decision as an Architecture Decision Record in
`docs/adr/`, in Michael Nygard's format (Context, Decision, Consequences, Status), numbered
`NNNN-short-title.md`. An ADR is at most one page and names the alternatives that lost and why.

**Any change to a contract in `contracts/` needs an ADR**, including additive ones. A part brief
may be deviated from only with an ADR or an entry in `docs/OPEN_QUESTIONS.md`.

ADRs are immutable once accepted. A changed decision gets a new ADR that supersedes the old one,
and the old one's status becomes "Superseded by NNNN".

## Alternatives considered

- **Design notes in the blueprint only.** The blueprint says what to build, not why one option
  beat another, and rewriting it hides history.
- **Commit messages.** Not discoverable, and the human commits, not the agent.
- **A wiki outside the repo.** Breaks the standalone rule and does not move with `git subtree split`.

## Consequences

- Reviewers can check a part against both its brief and the ADRs it cites.
- Small cost per decision; the one-page limit keeps it small.
- Contract changes become visible and deliberate, which is the point.
