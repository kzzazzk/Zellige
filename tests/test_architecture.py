"""Keep the hexagon independent of its adapters and its folders in shape."""

import ast
import unittest
from collections.abc import Iterator
from importlib.util import resolve_name
from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parents[1] / "zellige"

FRAMEWORKS = ("fastapi", "starlette", "uvicorn", "sqlite3")

OUTSIDE_THE_HEXAGON = ("zellige.adapter", "zellige.config", "zellige.server")

ASSEMBLY = ("zellige.config", "zellige.server")

# Entry adapters call use cases; the others implement ports.
ENTRY_ADAPTERS = ("web",)

PORT_ADAPTERS = ("persistence", "storage", "clock")

ADAPTERS = (*ENTRY_ADAPTERS, *PORT_ADAPTERS)


def adapter_rules(adapter: str, other_side: str) -> tuple[str, ...]:
    return (
        *ASSEMBLY,
        *(f"zellige.adapter.{other}" for other in ADAPTERS if other != adapter),
        "zellige.application.service",
        f"zellige.application.{other_side}",
    )


FORBIDDEN_BY_LAYER = {
    "domain": (*FRAMEWORKS, *OUTSIDE_THE_HEXAGON, "zellige.application"),
    "application": (*FRAMEWORKS, *OUTSIDE_THE_HEXAGON),
    "application.usecase": ("zellige.application.service",),
    "application.port": (
        "zellige.application.service",
        "zellige.application.usecase",
    ),
    **{
        f"adapter.{adapter}": adapter_rules(adapter, "port")
        for adapter in ENTRY_ADAPTERS
    },
    **{
        f"adapter.{adapter}": adapter_rules(adapter, "usecase")
        for adapter in PORT_ADAPTERS
    },
}

LAYOUT = {
    "": {"__init__.py", "adapter", "application", "config", "domain", "server.py"},
    "domain": {"__init__.py", "exception", "model", "service"},
    "application": {"__init__.py", "port", "service", "usecase"},
    "adapter": {"__init__.py", *ADAPTERS},
}


def imports(path: Path) -> Iterator[tuple[int, str]]:
    package = ".".join(("zellige", *path.relative_to(PACKAGE_ROOT).parts[:-1]))
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        if isinstance(node, ast.Import):
            for alias in node.names:
                yield node.lineno, alias.name
        elif isinstance(node, ast.ImportFrom):
            module = node.module or ""
            if node.level:
                module = resolve_name("." * node.level + module, package)
            for alias in node.names:
                yield (
                    node.lineno,
                    (module if alias.name == "*" else f"{module}.{alias.name}"),
                )


def directory(layer: str) -> Path:
    return PACKAGE_ROOT.joinpath(*filter(None, layer.split(".")))


class ArchitectureTests(unittest.TestCase):
    def test_imports_respect_the_ports_and_adapters_boundaries(self):
        for layer, forbidden in FORBIDDEN_BY_LAYER.items():
            paths = sorted(directory(layer).rglob("*.py"))
            self.assertTrue(paths, f"Missing architecture layer: {layer}")
            for path in paths:
                for line, module in imports(path):
                    with self.subTest(file=str(path), line=line, module=module):
                        self.assertFalse(
                            any(
                                module == prefix or module.startswith(prefix + ".")
                                for prefix in forbidden
                            ),
                            f"{path.relative_to(PACKAGE_ROOT)}:{line} imports "
                            f"{module}, crossing the {layer} boundary",
                        )

    def test_folders_follow_the_hexagon(self):
        for layer, expected in LAYOUT.items():
            with self.subTest(layer=layer or "zellige"):
                entries = {
                    entry.name
                    for entry in directory(layer).iterdir()
                    if entry.name != "__pycache__"
                }
                self.assertEqual(entries, expected)
