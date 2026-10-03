from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from zellige.database import Database
from zellige.export_openapi import schema_json
from zellige.server import build_app
from zellige.service import ZelligeService


class OpenAPIExportTestCase(unittest.TestCase):
    def test_export_matches_served_contract(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            app = build_app(Path(directory), "test-token")
            with TestClient(app) as client:
                response = client.get("/openapi.json")
                self.assertEqual(response.status_code, 200)
                self.assertEqual(json.loads(schema_json()), response.json())

    def test_export_is_deterministic(self) -> None:
        first = schema_json()
        self.assertEqual(first, schema_json())
        self.assertTrue(first.endswith("\n"))

    def test_export_does_not_initialize_storage(self) -> None:
        with (
            patch.object(Database, "__init__", side_effect=AssertionError("opened database")),
            patch.object(ZelligeService, "__init__", side_effect=AssertionError("created service")),
        ):
            self.assertEqual(json.loads(schema_json())["openapi"], "3.1.0")

    def test_append_head_is_required_and_nullable(self) -> None:
        append = json.loads(schema_json())["components"]["schemas"]["AppendItemRequest"]
        self.assertIn("expected_head_item_id", append["required"])
        head = append["properties"]["expected_head_item_id"]
        self.assertEqual({option["type"] for option in head["anyOf"]}, {"string", "null"})

    def test_request_defaults_remain_optional(self) -> None:
        schemas = json.loads(schema_json())["components"]["schemas"]
        optional_fields = {
            "CreateConversationRequest": ("title", "branch_name", "id", "branch_id"),
            "AppendItemRequest": ("payload_schema_version", "id", "run_id"),
            "CreateRunRequest": ("request", "context_pack_version_ids", "provider_session_id"),
        }
        for model, fields in optional_fields.items():
            for field in fields:
                with self.subTest(model=model, field=field):
                    self.assertIn(field, schemas[model]["properties"])
                    self.assertNotIn(field, schemas[model].get("required", []))
        self.assertEqual(
            schemas["AppendItemRequest"]["properties"]["payload_schema_version"]["default"],
            1,
        )

    def test_payload_unions_keep_type_discriminators(self) -> None:
        schemas = json.loads(schema_json())["components"]["schemas"]
        for model in ("AppendItemRequest", "Item"):
            with self.subTest(model=model):
                payload = schemas[model]["properties"]["payload"]
                self.assertIn("oneOf", payload)
                self.assertEqual(payload["discriminator"]["propertyName"], "type")
                self.assertEqual(
                    set(payload["discriminator"]["mapping"]),
                    {"message", "tool_call", "tool_result", "activity", "artifact"},
                )
        content = schemas["MessagePayload"]["properties"]["content"]["items"]
        self.assertIn("oneOf", content)
        self.assertEqual(content["discriminator"]["propertyName"], "type")
        self.assertEqual(
            set(content["discriminator"]["mapping"]),
            {"text", "image", "file", "audio", "video"},
        )

    def test_export_preserves_custom_validation_contract(self) -> None:
        schema = json.loads(schema_json())
        for path in schema["paths"].values():
            for operation in path.values():
                if isinstance(operation, dict) and "responses" in operation:
                    self.assertNotIn("422", operation["responses"])
        schemas = schema["components"]["schemas"]
        self.assertNotIn("HTTPValidationError", schemas)
        self.assertNotIn("ValidationError", schemas)
        response = schema["paths"]["/v1/conversations"]["post"]["responses"]["400"]
        self.assertEqual(
            response["content"]["application/json"]["schema"]["$ref"],
            "#/components/schemas/ErrorResponse",
        )


if __name__ == "__main__":
    unittest.main()
