"""Signed approvals (ADR-0027): an Ed25519 signature over the exact proposal hash.

The signed message is the canonical JSON (JCS) of
`{"v": "nexus.approval/1", "decision_id", "proposal_hash", "approver": {"kind", "id"}}`.
Keys and signatures travel as lower-case hex. A key's id is the first 16 bytes of the sha256 of
its 32 raw public-key bytes."""

from __future__ import annotations

import hashlib
import re
from collections.abc import Mapping
from typing import Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

from .store.canonical import canonical_json

MESSAGE_VERSION = "nexus.approval/1"
ALG = "ed25519"
_PUBLIC = re.compile(r"^[0-9a-f]{64}$")
_SIGNATURE = re.compile(r"^[0-9a-f]{128}$")


def approval_message(decision_id: str, proposal_hash: str, approver: Mapping[str, Any]) -> bytes:
    return canonical_json(
        {
            "v": MESSAGE_VERSION,
            "decision_id": decision_id,
            "proposal_hash": proposal_hash,
            "approver": {"kind": approver["kind"], "id": approver["id"]},
        }
    )


def key_id(public_key_hex: str) -> str:
    return hashlib.sha256(bytes.fromhex(public_key_hex)).hexdigest()[:32]


def valid_public_key(public_key_hex: Any) -> bool:
    if not isinstance(public_key_hex, str) or not _PUBLIC.match(public_key_hex):
        return False
    try:
        Ed25519PublicKey.from_public_bytes(bytes.fromhex(public_key_hex))
    except ValueError:
        return False
    return True


def verify(public_key_hex: str, signature_hex: str, message: bytes) -> bool:
    if not valid_public_key(public_key_hex):
        return False
    if not isinstance(signature_hex, str) or not _SIGNATURE.match(signature_hex):
        return False
    try:
        Ed25519PublicKey.from_public_bytes(bytes.fromhex(public_key_hex)).verify(
            bytes.fromhex(signature_hex), message
        )
    except InvalidSignature:
        return False
    return True


def signature_ok(signature: Any, decision_id: str, proposal_hash: str, approver: Mapping[str, Any]) -> bool:
    """A stored signature still verifies: right algorithm, key id derived from the key, and a valid
    signature over this decision, hash and approver."""
    if not isinstance(signature, Mapping) or signature.get("alg") != ALG:
        return False
    public = signature.get("public_key")
    if not valid_public_key(public) or signature.get("key_id") != key_id(public):
        return False
    return verify(public, signature.get("value"), approval_message(decision_id, proposal_hash, approver))


class Signer:
    """An Ed25519 private key that signs approvals. It never leaves the client that holds it."""

    def __init__(self, private_key: Ed25519PrivateKey) -> None:
        self._key = private_key

    @classmethod
    def generate(cls) -> Signer:
        return cls(Ed25519PrivateKey.generate())

    @classmethod
    def from_seed(cls, seed: bytes) -> Signer:
        return cls(Ed25519PrivateKey.from_private_bytes(seed))

    @classmethod
    def from_pem(cls, data: bytes) -> Signer:
        key = serialization.load_pem_private_key(data, password=None)
        if not isinstance(key, Ed25519PrivateKey):
            raise ValueError("not an Ed25519 private key")
        return cls(key)

    def to_pem(self) -> bytes:
        return self._key.private_bytes(
            serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
        )

    @property
    def public_key(self) -> str:
        raw = self._key.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
        return raw.hex()

    @property
    def key_id(self) -> str:
        return key_id(self.public_key)

    def sign(self, message: bytes) -> str:
        return self._key.sign(message).hex()

    def sign_approval(
        self, decision_id: str, proposal_hash: str, approver: Mapping[str, Any]
    ) -> dict[str, str]:
        """The signature block an approval carries."""
        return {
            "alg": ALG,
            "key_id": self.key_id,
            "public_key": self.public_key,
            "value": self.sign(approval_message(decision_id, proposal_hash, approver)),
        }
