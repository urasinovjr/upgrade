import asyncio
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


PROFILES = {
    "normal": Profile(3.0, 15.0, 0.5, 0.02, 0.03, 0.02),
    "degraded": Profile(9.0, 45.0, 0.6, 0.06, 0.08, 0.06),
}
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
