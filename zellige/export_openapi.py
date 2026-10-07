"""Export the actual FastAPI contract without starting a server or opening storage."""

from __future__ import annotations

import json
import sys
from typing import cast

from .server import create_app
from .service import ZelligeService


def schema_json() -> str:
    # This app is used only for schema inspection and is never served. Route
    # dependencies are not evaluated by openapi(), so no service or storage
    # needs to be constructed. Keep the runtime app factory unchanged.
    app = create_app(cast(ZelligeService, None), "openapi-export")
    return json.dumps(app.openapi(), ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def main() -> None:
    sys.stdout.write(schema_json())


if __name__ == "__main__":
    main()
