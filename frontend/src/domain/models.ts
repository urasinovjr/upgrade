export type WorkStatus =
  "preparation" | "queued" | "processing" | "needs_input" | "ready" | "confirmed" | "failed";
export type Verdict = "correct" | "error" | "uncertain";
export type GapDecision = "hypothesis" | "confirmed" | "rejected";

export interface Student {
  id: string;
  name: string;
  grade: number;
  goal: string;
  color: string;
  archivedAt?: string;
}
export interface StepOrigin {
  fileId: string;
  page: number;
  region: CropRect;
  recognizedLatex: string;
}
export interface Step {
  id: string;
  latex: string;
  verdict: Verdict;
  explanation: string;
  origin?: StepOrigin;
}
export interface GapProposal {
  topicId: string;
  reason: string;
  decision: GapDecision;
}
export interface Task {
  id: string;
  title: string;
  condition: string;
  conditionAttachmentIds?: string[];
  formula: string;
  reference: string;
  topicId: string;
  steps: Step[];
  feedback: string;
  reviewed: boolean;
  omitted: boolean;
  gap?: GapProposal;
}
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
  pages: number;
  pageOrder: number[];
  crops: Record<string, CropRect>;
  masks: Record<string, CropRect[]>;
  checkedPages: number[];
}
export interface Upload extends Attachment {
  blob: Blob;
}
export interface Draft {
  revision: number;
  inputRevision: number;
  analysedInputRevision: number;
  tasks: Task[];
  feedback: string;
}
export interface AnalysisInfo {
  runId: string;
  provider: string;
  model: string;
  promptVersion: string;
  finishedAt: string;
}
export interface PublishedRevision {
  id: string;
  number: number;
  confirmedAt: string;
  draft: Draft;
  attachments: Attachment[];
  analysis?: AnalysisInfo;
}
export interface Job {
  token: string;
  inputRevision: number;
  startedAt: number;
  completesAt: number;
  outcome: "ready" | "failed" | "needs_input";
}
export interface Work {
  id: string;
  studentId: string;
  title: string;
  createdAt: string;
  demo: boolean;
  status: WorkStatus;
  attachments: Attachment[];
  draft: Draft;
  published: PublishedRevision[];
  currentPublishedId?: string;
  editing: boolean;
  manual: boolean;
  job?: Job;
  initialAnalysis?: Draft;
  analysis?: AnalysisInfo;
}
export interface Topic {
  id: string;
  name: string;
  shortName?: string;
  description: string;
  prerequisites: string[];
  grade?: number;
  family?: string;
}
export interface Closure {
  studentId: string;
  topicId: string;
  note: string;
  at: string;
  action: "close" | "reopen";
}
export interface StoreState {
  students: Student[];
  works: Work[];
  closures: Closure[];
  catalogVersion?: string;
}
export interface Evidence {
  workId: string;
  taskId: string;
  title: string;
  revisionId: string;
}
export interface StudentGap {
  topicId: string;
  reason: string;
  evidence: Evidence[];
  closed: boolean;
  closure?: Closure;
}
export interface Report {
  work: Work;
  student: Student;
  revision: PublishedRevision;
}
