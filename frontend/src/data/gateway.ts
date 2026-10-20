import type { Closure, Draft, Report, StoreState, Student, Upload, Work } from "../domain/models";
import type { DashboardLayout } from "../domain/dashboardLayout";
import { httpGateway } from "./httpGateway";
import { localGateway } from "./localGateway";

export interface Gateway {
  read(): Promise<StoreState>;
  asset(id: string): Promise<Blob>;
  student(student: Student): Promise<void>;
  create(work: Work, uploads: Upload[]): Promise<void>;
  draft(id: string, draft: Draft): Promise<void>;
  action(
    id: string,
    action: "analyse" | "manual" | "confirm" | "edit" | "withdraw",
    outcome?: "ready" | "failed" | "needs_input",
  ): Promise<void>;
  closure(closure: Closure): Promise<void>;
  report(id: string, revisionId?: string): Promise<Report>;
  attachments(id: string, attachments: Work["attachments"]): Promise<void>;
  archiveStudent(id: string, archived: boolean): Promise<void>;
  removeStudent(id: string): Promise<void>;
  removeWork(id: string): Promise<void>;
  layout(): Promise<DashboardLayout>;
  saveLayout(layout: DashboardLayout): Promise<void>;
}

export const serverMode = Boolean(import.meta.env.VITE_API_URL);
export const gateway: Gateway = serverMode ? httpGateway : localGateway;
