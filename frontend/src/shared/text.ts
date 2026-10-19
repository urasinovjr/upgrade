export function wordForCount(count: number, forms: readonly [string, string, string]): string {
  const value = Math.abs(count) % 100;
  if (value >= 11 && value <= 14) return forms[2];
  const last = value % 10;
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function date(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(
    new Date(value),
  );
}

export function dayLabel(day: string) {
  return date(day + "T12:00:00");
}

export function duration(ms: number) {
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes < 60) return minutes + " мин";
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours + " ч";
  const days = Math.round(hours / 24);
  return days + " " + wordForCount(days, ["день", "дня", "дней"]);
}
