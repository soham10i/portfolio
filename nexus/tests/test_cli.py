"""A6: exit codes 0 / 1 / 2 and the output format of the nexus CLI."""

from __future__ import annotations

import json
import re
import subprocess
import sys

import pytest

from nexus.cli import main

from .support import EXAMPLES, ROOT

LINE = re.compile(r"^\S+: [A-Z_]+ (/\S*): .+$")


def test_valid_directory_exits_0(capsys):
    assert main(["validate", str(EXAMPLES / "valid")]) == 0
    out, err = capsys.readouterr()
    assert out == ""
    assert re.fullmatch(r"\d+ valid, 0 invalid\n", err)


def test_invalid_directory_exits_1_with_one_line_per_issue(capsys):
    assert main(["validate", str(EXAMPLES / "invalid")]) == 1
    out, err = capsys.readouterr()
    lines = out.splitlines()
    assert lines and all(LINE.match(line) for line in lines), lines[:3]
    assert re.fullmatch(r"0 valid, \d+ invalid\n", err)
    assert any(": DUPLICATE_ACTION /actions/4/id: " in line for line in lines)


def test_json_output(capsys):
    path = EXAMPLES / "invalid" / "prev-hash.event.yaml"
    assert main(["validate", "--json", str(path)]) == 1
    report = json.loads(capsys.readouterr().out)
    assert report == {
        str(path): [
            {"code": "PREV_HASH_RULE", "pointer": "/prev_hash", "message": report[str(path)][0]["message"]}
        ]
    }


def test_explicit_kind_overrides_the_name(tmp_path, capsys):
    doc = tmp_path / "anything.yaml"
    doc.write_text((EXAMPLES / "valid" / "echo.pack.yaml").read_text(encoding="utf-8"), encoding="utf-8")
    assert main(["validate", "--kind", "pack", str(doc)]) == 0
    assert main(["validate", "--kind", "event", str(doc)]) == 1
    capsys.readouterr()


@pytest.mark.parametrize(
    "argv",
    [
        [],
        ["validate"],
        ["validate", "--kind", "nope", "x.yaml"],
        ["validate", "does/not/exist.pack.yaml"],
        ["frobnicate"],
    ],
)
def test_usage_and_io_errors_exit_2(argv, capsys):
    assert main(argv) == 2
    capsys.readouterr()


def test_malformed_and_unnamed_files_exit_2(tmp_path, capsys):
    bad = tmp_path / "bad.pack.yaml"
    bad.write_text("actions: [unclosed\n", encoding="utf-8")
    assert main(["validate", str(bad)]) == 2
    unnamed = tmp_path / "notes.yaml"
    unnamed.write_text("{}\n", encoding="utf-8")
    assert main(["validate", str(unnamed)]) == 2
    assert main(["validate", str(tmp_path / "empty_dir_does_not_exist")]) == 2
    (tmp_path / "empty").mkdir()
    assert main(["validate", str(tmp_path / "empty")]) == 2
    assert "error:" in capsys.readouterr().err


def test_schema_list_and_show(capsys):
    assert main(["schema", "list"]) == 0
    out = capsys.readouterr().out
    assert [line.split()[0] for line in out.splitlines()] == [
        "pack",
        "action",
        "proposal",
        "decision",
        "evidence",
        "event",
    ]
    assert main(["schema", "show", "event"]) == 0
    assert json.loads(capsys.readouterr().out)["$id"].endswith("/event.schema.json")


def test_console_script_is_installed():
    result = subprocess.run(
        [sys.executable, "-m", "nexus.cli", "validate", "contracts/examples/valid"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
