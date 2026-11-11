import json
from pathlib import Path

from app.config import Settings
from app.contracts import postman_collection, write_contracts
from app.main import create_app


def test_generated_contracts_match_api_and_student_whitelist(tmp_path):
    schema = create_app(Settings(app_env="development")).openapi()
    write_contracts(tmp_path)
    root = Path(__file__).resolve().parents[2] / "contracts"
    for file in tmp_path.glob("*.json"):
        assert json.loads(file.read_text()) == json.loads((root / file.name).read_text())
    paths = schema["paths"]
    for path, method in (
        ("/api/homework", "get"),
        ("/api/homework/{homework_id}/assign", "post"),
        ("/api/homework-jobs/{job_id}", "get"),
        ("/api/student/state", "get"),
        ("/api/events", "get"),
    ):
        assert paths[path][method]["responses"]["200"]["content"]["application/json"]["schema"]
    student_task = schema["components"]["schemas"]["StudentTaskOut"]["properties"]
    assert "gap" in student_task and "feedback" in student_task
    assert not {"origin", "draft", "provenance", "analysis", "reference"} & student_task.keys()
    collection = postman_collection(schema)
    requests = [item["request"] for folder in collection["item"] for item in folder["item"]]
    assert all(request["url"]["raw"].startswith("{{baseUrl}}/api/") for request in requests)
    assert any(request.get("body", {}).get("mode") == "formdata" for request in requests)
