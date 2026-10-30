# Every target runs from nexus/. `make check` is exactly what CI runs (minus the DB job).
.PHONY: setup lint fmt test validate licenses db-up db-down test-db check

LICENSE_DENY := GPL;AGPL;LGPL;GNU General Public License;GNU Affero General Public License;GNU Lesser General Public License

setup:
	uv sync --frozen --extra dev

lint:
	uv run ruff check .
	uv run ruff format --check .

fmt:
	uv run ruff check --fix .
	uv run ruff format .

test:
	uv run pytest -m "not integration"

validate:
	uv run nexus validate contracts/examples/valid

licenses:
	uv run pip-licenses --partial-match --fail-on="$(LICENSE_DENY)"

db-up:
	docker compose -f deploy/compose.yml up -d --wait

db-down:
	docker compose -f deploy/compose.yml down

test-db:
	NEXUS_DB_URL=postgresql://nexus:nexus@localhost:5433/nexus uv run pytest -m integration

check: lint test validate licenses
