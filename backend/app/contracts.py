import json
from pathlib import Path

from app.config import Settings
from app.events import APP_VERSION
from app.main import create_app


def example(value: dict, schemas: dict, depth: int = 0):
    if depth > 12:
        return None
    if "$ref" in value:
        return example(schemas[value["$ref"].split("/")[-1]], schemas, depth + 1)
    if "default" in value:
        return value["default"]
    if "enum" in value:
        return value["enum"][0]
    if "anyOf" in value:
        return example(value["anyOf"][0], schemas, depth + 1)
    kind = value.get("type")
    if kind == "object":
        return {
            key: example(item, schemas, depth + 1)
            for key, item in value.get("properties", {}).items()
            if key in value.get("required", [])
        }
    if kind == "array":
        return [
            example(value.get("items", {}), schemas, depth + 1)
            for _ in range(value.get("minItems", 0))
        ]
    if kind in {"number", "integer"}:
        return value.get("minimum", 0)
    if kind == "boolean":
        return False
    if kind == "string":
        if value.get("format") == "uuid":
            return "{{$guid}}"
        if value.get("format") == "date-time":
            return "{{$isoTimestamp}}"
        return "{{" + value.get("title", "value").replace(" ", "_") + "}}"
    return None


def postman_collection(schema: dict) -> dict:
    folders = {}
    for path, methods in schema["paths"].items():
        if not path.startswith("/api/"):
            continue
        for method, operation in methods.items():
            tag = operation.get("tags", ["api"])[0]
            variables = []
            segments = []
            for segment in path.strip("/").split("/"):
                if segment.startswith("{"):
                    name = segment[1:-1]
                    segments.append(":" + name)
                    variables.append({"key": name, "value": "{{" + name + "}}"})
                else:
                    segments.append(segment)
            headers = [{"key": "Origin", "value": "{{origin}}"}]
            if method not in {"get", "head"}:
                headers.append({"key": "X-CSRF-Token", "value": "{{csrfToken}}"})
            request = {
                "method": method.upper(),
                "header": headers,
                "url": {
                    "raw": "{{baseUrl}}/" + "/".join(segments),
                    "host": ["{{baseUrl}}"],
                    "path": segments,
                    "variable": variables,
                },
                "description": operation.get("operationId", ""),
            }
            content = operation.get("requestBody", {}).get("content", {})
            if "application/json" in content:
                request["body"] = {
                    "mode": "raw",
                    "raw": json.dumps(
                        example(
                            content["application/json"]["schema"],
                            schema.get("components", {}).get("schemas", {}),
                        ),
                        ensure_ascii=False,
                        indent=2,
                    ),
                    "options": {"raw": {"language": "json"}},
                }
            if method == "post" and path.endswith("/submissions"):
                request["body"] = {
                    "mode": "formdata",
                    "formdata": [
                        {
                            "key": "meta",
                            "value": '{"id":"{{$guid}}","taskFiles":{}}',
                            "type": "text",
                        }
                    ],
                }
            if method == "post" and path.endswith("/files"):
                request["body"] = {
                    "mode": "formdata",
                    "formdata": [{"key": "file", "type": "file", "src": ""}],
                }
            item = {"name": operation.get("summary", path), "request": request}
            folders.setdefault(tag, []).append(item)
    return {
        "info": {
            "name": "UpGrade " + APP_VERSION,
            "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
            "description": "Фактические маршруты API. Схемы тел и ответов: openapi-"
            + APP_VERSION
            + ".json. Репетитор и ученик используют отдельные сессии. "
            "Результат ИИ проверяет репетитор перед публикацией.",
        },
        "variable": [
            {"key": "baseUrl", "value": "http://localhost:8010"},
            {"key": "origin", "value": "http://localhost:8080"},
            {"key": "csrfToken", "value": ""},
        ],
        "item": [{"name": tag, "item": items} for tag, items in folders.items()],
    }


def write_contracts(destination: Path) -> None:
    schema = create_app(Settings(app_env="development")).openapi()
    destination.mkdir(parents=True, exist_ok=True)
    for name, content in (("openapi", schema), ("postman", postman_collection(schema))):
        path = destination / f"{name}-{APP_VERSION}.json"
        path.write_text(json.dumps(content, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    write_contracts(Path(__file__).resolve().parents[2] / "contracts")
