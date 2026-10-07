import argparse
import json
import os
import tempfile
from pathlib import Path
from typing import Any

import uvicorn
from fastapi import FastAPI

from zellige.adapter.web.http_application import HTTPApplication
from zellige.application.usecase.zellige import Zellige
from zellige.config.zellige_configuration import ZelligeConfiguration


def create_app(zellige: Zellige, token: str) -> FastAPI:
    return HTTPApplication(zellige, token).build()


def build_app(data_dir: Path, token: str, web_dir: Path | None = None) -> FastAPI:
    return ZelligeConfiguration(data_dir, token, web_dir).build()


def openapi_document() -> dict[str, Any]:
    """The HTTP contract, generated from a throwaway instance."""
    with tempfile.TemporaryDirectory() as data_dir:
        return build_app(Path(data_dir), "openapi-export").openapi()


def export_openapi() -> None:
    parser = argparse.ArgumentParser(description="Export the Zellige OpenAPI document")
    parser.add_argument(
        "output", nargs="?", type=Path, default=Path("schemas/openapi.json")
    )
    output = parser.parse_args().output
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(openapi_document(), ensure_ascii=False, indent=2, sort_keys=True)
        + "\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Zellige conversation daemon")
    parser.add_argument("--host", default=os.environ.get("ZELLIGE_HOST", "127.0.0.1"))
    parser.add_argument(
        "--port", type=int, default=int(os.environ.get("ZELLIGE_PORT", "8787"))
    )
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=Path(os.environ.get("ZELLIGE_DATA_DIR", "./data")),
    )
    parser.add_argument(
        "--web-dir", type=Path, default=os.environ.get("ZELLIGE_WEB_DIR")
    )
    args = parser.parse_args()
    token = os.environ.get("ZELLIGE_API_TOKEN", "")
    app = build_app(args.data_dir, token, args.web_dir)
    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        access_log=os.environ.get("ZELLIGE_HTTP_LOG") == "1",
    )


if __name__ == "__main__":
    main()
