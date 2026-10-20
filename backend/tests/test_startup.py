import subprocess
import sys

import pytest

from tests.conftest import ROOT

ENTRY_POINTS = ["app.worker", "app.main", "app.cli"]
CHECK = (
    "import {module}; from app.database import Base; "
    "[key.column for table in Base.metadata.tables.values() for key in table.foreign_keys]"
)


@pytest.mark.parametrize("module", ENTRY_POINTS)
def test_entry_point_resolves_every_foreign_key(module: str):
    finished = subprocess.run(
        [sys.executable, "-c", CHECK.format(module=module)],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )

    assert finished.returncode == 0, finished.stderr
