"""Embedders for the vector half of retrieval (P7.md §0.3, ADR-0023).

The default is local and deterministic: no model call, so indexing never sends a document
anywhere. It hashes word and character-trigram features into a signed 256-dimension vector,
which is enough to match "temperatures" with "temperature" and "lights" with "lighting".
A model embedder can replace it behind the same protocol; the index records which one built it."""

from __future__ import annotations

import hashlib
import math
import re
from collections.abc import Sequence
from typing import Protocol

DIMS = 256
_WORD = re.compile(r"[a-z0-9]+")
STOPWORDS = frozenset(
    [
        "a",
        "an",
        "and",
        "are",
        "as",
        "at",
        "be",
        "but",
        "by",
        "can",
        "do",
        "does",
        "for",
        "from",
        "has",
        "have",
        "how",
        "i",
        "if",
        "in",
        "into",
        "is",
        "it",
        "its",
        "me",
        "my",
        "of",
        "on",
        "or",
        "our",
        "so",
        "that",
        "the",
        "their",
        "them",
        "then",
        "there",
        "these",
        "this",
        "to",
        "was",
        "we",
        "what",
        "when",
        "where",
        "which",
        "who",
        "why",
        "will",
        "with",
        "you",
        "your",
    ]
)


def words(text: str) -> list[str]:
    return [w for w in _WORD.findall(text.lower()) if w not in STOPWORDS and len(w) > 1]


class Embedder(Protocol):
    id: str
    dims: int

    def embed(self, text: str) -> list[float]: ...


class HashEmbedder:
    """Feature hashing over words (weight 1) and character trigrams of each word (weight 0.5)."""

    id = "hash-256-v1"
    dims = DIMS

    def embed(self, text: str) -> list[float]:
        vec = [0.0] * self.dims
        for word in words(text):
            self._add(vec, "w:" + word, 1.0)
            padded = f"<{word}>"
            for i in range(len(padded) - 2):
                self._add(vec, "c:" + padded[i : i + 3], 0.5)
        norm = math.sqrt(sum(v * v for v in vec))
        return [v / norm for v in vec] if norm else vec

    def _add(self, vec: list[float], feature: str, weight: float) -> None:
        digest = hashlib.blake2b(feature.encode(), digest_size=8).digest()
        n = int.from_bytes(digest, "big")
        vec[n % self.dims] += weight if (n >> 63) & 1 else -weight


def to_pgvector(vec: Sequence[float]) -> str:
    return "[" + ",".join(f"{v:.6f}" for v in vec) + "]"
