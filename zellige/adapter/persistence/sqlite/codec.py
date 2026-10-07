import json
from typing import Any


def to_json(value: Any) -> str:
    """Canonical JSON for storage: compact, UTF-8 and with sorted keys."""
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def from_json(text: str | None) -> Any:
    return json.loads(text) if text is not None else None
