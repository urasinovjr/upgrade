import argparse
import asyncio
import io
import json
from decimal import Decimal
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from app.analysis.contract import ReviewTask, StepInput, TaskInput, read_recognition, read_review
from app.analysis.openai_provider import OpenAiDraftProvider
from app.analysis.openrouter import check_budget
from app.analysis.providers import make_provider
from app.analysis.variants import get_variant
from app.config import Settings
from app.homework.schemas import MaterialContent
from app.homework.tasks import recognized_conditions
from app.provider import ProviderError
from app.redaction import PageImage

SYNTHETIC_FILE_ID = "00000000-0000-0000-0000-000000000001"


def page(lines: list[str], unreadable: bool = False) -> PageImage:
    canvas = Image.new("RGB", (1000, 550), "white")
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default(size=32)
    for number, line in enumerate(lines):
        draw.text((40, 40 + number * 65), line, fill="black", font=font)
    if unreadable:
        for row in range(35, 330, 5):
            draw.line((30, row, 970, row + 18), fill="black", width=14)
    output = io.BytesIO()
    canvas.save(output, format="PNG")
    return PageImage(
        index=0,
        file_id=SYNTHETIC_FILE_ID,
        page=1,
        content_type="image/png",
        data=output.getvalue(),
        width=1000,
        height=550,
    )


def task(condition, formula, files=None):
    return TaskInput(
        id="t1",
        condition=condition,
        formula=formula,
        reference="",
        condition_file_ids=[],
        solution_file_ids=files if files is not None else [SYNTHETIC_FILE_ID],
    )


async def note(provider, report, name, operation):
    try:
        reply = await operation()
    except ProviderError as error:
        if error.reply is not None:
            report["calls"].append(
                {"case": name, **error.reply.call_metadata(), "error": error.code}
            )
        raise
    report["calls"].append({"case": name, **reply.call_metadata()})
    report["keyAfterLastCall"] = await check_budget(provider.client, Decimal("1"))
    return reply


async def solution_case(provider, report, name, source, pages):
    reply = await note(provider, report, name, lambda: provider.recognize(pages, [source]))
    recognition = read_recognition(reply.raw, [source]).tasks[0]
    reviewed = ReviewTask(
        **source.model_dump(),
        steps=[
            StepInput(id=f"s{index}", latex=step.latex, legible=step.legible)
            for index, step in enumerate(recognition.steps, 1)
        ],
    )
    from app.analysis.contract import ConditionImage

    images = [ConditionImage(task_id=source.id, image=image, kind="solution") for image in pages]
    reply = await note(provider, report, name, lambda: provider.review([reviewed], images))
    review = read_review(reply.raw, [reviewed]).tasks[0]
    if name in {"correct", "geometry"}:
        passed = (
            bool(review.steps)
            and review.supported
            and all(step.verdict == "correct" for step in review.steps)
            and review.gap is None
        )
    elif name == "error":
        passed = any(step.verdict == "error" for step in review.steps)
    elif name == "missing":
        passed = (
            not recognition.matched
            and not recognition.steps
            and not review.steps
            and review.gap is None
        )
    else:
        passed = (
            not recognition.matched or any(not step.legible for step in recognition.steps)
        ) and review.gap is None
    report["cases"].append(
        {
            "name": name,
            "passed": passed,
            "recognition": recognition.model_dump(),
            "review": review.model_dump(),
        }
    )
    if not passed:
        raise ValueError("case_failed:" + name)


async def probe(output: Path):
    settings = Settings(analysis_variant="openrouter-qwen38-v1")
    variant = get_variant(settings.analysis_variant)
    provider = make_provider(variant, settings)
    assert isinstance(provider, OpenAiDraftProvider)
    provider.budget_stop_at = Decimal("0.80")
    report = {
        "variant": variant.name,
        "calls": [],
        "cases": [],
        "status": "running",
        "data": "synthetic; no personal data",
        "independentMathAcceptance": False,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    try:
        report["keyBefore"] = await check_budget(provider.client, Decimal("0.80"))
        cases = [
            (
                "correct",
                task("Решите уравнение в действительных числах", "x^2=4"),
                [page(["x^2 = 4", "x = 2 or x = -2"])],
            ),
            (
                "error",
                task("Решите уравнение в действительных числах", "x^2=4"),
                [page(["x^2 = 4", "x = 2", "Answer: 2"])],
            ),
            (
                "geometry",
                task(
                    "В треугольнике ABC стороны AB и AC равны. Докажите равенство углов ABC и BCA.",
                    "AB=AC",
                ),
                [
                    page(
                        [
                            "Triangle ABC, AB = AC",
                            "ABC is isosceles with base BC.",
                            "Base angles of an isosceles triangle are equal.",
                            "Therefore angle ABC = angle BCA.",
                        ]
                    )
                ],
            ),
            (
                "unreadable",
                task("Решите уравнение", "x^2=4"),
                [page(["x^2=4", "x=..."], unreadable=True)],
            ),
            ("missing", task("Решите уравнение", "x^2=4", files=[]), []),
        ]
        for name, source, pages in cases:
            await solution_case(provider, report, name, source, pages)
            output.write_text(json.dumps(report, ensure_ascii=False, indent=2))
        reply = await note(
            provider,
            report,
            "conditions",
            lambda: provider.recognize_conditions(
                "", [page(["Task 1. Solve x^2 = 9 over the real numbers."])]
            ),
        )
        conditions = recognized_conditions(reply.raw, [SYNTHETIC_FILE_ID])
        report["cases"].append({"name": "conditions", "passed": bool(conditions["tasks"])})
        reply = await note(
            provider,
            report,
            "material",
            lambda: provider.generate_material(
                "equations", "При извлечении квадратного корня теряет отрицательный корень."
            ),
        )
        material = MaterialContent.model_validate(reply.raw)
        report["cases"].append(
            {
                "name": "material",
                "passed": len(material.exercises) == 3,
                "result": material.model_dump(),
            }
        )
        report["status"] = "passed"
    except ProviderError as error:
        report.update(status="stopped", error=error.code)
    except ValueError as error:
        report.update(status="failed", error=str(error).split("\n", 1)[0][:200])
    finally:
        await provider.close()
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps({key: report[key] for key in ("status", "variant")}))
    return report["status"] == "passed"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if not asyncio.run(probe(args.output)):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
