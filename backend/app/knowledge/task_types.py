from dataclasses import dataclass

from app.knowledge.families import Family


@dataclass(frozen=True)
class TaskType:
    id: str
    family: Family | None
    name: str
    topic_ids: tuple[str, ...]
    in_scope: bool = True


TASK_TYPES = (
    TaskType(
        "polynomial_simplify",
        "expressions",
        "Упрощение многочлена",
        ("polynomials", "short_multiplication"),
    ),
    TaskType(
        "short_multiplication_apply",
        "expressions",
        "Преобразование по формулам сокращённого умножения",
        ("short_multiplication",),
    ),
    TaskType(
        "factor_expression",
        "expressions",
        "Разложение выражения на множители",
        ("factoring", "quadratic_trinomial"),
    ),
    TaskType(
        "log_expression",
        "expressions",
        "Вычисление и преобразование логарифмического выражения",
        ("logs",),
    ),
    TaskType("numeric_fractions", "fractions", "Вычисления с числовыми дробями", ("fractions",)),
    TaskType(
        "rational_simplify",
        "fractions",
        "Сокращение алгебраической дроби",
        ("rational_expressions", "factoring"),
    ),
    TaskType(
        "rational_operations",
        "fractions",
        "Действия с алгебраическими дробями",
        ("rational_expressions",),
    ),
    TaskType(
        "power_simplify",
        "powers_roots",
        "Преобразование выражения со степенями",
        ("powers", "rational_powers"),
    ),
    TaskType(
        "root_simplify",
        "powers_roots",
        "Преобразование выражения с корнями",
        ("sqrt_arithmetic", "nth_roots"),
    ),
    TaskType(
        "irrational_denominator",
        "powers_roots",
        "Избавление от иррациональности в знаменателе",
        ("sqrt_arithmetic", "short_multiplication"),
    ),
    TaskType("linear_eq", "equations", "Линейное уравнение", ("linear_equations",)),
    TaskType("quadratic_eq", "equations", "Квадратное уравнение", ("equations", "vieta")),
    TaskType(
        "rational_eq",
        "equations",
        "Дробно-рациональное уравнение",
        ("rational_equations", "domain"),
    ),
    TaskType(
        "substitution_eq",
        "equations",
        "Уравнение с заменой переменной",
        ("substitution", "equations"),
    ),
    TaskType("modulus_eq", "equations", "Уравнение с модулем", ("modulus",)),
    TaskType("irrational_eq", "equations", "Иррациональное уравнение", ("roots", "domain")),
    TaskType("exponential_eq", "equations", "Показательное уравнение", ("exponential_equations",)),
    TaskType("log_eq", "equations", "Логарифмическое уравнение", ("log_equations", "domain")),
    TaskType("system_eq", "equations", "Система уравнений", ("systems",)),
    TaskType("linear_ineq", "inequalities", "Линейное неравенство", ("linear_inequalities",)),
    TaskType("quadratic_ineq", "inequalities", "Квадратное неравенство", ("inequalities",)),
    TaskType(
        "rational_ineq",
        "inequalities",
        "Дробно-рациональное неравенство",
        ("rational_inequalities",),
    ),
    TaskType(
        "modulus_ineq",
        "inequalities",
        "Неравенство с модулем",
        ("modulus", "inequalities"),
    ),
    TaskType(
        "irrational_ineq",
        "inequalities",
        "Иррациональное неравенство",
        ("irrational_inequalities",),
    ),
    TaskType(
        "exponential_ineq",
        "inequalities",
        "Показательное неравенство",
        ("exponential_inequalities",),
    ),
    TaskType(
        "log_ineq",
        "inequalities",
        "Логарифмическое неравенство",
        ("log_inequalities", "domain"),
    ),
    TaskType(
        "trig_values",
        "trigonometry",
        "Вычисление значений тригонометрических функций",
        ("unit_circle", "reduction_formulas"),
    ),
    TaskType(
        "trig_simplify",
        "trigonometry",
        "Упрощение тригонометрического выражения",
        ("trig_identities", "double_angle", "reduction_formulas"),
    ),
    TaskType(
        "trig_basic_eq",
        "trigonometry",
        "Простейшее тригонометрическое уравнение",
        ("trig_equations", "inverse_trig"),
    ),
    TaskType(
        "trig_quadratic_eq",
        "trigonometry",
        "Тригонометрическое уравнение, сводящееся к квадратному",
        ("trig_equations", "substitution"),
    ),
    TaskType(
        "trig_homogeneous_eq",
        "trigonometry",
        "Однородное тригонометрическое уравнение",
        ("trig_equations",),
    ),
    TaskType(
        "trig_eq_selection",
        "trigonometry",
        "Тригонометрическое уравнение с отбором корней",
        ("trig_root_selection",),
    ),
    TaskType("trig_ineq", "trigonometry", "Тригонометрическое неравенство", ("trig_inequalities",)),
    TaskType("derivative", None, "Производная и исследование функции", (), False),
    TaskType("word_problem", None, "Текстовая задача", (), False),
    TaskType("probability", None, "Вероятность и комбинаторика", (), False),
    TaskType("geometry", None, "Геометрическая задача", (), False),
    TaskType("graph_reading", None, "Задача по графику функции", (), False),
)
TASK_TYPE_IDS = frozenset(item.id for item in TASK_TYPES)
OUT_OF_SCOPE_TYPES = frozenset(item.id for item in TASK_TYPES if not item.in_scope)
