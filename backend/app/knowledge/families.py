from typing import Literal

Family = Literal[
    "expressions",
    "fractions",
    "powers_roots",
    "equations",
    "inequalities",
    "trigonometry",
    "mixed",
    "geometry",
    "functions",
    "probability",
    "applications",
]

FAMILY_NAMES: dict[Family, str] = {
    "expressions": "Выражения",
    "fractions": "Дроби",
    "powers_roots": "Степени и корни",
    "equations": "Уравнения",
    "inequalities": "Неравенства",
    "trigonometry": "Тригонометрия",
    "mixed": "Несколько разделов",
    "geometry": "Геометрия",
    "functions": "Функции и анализ",
    "probability": "Вероятность и статистика",
    "applications": "Прикладные задачи",
}
