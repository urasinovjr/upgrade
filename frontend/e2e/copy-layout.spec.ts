import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./onboarding";
import { auditPage } from "../e2e-visual/audit";

for (const width of [390, 768, 1024, 1440]) {
  for (const zoom of width === 1440 ? [1, 2] : [1]) {
    test.describe(`system copy at ${width}px and ${zoom * 100}%`, () => {
      test.use({
        viewport: { width: width / zoom, height: 1000 / zoom },
        deviceScaleFactor: zoom,
      });
      test("text reflows and controls keep their accessible names", async ({ page }, testInfo) => {
        test.setTimeout(90_000);
        await page.emulateMedia({ reducedMotion: "reduce" });
        for (const [name, url] of [
          ["landing", "/welcome"],
          ["dashboard", "/dashboard"],
          ["homework", "/homework"],
          ["review", "/works/demo-ready"],
          ["student", "/student?demo=anna"],
        ]) {
          await page.goto(url);
          await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
          await auditPage(page);
          if (name === "review") {
            await expect(
              page.getByRole("button", { name: "Опубликовать результат", exact: true }),
            ).toBeVisible();
            const accessibility = await new AxeBuilder({ page }).analyze();
            expect(accessibility.violations).toEqual([]);
            await page.keyboard.press("Tab");
            const focused = await page.evaluate(() => {
              const element = document.activeElement as HTMLElement;
              return (
                element !== document.body &&
                Boolean(element?.textContent || element?.getAttribute("aria-label"))
              );
            });
            expect(focused).toBe(true);
          }
          await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
        }
      });
    });
  }
}
