import type { StepOrigin, StoreState, Task, Upload, Work } from "../domain/models";
import { publishWork } from "../domain/review";

function sheetLine(fileId: string, top: number, recognizedLatex: string): StepOrigin {
  return {
    fileId,
    page: 1,
    region: { x: 0.15, y: top / 1100, width: 0.62, height: 0.06 },
    recognizedLatex,
  };
}

function tasks(sheetId: string, reviewed = false): Task[] {
  return [
    {
      id: "t1",
      title: "Задача 1",
      condition: "Решите квадратное уравнение.",
      formula: "x^2-5x+6=0",
      reference: "x=2,\\;x=3",
      topicId: "equations",
      reviewed,
      omitted: false,
      feedback: "На множители разложено верно.",
      steps: [
        {
          id: "s1",
          latex: "(x-2)(x-3)=0",
          origin: sheetLine(sheetId, 222, "(x-2)(x-3)=0"),
          verdict: "correct",
          explanation: "Произведение равно нулю, если один из множителей равен нулю.",
        },
        {
          id: "s2",
          latex: "x=2\\;\\text{или}\\;x=3",
          origin: sheetLine(sheetId, 292, "x=2\\;\\text{или}\\;x=3"),
          verdict: "correct",
          explanation: "Оба значения удовлетворяют исходному уравнению.",
        },
      ],
    },
    {
      id: "t2",
      title: "Задача 2",
      condition: "Упростите выражение и укажите допустимые значения x.",
      formula: "\\frac{x^2-9}{x-3}",
      reference: "x+3,\\;x\\ne3",
      topicId: "domain",
      reviewed,
      omitted: false,
      feedback:
        "Преобразование верное, но исходный знаменатель не может быть равен нулю. Добавьте ограничение x ≠ 3.",
      steps: [
        {
          id: "s3",
          latex: "\\frac{(x-3)(x+3)}{x-3}=x+3",
          origin: sheetLine(sheetId, 505, "\\frac{(x-3)(x+3)}{x-3}=x+3"),
          verdict: "correct",
          explanation: "Сокращение допустимо при x ≠ 3.",
        },
        {
          id: "s4",
          latex: "x\\in\\mathbb{R}",
          origin: sheetLine(sheetId, 592, "x\\in\\mathbb{R}"),
          verdict: "error",
          explanation: "При x = 3 исходное выражение не определено.",
        },
      ],
      gap: {
        topicId: "domain",
        reason: "Почему знаменатель не равен нулю и как ОДЗ сохраняется при сокращении дроби.",
        decision: reviewed ? "confirmed" : "hypothesis",
      },
    },
  ];
}

export function seedState(now = Date.now()): StoreState {
  const students = [
    {
      id: "anna",
      name: "Анна Соколова",
      grade: 10,
      goal: "Подготовка к профильному ЕГЭ",
      color: "teal",
    },
    {
      id: "mikhail",
      name: "Михаил Орлов",
      grade: 9,
      goal: "Уверенно решать задания ОГЭ",
      color: "sand",
    },
    {
      id: "polina",
      name: "Полина Волкова",
      grade: 11,
      goal: "Разобраться с логарифмами",
      color: "lilac",
    },
    {
      id: "ivan",
      name: "Иван Лебедев",
      grade: 10,
      goal: "Закрыть пробелы по алгебре",
      color: "blue",
    },
  ];
  const config: Array<[string, string, string, Work["status"]]> = [
    ["demo-ready", "anna", "Уравнения и преобразования", "ready"],
    ["demo-confirmed", "anna", "Самостоятельная по рациональным дробям", "confirmed"],
    ["demo-input", "mikhail", "Повторение алгебры", "needs_input"],
    ["demo-failed", "polina", "Практика на преобразования", "failed"],
    ["demo-preparation", "ivan", "Домашняя работа по уравнениям", "preparation"],
  ];
  const works = config.map(([id, studentId, title, status], index): Work => {
    const draft = {
      revision: 1,
      inputRevision: 0,
      analysedInputRevision: status === "needs_input" ? -1 : 0,
      tasks: tasks("sheet-" + id, status === "confirmed"),
      feedback:
        "Начните с ограничений исходного выражения. Затем выполните преобразования и проверьте ответ.",
    };
    let work: Work = {
      id,
      studentId,
      title,
      status: status === "confirmed" ? "ready" : status,
      createdAt: new Date(now - index * 86400000).toISOString(),
      demo: true,
      manual: false,
      editing: true,
      attachments: [
        {
          id: "sheet-" + id,
          name: "Учебный пример.svg",
          type: "image/svg+xml",
          size: 1500,
          pages: 1,
          pageOrder: [1],
          crops: {},
          masks: {},
          checkedPages: [1],
        },
      ],
      draft,
      published: [],
      initialAnalysis: structuredClone(draft),
    };
    if (status === "confirmed") work = publishWork(work, new Date(now).toISOString());
    return work;
  });
  return { students, works, closures: [] };
}

export function fixtureUploads(state: StoreState): Upload[] {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="820" height="1100"><defs><pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M 28 0 L 0 0 0 28" fill="none" stroke="#dce7ea" stroke-width="1"/></pattern></defs><rect width="820" height="1100" fill="#fffefb"/><rect width="820" height="1100" fill="url(#grid)"/><path d="M85 0V1100" stroke="#e6c4bc"/><g fill="#374b64" font-family="Georgia,serif" font-style="italic"><text x="116" y="95" font-size="22">Учебный пример · алгебра</text><text x="116" y="190" font-size="32">1. x² − 5x + 6 = 0</text><text x="140" y="260" font-size="30">(x − 2)(x − 3) = 0</text><text x="140" y="330" font-size="30">x = 2 или x = 3</text><text x="116" y="470" font-size="32">2. Упростить (x² − 9) / (x − 3)</text><text x="140" y="550" font-size="29">(x − 3)(x + 3) / (x − 3) = x + 3</text><text x="140" y="630" font-size="30">x ∈ ℝ</text></g><text x="116" y="990" font-family="sans-serif" font-size="17" fill="#83928e">Вымышленная работа для знакомства с интерфейсом</text></svg>';
  return state.works.flatMap((work) =>
    work.attachments.map((file) => ({ ...file, blob: new Blob([svg], { type: "image/svg+xml" }) })),
  );
}
