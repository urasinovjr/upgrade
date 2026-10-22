import { execFileSync } from "node:child_process";

function compose(...args: string[]) {
  return execFileSync("docker", ["compose", "-f", "../compose.yaml", "exec", "-T", ...args], {
    encoding: "utf8",
  });
}

function quoted(value: string) {
  return "'" + value.replaceAll("'", "''") + "'";
}

export function resetRateLimits() {
  compose("db", "psql", "-U", "upgrade", "-d", "upgrade", "-c", "DELETE FROM rate_limits");
}

export function enrollInPilot(email: string) {
  compose("api", "python", "-m", "app.cli", "pilot-enroll", "--email", email);
}

export function countFor(table: string, email: string) {
  const sql =
    "SELECT count(*) FROM " +
    table +
    " WHERE teacher_id = (SELECT id FROM users WHERE email = " +
    quoted(email) +
    ")";
  return Number(compose("db", "psql", "-U", "upgrade", "-d", "upgrade", "-tAc", sql).trim());
}

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
