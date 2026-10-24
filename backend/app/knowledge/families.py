from typing import Literal

Family = Literal[
    "expressions",
    "fractions",
    "powers_roots",
    "equations",
    "inequalities",
    "trigonometry",
    "mixed",
]

FAMILY_NAMES: dict[Family, str] = {
    "expressions": "Выражения",
    "fractions": "Дроби",
    "powers_roots": "Степени и корни",
    "equations": "Уравнения",
    "inequalities": "Неравенства",
    "trigonometry": "Тригонометрия",
    "mixed": "Несколько разделов",
}
