export const families = [
  { id: "expressions", label: "Выражения" },
  { id: "fractions", label: "Дроби" },
  { id: "powers_roots", label: "Степени и корни" },
  { id: "equations", label: "Уравнения" },
  { id: "inequalities", label: "Неравенства" },
  { id: "mixed", label: "Несколько разделов" },
] as const;

export type FamilyId = (typeof families)[number]["id"];
