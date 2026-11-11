import { errorText } from "../../shared/text";
import { Modal } from "../../shared/ui";
import "../homework/homework.css";
import "./review.css";
import { same } from "./reviewView";
import { StepEditor } from "./StepItem";
import { ConditionEditor, GapEditor } from "./TaskEditors";
import type { ReviewController } from "./useReviewController";
export function ReviewDialogs({ context }: { context: ReviewController }) {
  const {
    work,
    review,
    draft,
    change,
    busy,
    action,
    setTaskId,
    editor,
    setEditor,
    conditionEdit,
    setConditionEdit,
    gapEdit,
    setGapEdit,
    withdraw,
    setWithdraw,
    removeTask,
    setRemoveTask,
    tasks,
    task,
    step,
    updateTask,
    saveStep,
    error,
  } = context;
  return (
    <>
      <Modal
        open={!!step}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
        title="Изменить шаг"
        description="Поправьте запись и объяснение. Если измените формулу, шаг нужно будет снова сверить с оригиналом"
      >
        {step && task && (
          <StepEditor
            key={step.id}
            step={step}
            preset={editor?.preset}
            index={task.steps.indexOf(step) + 1}
            explain={editor?.explain}
            removable={task.steps.length > 1}
            close={() => setEditor(null)}
            remove={() => {
              updateTask({
                steps: task.steps.filter((item) => item.id !== step.id),
                reviewed: false,
              });
              setEditor(null);
            }}
            save={(value) => {
              saveStep(value);
              setEditor(null);
            }}
          />
        )}
      </Modal>
      <Modal
        open={conditionEdit && !!task}
        onOpenChange={setConditionEdit}
        title={task ? "Условие · " + task.title : "Условие"}
        description="Текст, место на странице, формула, правильный ответ, тема и тип задачи. Если измените условие, шаги нужно будет сверить заново"
      >
        {task && (
          <ConditionEditor
            key={task.id}
            task={task}
            files={work.attachments}
            removable={tasks.length > 1}
            close={() => setConditionEdit(false)}
            remove={() => {
              setConditionEdit(false);
              setRemoveTask(true);
            }}
            save={(value) => {
              if (!same(task, value)) updateTask(value);
              setConditionEdit(false);
            }}
          />
        )}
      </Modal>
      <Modal
        open={gapEdit && !!task?.gap}
        onOpenChange={setGapEdit}
        title="Гипотеза о пробеле"
        description="Тема попадёт в карту знаний, когда вы подтвердите гипотезу и опубликуете результат"
      >
        {task?.gap && (
          <GapEditor
            key={task.id}
            gap={task.gap}
            close={() => setGapEdit(false)}
            save={(gap) => {
              if (!same(task.gap, gap)) updateTask({ gap, reviewed: false });
              setGapEdit(false);
            }}
          />
        )}
      </Modal>
      <Modal
        open={removeTask && !!task}
        onOpenChange={setRemoveTask}
        title={"Удалить " + (task?.title.replace(/^Задача/, "задачу") ?? "задачу") + "?"}
        description="Условие, шаги и комментарий к задаче удалятся из черновика"
      >
        <div className="dp-dialog-actions">
          <button onClick={() => setRemoveTask(false)}>Отмена</button>
          <button
            className="dp-destructive"
            onClick={() => {
              if (!task) return;
              const index = tasks.indexOf(task);
              const rest = tasks.filter((item) => item.id !== task.id);
              change({ ...draft, tasks: rest });
              setTaskId(rest[Math.min(index, rest.length - 1)]?.id ?? "");
              setRemoveTask(false);
            }}
          >
            Удалить задачу
          </button>
        </div>
      </Modal>
      <Modal
        open={withdraw}
        onOpenChange={setWithdraw}
        title="Отозвать публикацию результата?"
        description="Результат останется в истории версий и будет недоступен ученику. Пробелы этой версии уйдут из карты знаний"
      >
        <div className="dp-dialog-actions">
          <button onClick={() => setWithdraw(false)}>Отмена</button>
          <button
            className="dp-destructive"
            disabled={busy}
            onClick={() => void action("withdraw").then((done) => done && setWithdraw(false))}
          >
            Отозвать публикацию
          </button>
        </div>
      </Modal>
      <Modal
        open={review.blocker.state === "blocked"}
        onOpenChange={(open) => {
          if (!open && review.blocker.state === "blocked") review.blocker.reset();
        }}
        title="Сохранить изменения?"
        description="Черновик ещё сохраняется. Дождитесь, чтобы не потерять правки"
      >
        {Boolean(error) && (
          <p className="dp-error" role="alert">
            {errorText(error)}
          </p>
        )}
        <div className="dp-dialog-actions">
          <button onClick={() => review.blocker.state === "blocked" && review.blocker.reset()}>
            Остаться
          </button>
          <button
            className="dp-primary"
            onClick={() => {
              void review
                .save()
                .then(() => {
                  if (review.blocker.state === "blocked") review.blocker.proceed();
                })
                .catch(() => {});
            }}
          >
            Сохранить и перейти
          </button>
        </div>
      </Modal>
    </>
  );
}
