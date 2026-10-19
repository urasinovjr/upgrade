import {
  AlertCircle,
  Check,
  CheckCircle2,
  CircleHelp,
  Clock3,
  FileEdit,
  LoaderCircle,
  PencilLine,
  type LucideIcon,
} from "lucide-react";
import type { Verdict, WorkStatus } from "../domain/models";

export type Tone = "blue" | "success" | "warning" | "danger" | "neutral" | "violet";

const studentTones: Record<string, Tone> = {
  teal: "success",
  sand: "warning",
  lilac: "violet",
  blue: "blue",
};
export const studentTone = (color: string): Tone => studentTones[color] ?? "neutral";

export const statusMeta: Record<WorkStatus, { label: string; tone: Tone; Icon: LucideIcon }> = {
  ready: { label: "К проверке", tone: "blue", Icon: FileEdit },
  confirmed: { label: "Подтверждена", tone: "success", Icon: CheckCircle2 },
  needs_input: { label: "Нужно уточнить", tone: "warning", Icon: CircleHelp },
  failed: { label: "Ошибка обработки", tone: "danger", Icon: AlertCircle },
  preparation: { label: "Подготовка", tone: "neutral", Icon: PencilLine },
  processing: { label: "Обработка", tone: "neutral", Icon: LoaderCircle },
  queued: { label: "В очереди", tone: "neutral", Icon: Clock3 },
};

export const verdictMeta: Record<Verdict, { label: string; tone: Tone; Icon: LucideIcon }> = {
  correct: { label: "Верно", tone: "success", Icon: Check },
  error: { label: "Есть ошибка", tone: "danger", Icon: AlertCircle },
  uncertain: { label: "Нужно уточнить", tone: "warning", Icon: CircleHelp },
};
