import { execFileSync } from "node:child_process";

export function endSubscription(email: string) {
  const sql =
    "UPDATE subscriptions SET starts_at = now() - interval '15 days', " +
    "ends_at = now() - interval '1 day' WHERE user_id = " +
    "(SELECT id FROM users WHERE email = '" +
    email.replaceAll("'", "''") +
    "')";
  execFileSync("docker", [
    "compose",
    "-f",
    "../compose.yaml",
    "exec",
    "-T",
    "db",
    "psql",
    "-U",
    "upgrade",
    "-d",
    "upgrade",
    "-c",
    sql,
  ]);
}
