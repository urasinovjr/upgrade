import hashlib
import json

from app.analysis.prompts import PROMPTS
from app.analysis.variants import VARIANTS

PUBLISHED = {
    "math-1": "b7f95799ffa7ccef16f208ba4d83b622e49c7b4acb4778950c874ee58cecc0f5",
    "math-2": "bd9f4264c56cc5b0eca8b02fa35e6d7683dfbb90553a14abc209f674b0a21cac",
}


def fingerprint(prompt) -> str:
    parts = [
        prompt.RECOGNIZE_SYSTEM,
        prompt.REVIEW_SYSTEM,
        json.dumps(prompt.RecognitionAnswer.model_json_schema(), sort_keys=True),
        json.dumps(prompt.ReviewAnswer.model_json_schema(), sort_keys=True),
    ]
    return hashlib.sha256("\n".join(parts).encode()).hexdigest()


def test_published_prompts_never_change():
    assert {version: fingerprint(PROMPTS[version]) for version in PUBLISHED} == PUBLISHED


def test_every_real_variant_has_a_published_prompt():
    versions = {variant.prompt_version for variant in VARIANTS.values() if variant.kind != "sim"}

    assert versions <= set(PUBLISHED)
    assert all(version == PROMPTS[version].VERSION for version in PROMPTS)
