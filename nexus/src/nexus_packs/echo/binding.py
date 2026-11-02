"""EchoBinding: `echo.say` writes a line to a stream and remembers it as `echo.last_message`."""

from __future__ import annotations

import sys
from collections.abc import Mapping
from typing import Any, TextIO

from nexus.exec import BindingError, ExecRequest
from nexus.gate import LoadedPack


class EchoBinding:
    def __init__(self, out: TextIO | None = None) -> None:
        self._out = out
        self.last: str | None = None

    async def execute(self, request: ExecRequest) -> None:
        if request.action != "echo.say":
            raise BindingError(f"echo cannot {request.action}")
        text = request.params["text"]
        print(f"echo> {text}", file=self._out or sys.stdout, flush=True)
        self.last = text

    async def observe(self) -> Mapping[str, Any]:
        return {} if self.last is None else {"echo.last_message": self.last}


def create_binding(pack: LoadedPack) -> EchoBinding:
    return EchoBinding()
