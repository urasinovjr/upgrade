import json

import httpx
import pytest

from app.analysis import openrouter_probe as runner
from app.analysis.openai_provider import OpenAiDraftProvider
from tests.test_openai_provider import completion
from tests.test_openrouter import CONDITIONS, MATERIAL


class ProbeTransport:
    def __init__(self, initial_usage=0, fail=False):
        self.calls = 0
        self.case = -1
        self.usage = initial_usage
        self.fail = fail

    def __call__(self, request):
        if request.method == "GET":
            return httpx.Response(
                200,
                json={
                    "data": {
                        "limit": 1,
                        "limit_reset": None,
                        "usage": self.usage,
                        "limit_remaining": 1 - self.usage,
                    }
                },
            )
        self.calls += 1
        self.usage += 0.002
        if self.fail:
            return httpx.Response(503)
        body = json.loads(request.content)
        operation = body["response_format"]["json_schema"]["name"]
        if operation == "recognition":
            self.case += 1
            steps = (
                []
                if self.case >= 3
                else [{"latex": "x=2", "legible": True, "page_number": 1, "bbox": None}]
            )
            raw = {"tasks": [{"task_id": "t1", "matched": self.case < 3, "steps": steps}]}
        elif operation == "review":
            steps = (
                []
                if self.case >= 3
                else [
                    {
                        "id": "s1",
                        "verdict": "error" if self.case == 1 else "correct",
                        "explanation": "Потерян корень" if self.case == 1 else "",
                    }
                ]
            )
            raw = {
                "tasks": [
                    {
                        "task_id": "t1",
                        "supported": True,
                        "reason": "",
                        "topic_id": "equations",
                        "task_type_id": "quadratic_eq",
                        "steps": steps,
                        "gap": None,
                        "feedback": "Проверено",
                    }
                ]
            }
        elif operation == "conditions":
            raw = {"tasks": [{**CONDITIONS["tasks"][0], "file_ids": [runner.SYNTHETIC_FILE_ID]}]}
        else:
            raw = MATERIAL
        data = completion(json.dumps(raw))
        data.update(id=f"gen-{self.calls}", provider="Nebius", model="qwen/qwen3.8-27b")
        data["usage"]["cost"] = 0.002
        return httpx.Response(200, json=data)


@pytest.mark.parametrize(
    ("usage", "fail", "status", "calls"),
    [(0, False, "passed", 12), (0.799, False, "stopped", 1), (0, True, "stopped", 1)],
)
async def test_probe_runs_in_order_records_spend_and_stops_without_retry(
    tmp_path, monkeypatch, usage, fail, status, calls
):
    transport = ProbeTransport(usage, fail)

    def make_provider(variant, settings):
        return OpenAiDraftProvider(
            variant, "probe-secret", "", 3, transport=httpx.MockTransport(transport)
        )

    monkeypatch.setattr(runner, "make_provider", make_provider)
    output = tmp_path / "report.json"
    passed = await runner.probe(output)
    report = json.loads(output.read_text())

    assert report["status"] == status and passed == (status == "passed")
    assert transport.calls == calls and len(report["calls"]) == calls
    assert "probe-secret" not in output.read_text()
    if passed:
        assert [case["name"] for case in report["cases"]] == [
            "correct",
            "error",
            "geometry",
            "unreadable",
            "missing",
            "conditions",
            "material",
        ]
        assert all(case["passed"] for case in report["cases"])
        assert report["keyAfterLastCall"]["usage"] != "0"
