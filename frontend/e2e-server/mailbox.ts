import { expect, type APIRequestContext } from "@playwright/test";

const mailpit = "http://127.0.0.1:8025/api/v1";

export async function mailedLink(request: APIRequestContext, email: string): Promise<string> {
  let link = "";
  await expect(async () => {
    const found = await (
      await request.get(mailpit + "/search", { params: { query: "to:" + email } })
    ).json();
    expect(found.messages.length).toBeGreaterThan(0);
    const message = await (await request.get(mailpit + "/message/" + found.messages[0].ID)).json();
    link = message.Text.match(/https?:\/\/\S+token=[\w-]+/)[0];
  }).toPass({ timeout: 15_000 });
  return new URL(link).pathname + new URL(link).search;
}

export function uniqueEmail(prefix: string) {
  return prefix + "-" + Date.now() + "-" + Math.round(Math.random() * 1e6) + "@example.com";
}
