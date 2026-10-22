import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import { toPng } from "html-to-image";
import { convertLatexToMarkup } from "mathlive";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import type { Report } from "../../domain/models";
import { gateway } from "../../data/gateway";
import { topics } from "../../data/fixtures";
import { verdictMeta, type Tone } from "../../shared/status";
pdfMake.addVirtualFileSystem(pdfFonts);

function palette() {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) =>
    style.getPropertyValue("--ug-" + name).trim() || fallback;
  const tones: Record<Tone, string> = {
    action: token("action", "#26348c"),
    marker: token("on-marker", "#161a2c"),
    pencil: token("pencil-strong", "#474e5f"),
    success: token("success", "#1f7448"),
    warning: token("warning", "#87570f"),
    danger: token("danger", "#c8352a"),
    neutral: token("neutral", "#4f5568"),
  };
  return {
    brand: token("action", "#26348c"),
    ink: token("ink", "#161a2c"),
    text: token("text", "#3a4056"),
    muted: token("muted", "#5f6578"),
    line: token("line", "#e4e6e1"),
    bg: token("bg", "#f5f6f3"),
    markerSoft: token("marker-soft", "#eef9c4"),
    warningSoft: token("warning-soft", "#fbf1df"),
    tones,
  };
}
type Palette = ReturnType<typeof palette>;

function box(stack: Content[], fill: string): Content {
  return {
    table: { widths: ["*"], body: [[{ stack, fillColor: fill, margin: [10, 8, 10, 8] }]] },
    layout: "noBorders",
    margin: [0, 6, 0, 6],
  };
}

function readDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Не удалось прочитать изображение условия."));
    reader.readAsDataURL(blob);
  });
}

async function attachmentImages(id: string): Promise<string[]> {
  const blob = await gateway.asset(id);
  if (blob.type !== "application/pdf") return [await readDataUrl(blob)];
  const { pdfImages } = await import("../../shared/PdfPage");
  return pdfImages(blob);
}

async function formulaImage(latex: string, colors: Palette): Promise<Content> {
  const element = document.createElement("div");
  element.className = "pdf-formula";
  element.innerHTML = convertLatexToMarkup(latex);
  element.style.cssText =
    "position:fixed;left:-10000px;top:0;width:max-content;padding:14px 16px;font-size:22px;background:white;color:" +
    colors.ink;
  document.body.appendChild(element);
  try {
    await document.fonts.ready;
    const width = element.getBoundingClientRect().width;
    const url = await toPng(element, {
      pixelRatio: 3,
      backgroundColor: "#ffffff",
      style: { position: "static", left: "auto", top: "auto" },
    });
    return { image: url, width: Math.min(width * 0.7, 480), margin: [0, 2, 0, 5] };
  } finally {
    element.remove();
  }
}
export async function downloadReport(report: Report) {
  const { work, student, revision } = report;
  const colors = palette();
  const content: Content[] = [
    { text: "UpGrade", fontSize: 18, bold: true, color: colors.brand, margin: [0, 0, 0, 16] },
    { text: work.title, fontSize: 19, bold: true, margin: [0, 0, 0, 8] },
    { text: student.name + " · " + student.grade + " класс", fontSize: 12, color: colors.text },
    {
      text: "Редакция " + revision.number + " · подтверждено преподавателем",
      color: colors.muted,
      fontSize: 9,
      margin: [0, 5, 0, 20],
    },
  ];
  for (const task of revision.draft.tasks) {
    content.push(
      {
        canvas: [
          { type: "line", x1: 0, y1: 0, x2: 511, y2: 0, lineWidth: 0.75, lineColor: colors.line },
        ],
        margin: [0, 10, 0, 0],
      },
      { text: task.title, fontSize: 14, bold: true, margin: [0, 12, 0, 8] },
    );
    if (task.condition) content.push({ text: task.condition, margin: [0, 0, 0, 6] });
    for (const id of task.conditionAttachmentIds || []) {
      for (const source of await attachmentImages(id))
        content.push({ image: source, fit: [480, 550], margin: [0, 8, 0, 12] });
    }
    if (task.formula) content.push(await formulaImage(task.formula, colors));
    if (task.omitted) {
      content.push(
        box(
          [
            {
              text: "Отложена для отдельной проверки: " + (task.feedback || "Требуется уточнение."),
              color: colors.tones.warning,
            },
          ],
          colors.warningSoft,
        ),
      );
      continue;
    }
    for (const [index, step] of task.steps.entries()) {
      const formula = await formulaImage(step.latex, colors);
      const verdict = verdictMeta[step.verdict];
      content.push({
        stack: [
          {
            text: "Шаг " + (index + 1) + " · " + verdict.label,
            bold: true,
            color: colors.tones[verdict.tone],
            fontSize: 10,
          },
          formula,
          { text: step.explanation, fontSize: 10, color: colors.text, margin: [0, 0, 0, 12] },
        ],
        unbreakable: true,
      });
    }
    if (task.feedback)
      content.push(
        box(
          [
            { text: "Обратная связь", bold: true, fontSize: 11, margin: [0, 0, 0, 4] },
            { text: task.feedback, color: colors.text },
          ],
          colors.bg,
        ),
      );
    const { gap } = task;
    if (gap?.decision === "confirmed") {
      const topic = topics.find((item) => item.id === gap.topicId);
      content.push(
        box(
          [
            {
              text: "Что повторить" + (topic ? " · " + topic.name : ""),
              bold: true,
              fontSize: 11,
              color: colors.ink,
              margin: [0, 0, 0, 4],
            },
            { text: gap.reason, color: colors.text },
          ],
          colors.markerSoft,
        ),
      );
    }
  }
  if (revision.draft.feedback)
    content.push(
      { text: "Что дальше", bold: true, fontSize: 14, margin: [0, 20, 0, 8] },
      { text: revision.draft.feedback, color: colors.text },
    );
  const definition: TDocumentDefinitions = {
    pageSize: "A4",
    pageMargins: [42, 42, 42, 48],
    defaultStyle: { font: "Roboto", fontSize: 11, lineHeight: 1.35, color: colors.ink },
    content,
    footer: (page, total) => ({
      columns: [
        { text: "UpGrade · Отчёт по работе", color: colors.muted },
        { text: page + " / " + total, alignment: "right", color: colors.muted },
      ],
      margin: [42, 15, 42, 0],
      fontSize: 8,
    }),
    info: { title: work.title, author: "UpGrade" },
  };
  const blob = await pdfMake.createPdf(definition).getBlob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "UpGrade-report-v" + revision.number + ".pdf";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
