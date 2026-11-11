import type { Topic } from "../domain/models";
import data from "./catalog.json";

export const familyIds = [
  "expressions",
  "fractions",
  "powers_roots",
  "equations",
  "inequalities",
  "trigonometry",
  "mixed",
  "geometry",
  "functions",
  "probability",
  "applications",
] as const;
export type FamilyId = (typeof familyIds)[number];

export interface TaskType {
  id: string;
  family: FamilyId | null;
  name: string;
  topicIds: string[];
  inScope: boolean;
}

export const unknownTopicName = "Тема не из справочника";
export const catalogVersion: string = data.version;
export const families = data.families as { id: FamilyId; name: string }[];
export const topics: Topic[] = data.topics;
export const taskTypes = data.taskTypes as TaskType[];
const aliases: Record<string, string> = data.aliases;
const topicIndex = new Map(topics.map((topic) => [topic.id, topic]));
const typeIndex = new Map(taskTypes.map((item) => [item.id, item]));

export const canonicalTopic = (id: string) => aliases[id] ?? id;
export const topicById = (id: string) => topicIndex.get(canonicalTopic(id));
export const topicLabel = (id: string) => topicById(id)?.name ?? unknownTopicName;
export const taskTypeById = (id: string) => typeIndex.get(id);
export const familyName = (id: string) => families.find((family) => family.id === id)?.name ?? id;
