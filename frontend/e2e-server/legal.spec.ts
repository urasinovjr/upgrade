import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signUp } from "./setup";

for (const width of [390, 1440]) {
  test(`legal documents are public at ${width}px @mobile`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const [path, title] of [
      ["terms", "Условия использования"],
      ["personal-data", "Согласие на обработку персональных данных"],
    ]) {
      await page.goto("/legal/" + path);
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await expect(page.locator("main")).toContainText("2026-11-11");
      await expect(page.getByRole("link", { name: "daniilurasinov@mail.ru" })).toHaveAttribute(
        "href",
        "mailto:daniilurasinov@mail.ru",
      );
      for (const zoom of [1, 2]) {
        await page.evaluate((value) => {
          document.documentElement.style.zoom = String(value);
        }, zoom);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true);
      }
      await page.evaluate(() => {
        document.documentElement.style.zoom = "1";
      });
      const audit = await new AxeBuilder({ page }).analyze();
      expect(
        audit.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? "")),
      ).toEqual([]);
    }
    await page.getByRole("link", { name: "Регистрация", exact: true }).click();
    await expect(page).toHaveURL(/\/register$/);
    await expect(page.getByRole("checkbox")).toHaveCount(2);
  });
}

test("TLS login uses secure cookies and configured consent versions", async ({ page, request }) => {
  const config = await (await request.get("/api/auth/config")).json();
  expect(config.termsVersion).toBe("2026-11-11");
  expect(config.personalDataVersion).toBe("2026-11-11");
  await signUp(page, request, "tls-consents");
  if (process.env.E2E_BASE_URL?.startsWith("https://")) {
    const session = (await page.context().cookies()).find(
      (cookie) => cookie.name === "upgrade_session",
    );
    expect(session?.secure).toBe(true);
    expect(session?.httpOnly).toBe(true);
  }
});
