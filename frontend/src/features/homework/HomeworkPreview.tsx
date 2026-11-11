import { gateway } from "../../data/gateway";
import { MediaViewer } from "../../shared/MediaViewer";
import { Formula } from "../../shared/math";
import { homeworkAttachment, type HomeworkEditorState } from "./useHomeworkEditor";
export function HomeworkPreview({ context }: { context: HomeworkEditorState }) {
  const { homework, frozen } = context;
  return (
    <>
      {frozen && (
        <details>
          <summary>Условия назначенного ДЗ · {homework.tasks.length}</summary>
          {homework.tasks.map((task) => (
            <div className="hw-task" key={task.id}>
              <h3>{task.title}</h3>
              <p className="hw-condition-text">{task.condition}</p>
              {task.formula && <Formula value={task.formula} />}
            </div>
          ))}
          {!!homework.files.length && (
            <MediaViewer
              files={homework.files.map(homeworkAttachment)}
              loadAsset={gateway.homework.asset}
            />
          )}
        </details>
      )}
    </>
  );
}
