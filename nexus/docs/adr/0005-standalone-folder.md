# 0005. Built inside the portfolio repo under the standalone rule

Date: 2026-10-30

## Status

Accepted

## Context

NEXUS is a separate product with its own deployment, but it starts life next to the portfolio
that will showcase it. Creating a new repository now adds overhead before there is anything to
deploy; mixing it into the portfolio would make it impossible to separate cleanly later.

## Decision

Build NEXUS in `nexus/` inside the portfolio repository, under the **standalone rule**
(`README.md`): nothing in `nexus/` reads, imports or links to a path outside it, nothing outside
imports from it, and it has its own `pyproject.toml`, lockfile, compose file, tests and docs.
The portfolio's builds ignore it (`.dockerignore`, `.gcloudignore`, `paths-ignore` in `ci.yml`).
The only file outside the folder is `.github/workflows/nexus-ci.yml`, because GitHub reads
workflows only from the repository root. `tests/test_standalone.py` enforces the rule.

At milestone M2, or before the first deployment in P13 at the latest, extract it with
`git subtree split --prefix=nexus`, which keeps every file's history.

## Alternatives considered

- **A new repository from day one.** Cleanest, but splits review and context while the design
  is still moving quickly.
- **A git submodule.** Two places to commit, easy to leave out of sync.
- **Mixing into `backend/`.** Fast to start, very costly to undo, and couples two release cycles.

## Consequences

- One pull request can show NEXUS changes next to the portfolio, but CI runs separately.
- Every new file is scanned for paths that leave the folder; tooling must be configured inside it.
- The workflow file has to move (and lose its `paths` and `working-directory`) at extraction.
