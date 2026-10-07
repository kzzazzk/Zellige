from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from pydantic import TypeAdapter

from zellige.domain.model.payload import ItemPayload


def item_payload_json_schema() -> dict[str, Any]:
    schema = TypeAdapter(ItemPayload).json_schema(ref_template="#/$defs/{model}")
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": "https://zellige.dev/schemas/item-payload/v1",
        "title": "Zellige item payload v1",
        **schema,
    }


def write_item_payload_json_schema(path: Path) -> None:
    path.write_text(
        json.dumps(
            item_payload_json_schema(), ensure_ascii=False, indent=2, sort_keys=True
        )
        + "\n",
        encoding="utf-8",
    )


def export_schemas() -> None:
    parser = argparse.ArgumentParser(description="Export Zellige JSON Schemas")
    parser.add_argument(
        "output",
        nargs="?",
        type=Path,
        default=Path("schemas/item-payload.schema.json"),
    )
    output = parser.parse_args().output
    output.parent.mkdir(parents=True, exist_ok=True)
    write_item_payload_json_schema(output)
