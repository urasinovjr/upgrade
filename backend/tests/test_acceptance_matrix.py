import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCENARIOS = set(range(1, 17))
NEEDS_INTERFACE = {1, 4, 7, 8, 11, 12, 13, 16}
BACKEND_MARK = re.compile(r"mark\.prd\(([\d,\s]+)\)")
FRONTEND_TAG = re.compile(r"@prd-(\d{2})")


def backend_scenarios() -> set[int]:
    found = set()
    for path in (ROOT / "backend/tests").glob("test_*.py"):
        for numbers in BACKEND_MARK.findall(path.read_text("utf-8")):
            found |= {int(item) for item in numbers.split(",")}
    return found


def frontend_scenarios() -> set[int]:
    found = set()
    for folder in ("e2e", "e2e-server"):
        for path in (ROOT / "frontend" / folder).glob("*.ts"):
            found |= {int(item) for item in FRONTEND_TAG.findall(path.read_text("utf-8"))}
    return found


def test_every_prd_scenario_has_a_test():
    assert SCENARIOS - (backend_scenarios() | frontend_scenarios()) == set()


def test_interface_scenarios_are_checked_in_the_browser():
    assert NEEDS_INTERFACE - frontend_scenarios() == set()
