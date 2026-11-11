import { execFileSync } from "node:child_process";

const databaseName = process.env.E2E_DATABASE_NAME ?? "upgrade";

function compose(...args: string[]) {
  const project = process.env.E2E_COMPOSE_PROJECT;
  return execFileSync(
    "docker",
    [
      "compose",
      ...(project ? ["-p", project] : []),
      "-f",
      process.env.E2E_COMPOSE_FILE ?? "../compose.yaml",
      "exec",
      "-T",
      ...(args[0] === "api" && process.env.E2E_DATABASE_NAME
        ? ["-e", "DATABASE_URL=postgresql+asyncpg://upgrade:upgrade@db:5432/" + databaseName]
        : []),
      ...args,
    ],
    {
      encoding: "utf8",
    },
  );
}

function quoted(value: string) {
  return "'" + value.replaceAll("'", "''") + "'";
}

export function resetRateLimits() {
  compose("db", "psql", "-U", "upgrade", "-d", databaseName, "-c", "DELETE FROM rate_limits");
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
  compose("db", "psql", "-U", "upgrade", "-d", "upgrade", "-c", sql);
}
