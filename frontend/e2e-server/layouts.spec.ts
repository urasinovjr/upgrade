import { test, expect } from "./test";
import { enrollInPilot } from "./database";
import { signUp, addStudent } from "./setup";

for (const suffix of ["", " @mobile"]) {
  test("long student name fits the stopwatch" + suffix, async ({ page, request }, testInfo) => {
    test.setTimeout(90_000);
    const email = await signUp(page, request, "long-name");
    enrollInPilot(email);
    const name = "Александра Константинопольская-Длиннофамильская";
    const id = await addStudent(page, name);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/timing");
      await expect(page.getByRole("heading", { name: "Секундомер", exact: true })).toBeVisible();
      const select = page.getByRole("combobox", { name: "Ученик", exact: true });
      await select.selectOption(id);
      await expect(select.locator("option:checked")).toHaveText(name);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.evaluate(() => scrollTo(150, 0));
      expect(await page.evaluate(() => scrollX)).toBe(0);
      await page.screenshot({ path: testInfo.outputPath("stopwatch-" + width + ".png") });
    }
  });
}
