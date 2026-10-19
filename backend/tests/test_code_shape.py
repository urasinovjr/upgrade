import ast
import io
import tokenize
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
FOLDERS = ["app", "alembic", "loadgen", "provider_sim", "tests"]
MAX_LINES = 500

PYTHON_FILES = sorted(
    path
    for folder in FOLDERS
    for path in (ROOT / folder).rglob("*.py")
    if ".venv" not in path.parts
)


def comments(source: str) -> list[str]:
    tokens = tokenize.generate_tokens(io.StringIO(source).readline)
    return [token.string for token in tokens if token.type == tokenize.COMMENT]


def docstrings(source: str) -> list[str]:
    found = []
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.Module | ast.ClassDef | ast.FunctionDef | ast.AsyncFunctionDef):
            docstring = ast.get_docstring(node)
            if docstring:
                found.append(docstring)
    return found


@pytest.mark.parametrize("path", PYTHON_FILES, ids=lambda path: str(path.relative_to(ROOT)))
def test_file_has_no_comments_and_stays_short(path: Path):
    source = path.read_text()

    assert comments(source) == []
    assert docstrings(source) == []
    assert len(source.splitlines()) <= MAX_LINES
