"""Markdown → chunks with chunk-level provenance (P7.md §2.1).

A chunk is a run of lines under one heading trail, at most about MAX_CHARS long, split at
paragraph boundaries. Its provenance is the file path relative to the corpus root, the 1-based
line range, the file's sha256 and, only when the file is tracked by git and unmodified, the
commit. A dirty or untracked file gets no commit, so a chunk never claims a commit it does not
match."""

from __future__ import annotations

import hashlib
import re
import subprocess
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

MAX_CHARS = 900
_HEADING = re.compile(r"^(#{1,6})\s+(.+?)\s*#*\s*$")


@dataclass(frozen=True)
class Chunk:
    chunk_id: str
    corpus: str
    path: str
    line_start: int
    line_end: int
    heading: str
    body: str
    file_sha256: str
    commit: str | None

    @property
    def ref(self) -> str:
        """The citation: path and line range, e.g. 'manual.md#L12-L20'."""
        return f"{self.path}#L{self.line_start}-L{self.line_end}"


def chunk_id(corpus: str, path: str, line_start: int, line_end: int, body: str) -> str:
    raw = f"{corpus}\0{path}\0{line_start}\0{line_end}\0{body}".encode()
    return hashlib.sha256(raw).hexdigest()[:24]


def _blocks(lines: list[str]) -> Iterator[tuple[str, int, int, list[str]]]:
    """(heading trail, first line, last line, lines) for each paragraph, 1-based lines."""
    trail: list[str] = []
    para: list[str] = []
    start = 0
    fence = False
    for n, line in enumerate(lines, 1):
        if line.lstrip().startswith("```"):
            fence = not fence
        heading = None if fence else _HEADING.match(line)
        if heading or (not line.strip() and not fence):
            if para:
                yield " > ".join(trail), start, n - 1, para
                para = []
            if heading:
                level = len(heading.group(1))
                trail = [*trail[: level - 1], heading.group(2)]
            continue
        if not para:
            start = n
        para.append(line)
    if para:
        yield " > ".join(trail), start, len(lines), para


def chunk_text(
    text: str, corpus: str, path: str, file_sha256: str, commit: str | None = None, max_chars: int = MAX_CHARS
) -> list[Chunk]:
    """Paragraphs under the same heading are packed together up to `max_chars`; a single
    paragraph longer than that stays one chunk rather than being cut mid-sentence."""
    chunks: list[Chunk] = []
    group: list[tuple[int, int, list[str]]] = []
    group_heading = ""

    def flush() -> None:
        if not group:
            return
        start, end = group[0][0], group[-1][1]
        body = "\n\n".join("\n".join(lines).strip() for _, _, lines in group)
        cid = chunk_id(corpus, path, start, end, body)
        chunks.append(Chunk(cid, corpus, path, start, end, group_heading, body, file_sha256, commit))
        group.clear()

    for heading, start, end, lines in _blocks(text.splitlines()):
        size = sum(len("\n".join(g[2])) for g in group)
        if group and (heading != group_heading or size + len("\n".join(lines)) > max_chars):
            flush()
        group_heading = heading
        group.append((start, end, lines))
    flush()
    return chunks


def git_commit(path: Path) -> str | None:
    """HEAD, if `path` is tracked and identical to HEAD; otherwise None. Never raises."""
    cwd = path.parent

    def git(*args: str) -> subprocess.CompletedProcess[str]:
        # Fixed argv, no shell; the only variable part is a file name after '--'.
        return subprocess.run(["git", *args], cwd=cwd, capture_output=True, timeout=5, text=True)  # noqa: S603, S607

    try:
        if git("ls-files", "--error-unmatch", "--", path.name).returncode != 0:
            return None
        if git("diff", "--quiet", "HEAD", "--", path.name).returncode != 0:
            return None
        head = git("rev-parse", "HEAD")
        return head.stdout.strip() if head.returncode == 0 else None
    except (OSError, subprocess.SubprocessError):
        return None


def chunk_file(root: Path, path: Path, corpus: str) -> list[Chunk]:
    raw = path.read_bytes()
    rel = path.relative_to(root).as_posix()
    return chunk_text(raw.decode("utf-8"), corpus, rel, hashlib.sha256(raw).hexdigest(), git_commit(path))


def corpus_files(root: Path, paths: list[str] | None = None) -> list[Path]:
    """The markdown files under `root` (or exactly `paths`, relative to it), sorted. A path that
    leaves the root is refused."""
    root = root.resolve()
    if paths is None:
        found = sorted(p for p in root.rglob("*.md") if p.is_file())
    else:
        found = []
        for rel in paths:
            target = (root / rel).resolve()
            if not target.is_relative_to(root):
                raise ValueError(f"{rel!r} leaves the corpus root")
            found += sorted(target.rglob("*.md")) if target.is_dir() else [target]
    return [p for p in found if p.is_file()]
