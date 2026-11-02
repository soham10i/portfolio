# Every target runs from nexus/. `make check` is exactly what CI runs (minus the DB job).
.PHONY: setup lint fmt test validate licenses db-up db-down test-db test-live demo demo-http test-ts vectors eval-planner eval-grounding check

LICENSE_DENY := GPL;AGPL;LGPL;GNU General Public License;GNU Affero General Public License;GNU Lesser General Public License
# Every package must also match an allowed licence, so an unknown one fails too. cel-python's wheel
# leaves its licence field empty; its LICENSE file is Apache-2.0 (ADR-0011).
LICENSE_ALLOW := MIT;BSD;Apache;ISC;PSF;Python Software Foundation;MPL;Mozilla Public License
LICENSE_CHECKED_BY_HAND := cel-python

setup:
	uv sync --frozen --extra dev

lint:
	uv run ruff check .
	uv run ruff format --check .

fmt:
	uv run ruff check --fix .
	uv run ruff format .

test:
	uv run pytest -m "not integration and not live"

validate:
	uv run nexus validate contracts/examples/valid src/nexus_packs

licenses:
	uv run pip-licenses --partial-match --fail-on="$(LICENSE_DENY)" --allow-only="$(LICENSE_ALLOW)" \
		--ignore-packages $(LICENSE_CHECKED_BY_HAND)

db-up:
	docker compose -f deploy/compose.yml up -d --wait

db-down:
	docker compose -f deploy/compose.yml down

test-db:
	NEXUS_DB_URL=postgresql://nexus:nexus@localhost:5433/nexus uv run pytest -m integration

# The only target that talks to real model providers, with your own free-tier keys (P5.md §0.2).
test-live:
	NEXUS_LLM_LIVE=1 NEXUS_DB_URL=$${NEXUS_DB_URL:-postgresql://nexus:nexus@localhost:5433/nexus} uv run pytest -m live

demo:
	NEXUS_DB_URL=$${NEXUS_DB_URL:-postgresql://nexus:nexus@localhost:5433/nexus} uv run python scripts/demo_lifecycle.py

# The same lifecycle through `nexus serve` and the Python SDK, with a signed approval (P8.md §3).
demo-http:
	NEXUS_DB_URL=$${NEXUS_DB_URL:-postgresql://nexus:nexus@localhost:5433/nexus} uv run python scripts/demo_http.py

# The TypeScript SDK and the inbox's JCS against sdk/vectors.json (Node >= 22.6, no npm install).
test-ts:
	node --test sdk/ts/test/vectors.test.ts

# Regenerate sdk/vectors.json from the Python implementation.
vectors:
	uv run python scripts/make_sdk_vectors.py

# Replays evals/planner/recordings.json; no provider is called (P6.md §4).
eval-planner:
	NEXUS_DB_URL=$${NEXUS_DB_URL:-postgresql://nexus:nexus@localhost:5433/nexus} uv run python scripts/eval_planner.py

# Entity resolution, then the grounding suites replayed from evals/grounding/recordings.json;
# no provider is called (P7.md §4).
eval-grounding:
	NEXUS_DB_URL=$${NEXUS_DB_URL:-postgresql://nexus:nexus@localhost:5433/nexus} uv run python scripts/eval_grounding.py

check: lint test validate licenses
