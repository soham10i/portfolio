# nexus/

NEXUS, a governed industrial agentic runtime. It is built here, inside the portfolio
repository, but it is **a separate project**: it will be moved to its own repository and deployed
as its own service.

- What we are building towards: [`GOAL.md`](GOAL.md)
- The full design: [`docs/INDUSTRIAL_BLUEPRINT.md`](docs/INDUSTRIAL_BLUEPRINT.md)
- The part being built now: [`docs/parts/P0.md`](docs/parts/P0.md)

## The standalone rule

This folder must work as if the rest of the repository did not exist.

1. Nothing in `nexus/` imports, reads, or links to a path outside `nexus/`.
2. Nothing outside `nexus/` imports from it. The only future link is the portfolio backend calling
   nexusd over HTTP (part P17), configured by a URL, never by a path.
3. `nexus/` has its own `pyproject.toml`, lockfile, Dockerfile, compose file, tests and docs.
4. The portfolio's builds ignore it: `/nexus/` is in `.gcloudignore` and `.dockerignore`, and the
   portfolio CI skips `nexus/**`. Its own CI is `.github/workflows/nexus-ci.yml` at the repo root,
   because GitHub only reads workflows from there. It is the one file outside this folder.

A test in P0 (`tests/test_standalone.py`) enforces rule 1.

## Moving it out (when M2 is reached, or before the first deploy in P13 at the latest)

```bash
git subtree split --prefix=nexus -b nexus-standalone
```

Then push that branch to a new repository as `main`, move `.github/workflows/nexus-ci.yml` into it
as `.github/workflows/ci.yml` (drop the `working-directory: nexus` and `paths` filters), and delete
`nexus/` plus the ignore entries from the portfolio. The history of every file is kept.

## Development

Everything runs from this folder. You need [uv](https://docs.astral.sh/uv/) (it installs Python
3.12 itself) and, for the database test only, Docker.

```bash
make setup      # uv sync --frozen --extra dev
make check      # lint, format check, tests, example validation, licence check: what CI runs
make db-up      # Postgres 16 + pgvector on localhost:5433 (deploy/compose.yml)
make test-db    # the integration test against that database
make db-down
```

The CLI validates contract documents. The kind comes from the file name
(`<name>.<kind>.yaml|json`, kind is one of `pack action proposal decision evidence event`) or
from `--kind`:

```bash
uv run nexus validate contracts/examples/valid        # exit 0: all valid
uv run nexus validate contracts/examples/invalid      # exit 1: one line per issue
uv run nexus validate --json my.pack.yaml             # machine-readable
uv run nexus schema list
uv run nexus schema show pack
```

Each issue has a stable code: `SCHEMA` for structural errors, or one of the semantic codes listed
in `src/nexus/contracts/validate.py`. Exit code 2 means a usage or file error.

| Path | What it is |
|---|---|
| `contracts/v1/` | The JSON Schemas (canonical, ADR-0004) |
| `contracts/examples/` | Valid examples, and invalid ones with an `X.expect.json` naming the expected codes |
| `src/nexus/contracts/` | Schema registry, validator, pydantic models |
| `docs/adr/` | Architecture decisions |
| `docs/OPEN_QUESTIONS.md` | Ambiguities and the interim answers in use |
