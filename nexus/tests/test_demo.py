"""P4 A7: the M1 lifecycle demo runs end to end, twice in a row, and catches its own tampering,
including (P4.1, ADR-0019) a full rewrite that the hash chain alone does not catch."""

from __future__ import annotations

import asyncio
import os
import subprocess
import sys
import uuid

import pytest

from .db import URL, drop_schema
from .support import ROOT

pytestmark = pytest.mark.integration


def _demo(schema: str) -> subprocess.CompletedProcess[str]:
    env = {**os.environ, "NEXUS_DB_URL": URL or ""}
    env.pop("NEXUS_DB_SCHEMA", None)
    return subprocess.run(
        [sys.executable, "scripts/demo_lifecycle.py", "--schema", schema],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )


def test_the_demo_runs_twice_and_detects_tampering():
    if not URL:
        pytest.skip("NEXUS_DB_URL is not set")
    schema = f"demo_{uuid.uuid4().hex[:12]}"
    try:
        runs = [_demo(schema), _demo(schema)]
    finally:
        asyncio.run(drop_schema(schema))
    for run in runs:
        assert run.returncode == 0, run.stdout + run.stderr
        out = run.stdout
        assert "FAIL" not in out
        assert "HOLD  taint: triggered by doc item" in out
        assert out.count("echo> ") == 2  # ALLOW and the approved one; the DENY printed nothing
        assert "gate: DENY ['PARAMS_INVALID']" in out
        assert "gate: NEEDS_APPROVAL ['TAINTED_TRIGGER']" in out
        assert "executor after approval: succeeded, verification passed" in out
        assert "HASH_MISMATCH stored event does not match its hash" in out
        assert "signed checkpoints: intact" in out
        assert "$ nexus chain verify --no-anchor\n16 events in 2 streams: intact\n(exit 0)" in out
        assert "CHECKPOINT_MISMATCH not the hash signed with key demo" in out
        assert "NEXUS_ANCHOR_KEYS" not in out and "demo:" not in out  # the key is never printed
        assert "this trace cannot be trusted" in run.stderr
