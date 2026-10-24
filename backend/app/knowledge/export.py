from dataclasses import dataclass
from pathlib import Path

from openpyxl import Workbook, load_workbook
from openpyxl.worksheet.worksheet import Worksheet

from app.knowledge.catalog import CATALOG_VERSION, catalog_hash
from app.knowledge.families import FAMILY_NAMES
from app.knowledge.task_types import TASK_TYPES
from app.knowledge.topics import TOPICS

TOPIC_COLUMNS = ("id", "Название", "Кратко", "Описание", "Класс", "Семейство", "Замечание")
LINK_COLUMNS = ("Тема", "Опирается на", "Замечание")
TYPE_COLUMNS = ("id", "Семейство", "Название", "Темы", "В охвате", "Замечание")
NOTE = "Замечание"


@dataclass
class CatalogSheets:
    topics: dict[str, dict[str, str]]
    links: set[tuple[str, str]]
    types: dict[str, dict[str, str]]
    notes: list[str]


def family_name(family: str | None) -> str:
    return FAMILY_NAMES.get(family, "") if family else ""


def current_sheets() -> CatalogSheets:
    topics = {
        topic.id: {
            "Название": topic.name,
            "Кратко": topic.short_name,
            "Описание": topic.description,
            "Класс": str(topic.grade),
            "Семейство": family_name(topic.family),
        }
        for topic in TOPICS
    }
    links = {(topic.id, parent) for topic in TOPICS for parent in topic.prerequisites}
    types = {
        item.id: {
            "Семейство": family_name(item.family),
            "Название": item.name,
            "Темы": ", ".join(item.topic_ids),
            "В охвате": "да" if item.in_scope else "нет",
        }
        for item in TASK_TYPES
    }
    return CatalogSheets(topics, links, types, [])


def fill(sheet: Worksheet, columns: tuple[str, ...], rows: list[list[str]]) -> None:
    sheet.append(list(columns))
    for row in rows:
        sheet.append([*row, ""])
    sheet.freeze_panes = "A2"
    for index, width in enumerate((24, 40, 14, 60, 10, 20), start=1):
        sheet.column_dimensions[sheet.cell(1, index).column_letter].width = width


def write_catalog_xlsx(path: Path) -> None:
    sheets = current_sheets()
    book = Workbook()
    about = book.active
    about.title = "Версия"
    about.append(["Версия справочника", CATALOG_VERSION])
    about.append(["Отпечаток", catalog_hash()])
    about.append(["Как править", "Меняйте ячейки или пишите в столбец «Замечание»."])
    topic_rows = [[key, *values.values()] for key, values in sheets.topics.items()]
    fill(book.create_sheet("Темы"), TOPIC_COLUMNS, topic_rows)
    fill(book.create_sheet("Связи"), LINK_COLUMNS, [[a, b] for a, b in sorted(sheets.links)])
    type_rows = [[key, *values.values()] for key, values in sheets.types.items()]
    fill(book.create_sheet("Типы задач"), TYPE_COLUMNS, type_rows)
    path.parent.mkdir(parents=True, exist_ok=True)
    book.save(path)


def cell_text(value: object) -> str:
    return "" if value is None else str(value).strip()


def sheet_rows(sheet: Worksheet) -> list[dict[str, str]]:
    rows = list(sheet.iter_rows(values_only=True))
    header = [cell_text(value) for value in rows[0]]
    found = [dict(zip(header, map(cell_text, row), strict=False)) for row in rows[1:]]
    return [row for row in found if any(row.values())]


def read_catalog_xlsx(path: Path) -> CatalogSheets:
    book = load_workbook(path, read_only=True)
    sheets = CatalogSheets({}, set(), {}, [])
    for row in sheet_rows(book["Темы"]):
        note = row.pop(NOTE, "")
        key = row.pop("id")
        sheets.topics[key] = row
        if note:
            sheets.notes.append(f"тема {key}: {note}")
    for row in sheet_rows(book["Связи"]):
        sheets.links.add((row["Тема"], row["Опирается на"]))
        if row.get(NOTE):
            sheets.notes.append(f"связь {row['Тема']} → {row['Опирается на']}: {row[NOTE]}")
    for row in sheet_rows(book["Типы задач"]):
        note = row.pop(NOTE, "")
        key = row.pop("id")
        sheets.types[key] = row
        if note:
            sheets.notes.append(f"тип {key}: {note}")
    return sheets


def row_changes(kind: str, old: dict[str, dict], new: dict[str, dict]) -> list[str]:
    lines = [f"добавлен {kind} {key}" for key in new if key not in old]
    lines += [f"удалён {kind} {key}" for key in old if key not in new]
    for key in old.keys() & new.keys():
        for field, value in new[key].items():
            if old[key].get(field, "") != value:
                lines.append(f"{kind} {key}, {field}: «{old[key].get(field, '')}» → «{value}»")
    return lines


def catalog_diff(path: Path) -> list[str]:
    old = current_sheets()
    new = read_catalog_xlsx(path)
    lines = row_changes("тема", old.topics, new.topics)
    lines += [f"добавлена связь {a} → {b}" for a, b in sorted(new.links - old.links)]
    lines += [f"удалена связь {a} → {b}" for a, b in sorted(old.links - new.links)]
    lines += row_changes("тип", old.types, new.types)
    return sorted(lines) + [f"замечание: {note}" for note in new.notes]
