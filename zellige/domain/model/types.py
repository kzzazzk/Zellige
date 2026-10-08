from typing import Any, Literal

JsonObject = dict[str, Any]


ItemKind = Literal["message", "tool_call", "tool_result", "activity", "artifact"]


RunStatus = Literal["queued", "running", "completed", "failed", "cancelled"]
