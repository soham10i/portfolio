"""One entry point (ADR-0029): send a message to the answerer ("ask") or the planner ("act").

The rule is deterministic and has no model call. A wrong route is never unsafe: "ask" acts on
nothing, and every step of "act" goes to the gate and executes nothing until the owner says so.
The route is returned with the result, so a client can resend with an explicit mode."""

from __future__ import annotations

import re

ASK, ACT, AUTO = "ask", "act", "auto"
MODES = (AUTO, ASK, ACT)

# Polite requests are phrased as questions but ask for something to be done.
_POLITE = re.compile(
    r"^(please|kindly|(can|could|would|will) you( please)?|would you mind|i('d| would) like you to|"
    r"i want you to|i need you to)\b"
)
# ...unless what they ask for is information: "can you tell me ...?" is a question.
_POLITE_ASK = re.compile(
    r"^(please |kindly )?((can|could|would|will) you( please)? )?"
    r"(tell|show|remind) me\b|^(please |kindly )?((can|could|would|will) you( please)? )?"
    r"(explain|describe|summari[sz]e|let me know)\b"
)
_QUESTION_WORDS = frozenset(
    {
        *("what", "which", "who", "whom", "whose", "when", "where", "why", "how"),
        *("is", "are", "was", "were", "am", "do", "does", "did", "has", "have", "had"),
        *("can", "could", "should", "would", "will", "may", "might", "must", "shall"),
    }
)


def route(text: str, mode: str = AUTO) -> str:
    if mode in (ASK, ACT):
        return mode
    if mode != AUTO:
        raise ValueError(f"mode must be one of {MODES}")
    words = re.sub(r"[^a-z0-9?' ]+", " ", text.strip().lower()).split()
    if not words:
        return ASK
    joined = " ".join(words)
    if _POLITE_ASK.match(joined):
        return ASK
    if _POLITE.match(joined):
        return ACT
    if text.rstrip().endswith("?") or words[0] in _QUESTION_WORDS:
        return ASK
    return ACT
