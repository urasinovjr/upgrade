import asyncio
import hashlib
import math
import random
from collections import Counter
from dataclasses import dataclass

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel


@dataclass(frozen=True)
class Profile:
    ocr_median: float
    analyze_median: float
    spread: float
    timeout_rate: float
    error_rate: float
    rate_limit_rate: float
    invalid_rate: float = 0.0


PROFILES = {
    "normal": Profile(3.0, 15.0, 0.5, 0.02, 0.03, 0.02),
    "degraded": Profile(9.0, 45.0, 0.6, 0.06, 0.08, 0.06, 0.05),
    "calm": Profile(0.1, 0.1, 0.0, 0.0, 0.0, 0.0),
}
OUT_OF_SCOPE = ("производн", "вероятност", "треугольник", "график", "интеграл")
TOPIC_HINTS = (
    ("\\log", "logs"),
    ("\\sqrt", "roots"),
    ("\\frac", "fractions"),
    ("\\le", "inequalities"),
    ("\\ge", "inequalities"),
    ("<", "inequalities"),
    (">", "inequalities"),
)
DEFAULT_TOPIC = "equations"
HANG_SECONDS = 120.0


class SimConfig(BaseModel):
    profile: str = "normal"
    seed: int = 1
    time_scale: float = 0.1


class OcrRequest(BaseModel):
    upload_id: str
    pages: int


class AnalyzeRequest(BaseModel):
    upload_id: str
    text: str


class DraftPage(BaseModel):
    index: int
    file_id: str
    page: int
    content_type: str
    data: str
    width: int
    height: int


class DraftStep(BaseModel):
    id: str
    latex: str
    legible: bool


class DraftTask(BaseModel):
    id: str
    condition: str
    formula: str
    reference: str
    condition_file_ids: list[str]
    steps: list[DraftStep] = []


class DraftTopic(BaseModel):
    id: str
    name: str
    prerequisites: list[str]


class RecognizeRequest(BaseModel):
    pages: list[DraftPage]
    tasks: list[DraftTask]


class ReviewRequest(BaseModel):
    tasks: list[DraftTask]
    topics: list[DraftTopic]


def task_text(task: DraftTask) -> str:
    return f"{task.condition} {task.formula} {task.reference}"


def scenario(task: DraftTask) -> str:
    if any(word in task.condition.lower() for word in OUT_OF_SCOPE):
        return "unsupported"
    bucket = hashlib.sha256(task_text(task).encode()).digest()[0] % 10
    if bucket in (6, 7):
        return "error"
    if bucket == 8:
        return "illegible"
    return "correct"


def written_lines(task: DraftTask) -> list[str]:
    lines = [line.strip() for line in task.reference.splitlines() if line.strip()]
    if lines:
        return lines
    return [line for line in (task.formula, "x=\\dots") if line]


def recognized_task(task: DraftTask) -> dict:
    if not (task.condition or task.formula or task.condition_file_ids):
        return {"task_id": task.id, "matched": False, "steps": []}
    steps = [{"latex": line, "legible": True} for line in written_lines(task)]
    if scenario(task) == "illegible":
        steps[-1] = {"latex": "?", "legible": False}
    return {"task_id": task.id, "matched": True, "steps": steps}


def topic_of(task: DraftTask, topics: list[DraftTopic]) -> str:
    known = [topic.id for topic in topics]
    for hint, topic_id in TOPIC_HINTS:
        if hint in task_text(task) and topic_id in known:
            return topic_id
    return DEFAULT_TOPIC if DEFAULT_TOPIC in known else known[0]


def topic_named(topic_id: str, topics: list[DraftTopic]) -> DraftTopic:
    return next(topic for topic in topics if topic.id == topic_id)


def reviewed_task(task: DraftTask, topics: list[DraftTopic]) -> dict:
    kind = scenario(task)
    topic = topic_named(topic_of(task, topics), topics)
    result = {"task_id": task.id, "topic_id": topic.id, "gap": None}
    if kind == "unsupported":
        reason = "Тип задачи не входит в согласованный охват пилота."
        return {**result, "supported": False, "reason": reason, "steps": [], "feedback": ""}
    steps = [
        {"id": step.id, "verdict": "correct" if step.legible else "uncertain", "explanation": ""}
        for step in task.steps
    ]
    feedback = "Решение верное."
    if kind == "error" and steps:
        wrong = len(steps) // 2
        steps[wrong]["verdict"] = "error"
        steps[wrong]["explanation"] = f"Переход нарушает правило темы «{topic.name}»."
        gap_topic = topic_named((topic.prerequisites or [topic.id])[0], topics)
        reason = f"Повторить тему «{gap_topic.name}»: ошибка в шаге {wrong + 1}."
        result["gap"] = {"topic_id": gap_topic.id, "reason": reason}
        feedback = f"Ошибка в шаге {wrong + 1}."
    if any(step["verdict"] == "uncertain" for step in steps):
        feedback = "Часть записи не распознана, сверьте её с оригиналом."
    return {**result, "supported": True, "steps": steps, "feedback": feedback}


