from app.evaluation.homework_gate import group_problems, materials_problems


def row(number, family="geometry", task_type="geometry", verdict="correct", correct="yes"):
    return {
        "work_id": str(number),
        "task_id": "t",
        "family": family,
        "task_type": task_type,
        "expert_correct": correct,
        "ai_verdict": verdict,
        "refused": "no",
        "first_error_match": "yes",
        "explanation_ok": "yes",
        "recognition_ok": "yes",
    }


def test_acceptance_requires_two_groups_and_geometry_coverage():
    assert group_problems([])
    rows = [row(i) for i in range(100)]
    assert any("other" in problem for problem in group_problems(rows))
    rows[0]["task_type"] = "solid_geometry"
    rows[1]["task_type"] = "geometry_proof"
    rows += [row(i, "equations", "quadratic_eq") for i in range(100, 200)]
    assert group_problems(rows) == []
    for item in rows[:11]:
        item["ai_verdict"] = "uncertain"
    assert any("geometry: не пройдены" in problem for problem in group_problems(rows))


def test_acceptance_fails_on_false_errors_and_missing_materials(tmp_path):
    rows = [
        row(i, task_type=("geometry", "solid_geometry", "geometry_proof")[i % 3])
        for i in range(100)
    ]
    rows += [row(i, "equations", "quadratic_eq") for i in range(100, 200)]
    for item in rows[:6]:
        item["ai_verdict"] = "error"
    assert group_problems(rows)
    assert materials_problems(tmp_path / "missing.csv")
