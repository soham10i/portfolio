"""Signed stream-head checkpoints in an append-only file outside Postgres (ADR-0019).

The hash chain alone cannot catch someone who rewrites an event and then recomputes every later
hash and the stream head: the result is a valid chain. Each time an append commits, the store
signs the new head (stream, seq, hash) with an HMAC key the database never sees and appends the
line to `<NEXUS_ANCHOR_DIR>/<database>.<schema>.jsonl`. `verify_chain` then checks every signed
checkpoint against the events, so a rewritten history no longer matches what was signed.

    NEXUS_ANCHOR_KEYS=k2:<64+ hex chars>,k1:<64+ hex chars>   # the first signs, all verify
    NEXUS_ANCHOR_DIR=/var/lib/nexus/anchor

It proves nothing against someone who holds both the key and the anchor file."""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import re
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .canonical import canonical_json
from .errors import StoreError

log = logging.getLogger(__name__)

KEYS_ENV, DIR_ENV = "NEXUS_ANCHOR_KEYS", "NEXUS_ANCHOR_DIR"
_KID = re.compile(r"^[a-z0-9_-]{1,32}$")
_MIN_KEY_BYTES = 32
_SIGNED = ("v", "kid", "db", "stream", "seq", "hash", "ts")


class AnchorError(StoreError):
    """The anchor configuration is unusable."""


@dataclass(frozen=True)
class Checkpoint:
    stream: str
    seq: int
    hash: str
    kid: str
    line: int  # 1-based line in the anchor file


@dataclass
class AnchorRead:
    """Every verified checkpoint, and every line that failed verification (line, code, why)."""

    checkpoints: list[Checkpoint] = field(default_factory=list)
    invalid: list[tuple[int, str, str]] = field(default_factory=list)


def parse_keys(text: str) -> dict[str, bytes]:
    """'kid:hex,kid:hex' → {kid: key}, in the given order (the first one signs)."""
    keys: dict[str, bytes] = {}
    for part in (p.strip() for p in text.split(",")):
        kid, sep, hex_key = part.partition(":")
        if not sep or not _KID.fullmatch(kid):
            raise AnchorError(f"{KEYS_ENV}: each key is kid:hex, kid matching {_KID.pattern}")
        try:
            key = bytes.fromhex(hex_key)
        except ValueError:
            raise AnchorError(f"{KEYS_ENV}: key {kid} is not hex") from None
        if len(key) < _MIN_KEY_BYTES:
            raise AnchorError(f"{KEYS_ENV}: key {kid} has {len(key)} bytes, at least {_MIN_KEY_BYTES} needed")
        if kid in keys:
            raise AnchorError(f"{KEYS_ENV}: key id {kid} appears twice")
        keys[kid] = key
    return keys


class Anchor:
    """The signing keys and the anchor directory. `bind` it to one database and schema."""

    def __init__(self, keys: Mapping[str, bytes], directory: str | Path, scope: str | None = None) -> None:
        if not keys:
            raise AnchorError(f"{KEYS_ENV}: no keys")
        self._keys = dict(keys)
        self._signing = next(iter(self._keys))
        self.directory = Path(directory)
        self.scope = scope

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> Anchor | None:
        """None when neither variable is set; an error when only one is."""
        env = os.environ if env is None else env
        keys, directory = env.get(KEYS_ENV, "").strip(), env.get(DIR_ENV, "").strip()
        if not keys and not directory:
            return None
        if not keys or not directory:
            missing = KEYS_ENV if not keys else DIR_ENV
            raise AnchorError(f"{missing} is not set; anchoring needs both {KEYS_ENV} and {DIR_ENV}")
        return cls(parse_keys(keys), directory)

    def bind(self, database: str, schema: str) -> Anchor:
        return Anchor(self._keys, self.directory, f"{database}.{schema}")

    @property
    def path(self) -> Path:
        if self.scope is None:
            raise AnchorError("the anchor is not bound to a database and schema")
        return self.directory / f"{self.scope}.jsonl"

    def _mac(self, key: bytes, fields: Mapping[str, Any]) -> str:
        return hmac.new(key, canonical_json({k: fields[k] for k in _SIGNED}), hashlib.sha256).hexdigest()

    def sign(self, heads: Mapping[str, tuple[int, str]], ts: str) -> None:
        """Append one signed checkpoint per stream head. A failed write is logged, not raised: the
        events are already committed, and `chain verify` reports the missing checkpoint."""
        lines = []
        for stream, (seq, hash_) in sorted(heads.items()):
            fields: dict[str, Any] = {
                "v": 1,
                "kid": self._signing,
                "db": self.scope,
                "stream": stream,
                "seq": seq,
                "hash": hash_,
                "ts": ts,
            }
            fields["mac"] = self._mac(self._keys[self._signing], fields)
            lines.append(canonical_json(fields).decode() + "\n")
        if not lines:
            return
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            fd = os.open(self.path, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
            try:
                os.write(fd, "".join(lines).encode())  # one write: concurrent writers do not interleave
                os.fsync(fd)
            finally:
                os.close(fd)
        except OSError as exc:
            log.error("could not write %d checkpoint(s) to %s: %s", len(lines), self.path, exc)

    def read(self) -> AnchorRead:
        """Every line of this scope's anchor file, each MAC checked. A missing file is empty."""
        out = AnchorRead()
        try:
            text = self.path.read_text(encoding="utf-8")
        except FileNotFoundError:
            return out
        for n, raw in enumerate(text.splitlines(), start=1):
            try:
                fields = json.loads(raw)
                ok = isinstance(fields, dict) and set(fields) == {*_SIGNED, "mac"} and fields["v"] == 1
            except ValueError:
                ok = False
            if not ok:
                out.invalid.append((n, "CHECKPOINT_INVALID", "not a checkpoint line"))
                continue
            key = self._keys.get(fields["kid"])
            if key is None:
                out.invalid.append(
                    (n, "CHECKPOINT_UNKNOWN_KEY", f"signed with unknown key {fields['kid']!r}")
                )
                continue
            if not hmac.compare_digest(self._mac(key, fields), str(fields["mac"])):
                out.invalid.append((n, "CHECKPOINT_INVALID", "the signature does not match"))
                continue
            if fields["db"] != self.scope:
                out.invalid.append((n, "CHECKPOINT_INVALID", f"signed for {fields['db']}, not {self.scope}"))
                continue
            out.checkpoints.append(
                Checkpoint(fields["stream"], fields["seq"], fields["hash"], fields["kid"], n)
            )
        return out