def draft_key(tasks: list[DraftTask]) -> str:
    return "draft:" + ",".join(task.id for task in tasks)


class Simulator:
    def __init__(self) -> None:
        self.config = SimConfig()
        self.calls: Counter[str] = Counter()
        self.stats: Counter[str] = Counter()

    def reset(self, config: SimConfig) -> None:
        self.config = config
        self.calls.clear()
        self.stats.clear()

    def next_random(self, endpoint: str, upload_id: str) -> random.Random:
        key = f"{endpoint}:{upload_id}"
        self.calls[key] += 1
        return random.Random(f"{self.config.seed}:{key}:{self.calls[key]}")

    async def answer(self, endpoint: str, upload_id: str, median: float) -> None:
        profile = PROFILES[self.config.profile]
        rng = self.next_random(endpoint, upload_id)
        self.stats[f"{endpoint}_calls"] += 1
        roll = rng.random()
        if roll < profile.timeout_rate:
            self.stats[f"{endpoint}_hangs"] += 1
            await asyncio.sleep(HANG_SECONDS * self.config.time_scale)
            return
        latency = median * math.exp(profile.spread * rng.gauss(0, 1))
        await asyncio.sleep(latency * self.config.time_scale)
        if roll < profile.timeout_rate + profile.error_rate:
            self.stats[f"{endpoint}_errors"] += 1
            raise HTTPException(status_code=503, detail="provider_error")
        if roll < profile.timeout_rate + profile.error_rate + profile.rate_limit_rate:
            self.stats[f"{endpoint}_rate_limited"] += 1
            raise HTTPException(status_code=429, detail="rate_limited")
        self.stats[f"{endpoint}_ok"] += 1


app = FastAPI(title="Provider simulator")
simulator = Simulator()


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.post("/config")
async def configure(config: SimConfig) -> SimConfig:
    if config.profile not in PROFILES:
        raise HTTPException(status_code=400, detail="unknown_profile")
    simulator.reset(config)
    return config


@app.get("/stats")
async def stats() -> dict:
    return dict(simulator.stats)


@app.post("/ocr")
async def ocr(request: OcrRequest) -> dict:
    profile = PROFILES[simulator.config.profile]
    await simulator.answer("ocr", request.upload_id, profile.ocr_median * request.pages)
    return {"text": f"recognized {request.pages} pages of {request.upload_id}"}


@app.post("/analyze")
async def analyze(request: AnalyzeRequest) -> dict:
    profile = PROFILES[simulator.config.profile]
    await simulator.answer("analyze", request.upload_id, profile.analyze_median)
    return {"steps": 6, "errors": 1, "topic": "logarithmic-inequalities"}


async def draft_answer(endpoint: str, tasks: list[DraftTask], median: float) -> bool:
    profile = PROFILES[simulator.config.profile]
    await simulator.answer(endpoint, draft_key(tasks), median)
    rng = simulator.next_random(f"{endpoint}_invalid", draft_key(tasks))
    return rng.random() < profile.invalid_rate


def usage(input_tokens: int, output_tokens: int) -> dict:
    return {"input_tokens": input_tokens, "output_tokens": output_tokens}


@app.post("/draft/recognize")
async def draft_recognize(request: RecognizeRequest) -> dict:
    profile = PROFILES[simulator.config.profile]
    pages = max(1, len(request.pages))
    spent = usage(1000 * pages + 200 * len(request.tasks), 150 * len(request.tasks))
    if await draft_answer("draft_recognize", request.tasks, profile.ocr_median * pages):
        return {"tasks": "unreadable", "usage": spent}
    return {"tasks": [recognized_task(task) for task in request.tasks], "usage": spent}


@app.post("/draft/review")
async def draft_review(request: ReviewRequest) -> dict:
    profile = PROFILES[simulator.config.profile]
    spent = usage(300 * len(request.tasks), 200 * len(request.tasks))
    if await draft_answer("draft_review", request.tasks, profile.analyze_median):
        return {"tasks": "unreadable", "usage": spent}
    return {
        "tasks": [reviewed_task(task, request.topics) for task in request.tasks],
        "usage": spent,
    }
