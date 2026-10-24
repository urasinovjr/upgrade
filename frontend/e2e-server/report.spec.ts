import { expect, test, type Download } from "@playwright/test";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { addCheckedWork, addStudent, signUp, startAnalysis, waitForAnalysis } from "./setup";

async function pdfContent(download: Download) {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const document = await getDocument({ data: new Uint8Array(Buffer.concat(chunks)) }).promise;
  let text = "";
  let images = 0;
  for (let number = 1; number <= document.numPages; number += 1) {
    const page = await document.getPage(number);
    const content = await page.getTextContent();
    text += content.items.map((item) => ("str" in item ? item.str : "")).join(" ") + "\n";
    const operators = await page.getOperatorList();
    images += operators.fnArray.filter((code) => code === OPS.paintImageXObject).length;
  }
  return { text, images };
}

function compact(text: string) {
  return text.replace(/\s+/g, "");
}

test("copied text and PDF come from the same confirmed revision", async ({
  page,
  request,
  context,
}, testInfo) => {
  test.setTimeout(150_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: testInfo.project.use.baseURL,
  });
  await signUp(page, request, "report");
  const studentId = await addStudent(page, "Мария");
  const workId = await addCheckedWork(page, studentId, "Отчёт с формулами", [
    { condition: "Решите x + 1 = 2" },
  ]);

  await page.goto("/works/" + workId);
  await startAnalysis(page);
  await waitForAnalysis(page);
  await page.getByRole("button", { name: "Отметить задачу проверенной" }).click();
  await page.getByRole("button", { name: "Подтвердить работу", exact: true }).click();
  await page.getByRole("link", { name: "Отчёт, версия 1" }).click();
  await page.getByRole("button", { name: "Скопировать текст" }).click();
  await expect(page.getByRole("button", { name: "Скопировано" })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать PDF" }).click();
  const { text, images } = await pdfContent(await downloading);

  expect(copied).toContain("Версия 1");
  for (const line of ["Отчёт с формулами", "Мария", "Решите x + 1 = 2", "Решение верное."]) {
    expect(copied).toContain(line);
    expect(compact(text)).toContain(compact(line));
  }
  expect(compact(text)).toContain(compact("Проверено репетитором · версия 1"));
  expect(images).toBeGreaterThan(0);
});
