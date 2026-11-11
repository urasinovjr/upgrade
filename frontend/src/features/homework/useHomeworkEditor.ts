import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { gateway } from "../../data/gateway";
import type { Homework, HomeworkFile, HomeworkTask } from "../../domain/homework";
import { useStore } from "../../shared/query";
import { useWriteAccess } from "../../shared/session";
import { errorText } from "../../shared/text";
import { useActiveTime } from "../timing/useActiveTime";
import { useHomeworkDraft } from "./useHomeworkDraft";
function deadlineValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
export function homeworkAttachment(file: HomeworkFile) {
  return {
    ...file,
    size: 0,
    crops: {},
    pageOrder: Array.from({ length: file.pages }, (_, index) => index + 1),
  };
}

export function useHomeworkEditor({ homework }: { homework: Homework }) {
  const draft = useHomeworkDraft(homework);
  const { title, tasks, source, setTitle, setTasks, setSource, dirty } = draft;
  const [deadline, setDeadline] = useState(deadlineValue(homework.deadline));
  const [recipients, setRecipients] = useState<string[]>(() => {
    const student = new URLSearchParams(location.search).get("student");
    return student ? [student] : [];
  });
  const [submitting, setSubmitting] = useState<string>();
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const [params, setParams] = useSearchParams();
  const client = useQueryClient();
  const navigate = useNavigate();
  const store = useStore();
  const access = useWriteAccess();
  const frozen = Boolean(homework.assignedAt);
  useActiveTime(
    frozen ? (submitting ? "teacher_upload" : undefined) : "preparation",
    undefined,
    homework.id,
  );
  const stage = frozen ? "assign" : (params.get("stage") ?? (tasks.length ? "review" : "source"));
  const goStage = (stage: string) =>
    setParams(
      (previous) => {
        previous.set("stage", stage);
        return previous;
      },
      { replace: true },
    );
  const students = store.data?.students.filter((student) => !student.archivedAt) ?? [];
  const completed = tasks.filter((task) => task.confirmed).length;
  const jobId = params.get("job") ?? homework.recognitionJobId;
  const job = useQuery({
    queryKey: ["homework-job", jobId],
    queryFn: () => gateway.homework.job(jobId!),
    enabled: Boolean(jobId),
    refetchInterval: (query) => (query.state.data?.status === "queued" ? 1500 : false),
  });
  const change = useMutation({
    mutationFn: (run: () => Promise<Homework>) => run(),
    onSuccess: async (item) => {
      draft.saved(item);
      client.setQueryData<Homework[]>(
        ["homework"],
        (items) => items?.map((stored) => (stored.id === item.id ? item : stored)) ?? [item],
      );
      await client.invalidateQueries({ queryKey: ["homework"] });
    },
  });
  const recognize = useMutation({
    mutationFn: async () => {
      const saved = dirty
        ? await gateway.homework.save(homework.id, {
            title,
            tasks,
            sourceText: source,
            baseRevision: draft.revision,
          })
        : homework;
      draft.saved(saved);
      client.setQueryData<Homework[]>(["homework"], (items) =>
        items?.map((item) => (item.id === saved.id ? saved : item)),
      );
      return gateway.homework.recognize(
        homework.id,
        source,
        homework.files.map((file) => file.id),
        saved.revision,
      );
    },
    onSuccess: (job) =>
      setParams(
        (previous) => {
          previous.set("job", job.id);
          return previous;
        },
        { replace: true },
      ),
  });
  const copy = useMutation({
    mutationFn: () => gateway.homework.copy(homework.id),
    onSuccess: async (item) => {
      await client.invalidateQueries({ queryKey: ["homework"] });
      navigate("/homework/" + item.id);
    },
  });
  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      let saved = dirty ? await saveDraft() : homework;
      draft.saved(saved);
      setUploadProgress({ done: 0, total: files.length });
      const failed: string[] = [];
      for (const [index, file] of files.entries()) {
        try {
          saved = await gateway.homework.upload(homework.id, file);
          draft.saved(saved);
          client.setQueryData<Homework[]>(["homework"], (items) =>
            items?.map((item) => (item.id === saved.id ? saved : item)),
          );
        } catch (error) {
          failed.push(file.name + ": " + errorText(error));
        }
        setUploadProgress({ done: index + 1, total: files.length });
      }
      if (failed.length)
        throw new Error(
          "Не загружены: " + failed.join(", ") + ". Остальные загруженные файлы сохранены",
        );
      return saved;
    },
    onSettled: () => client.invalidateQueries({ queryKey: ["homework"] }),
  });
  const busy = change.isPending || recognize.isPending || upload.isPending;
  const writable = access.allowed && !busy;
  const saveDraft = () =>
    gateway.homework.save(homework.id, {
      title,
      tasks,
      sourceText: source,
      baseRevision: draft.revision,
    });
  const save = () => change.mutate(saveDraft);
  const update = (task: HomeworkTask) =>
    setTasks(tasks.map((item) => (item.id === task.id ? task : item)));
  const date = deadline ? new Date(deadline).toISOString() : null;
  const applyRecognition = () => {
    if (job.data?.result && "tasks" in job.data.result) {
      setTasks([...tasks, ...job.data.result.tasks]);
      setParams(
        (previous) => {
          previous.delete("job");
          previous.set("stage", "review");
          previous.set("applied", job.data!.id);
          return previous;
        },
        { replace: true },
      );
    }
  };
  return {
    homework,
    draft,
    title,
    tasks,
    source,
    setTitle,
    setTasks,
    setSource,
    dirty,
    deadline,
    setDeadline,
    recipients,
    setRecipients,
    submitting,
    setSubmitting,
    uploadProgress,
    setUploadProgress,
    params,
    setParams,
    client,
    navigate,
    store,
    access,
    frozen,
    stage,
    goStage,
    students,
    completed,
    jobId,
    job,
    change,
    recognize,
    copy,
    upload,
    busy,
    writable,
    saveDraft,
    save,
    update,
    date,
    applyRecognition,
  };
}
export type HomeworkEditorState = ReturnType<typeof useHomeworkEditor>;
