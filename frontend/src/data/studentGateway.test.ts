import { expect, it, vi } from "vitest";
import { newHomeworkTask } from "../domain/homework";
import { studentGateway } from "./studentGateway";

const { read, list } = vi.hoisted(() => ({ read: vi.fn(), list: vi.fn() }));
vi.mock("./gateway", () => ({ serverMode: false, gateway: { read, homework: { list } } }));

it("projects only the pupil's assigned conditions and referenced images in demo mode", async () => {
  read.mockResolvedValue({ students: [], works: [], closures: [] });
  const task = { ...newHomeworkTask(), conditionFileIds: ["used"], confirmed: true };
  const file = {
    id: "used",
    name: "condition.png",
    type: "image/png",
    pages: 1,
    masks: {},
    checkedPages: [],
  };
  list.mockResolvedValue([
    {
      id: "homework-1",
      title: "Геометрия",
      tasks: [task],
      deadline: null,
      sourceText: "Частный текст подготовки",
      recognitionJobId: "private-job",
      files: [file, { ...file, id: "private" }],
      assignments: [
        { id: "own-assignment", studentId: "pupil-1" },
        { id: "other-assignment", studentId: "pupil-2" },
      ],
    },
  ]);
  const state = await studentGateway.state("pupil-1");
  expect(state.assignments).toHaveLength(1);
  expect(state.assignments[0]).toEqual({
    id: "own-assignment",
    title: "Геометрия",
    tasks: [task],
    deadline: null,
    files: [file],
  });
  expect(state.submissions).toEqual([]);
  expect(state.knowledge).toEqual([]);
});
