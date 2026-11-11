import json
from pathlib import Path

CATALOG_PATH = Path(__file__).with_name("exams.json")


def exam_catalog() -> list[dict]:
    return json.loads(CATALOG_PATH.read_text())


def validate_position(position) -> None:
    match = next(
        (
            item
            for item in exam_catalog()
            if (item["exam"], item["level"], item["year"], item["documentVersion"])
            == (position.exam, position.level, position.year, position.document_version)
        ),
        None,
    )
    if match is None or position.position not in {item["position"] for item in match["positions"]}:
        raise ValueError("Позиция не найдена в выбранной версии документов ФИПИ")
