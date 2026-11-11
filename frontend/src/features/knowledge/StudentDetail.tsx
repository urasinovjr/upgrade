import { Check, Pencil } from "lucide-react";
import { useParams } from "react-router";
import type { StoreState, Student } from "../../domain/models";
import { useStore } from "../../shared/query";
import { wordForCount } from "../../shared/text";
import {
  Avatar,
  ErrorMessage,
  Modal,
  PageBar,
  PageLoading,
  PageState,
  TabSet,
} from "../../shared/ui";
import { FirstVisitHint } from "../onboarding/FirstVisitHint";
import { StudentActions } from "../students/StudentActions";
import { StudentForm } from "../students/StudentForm";
import { StudentHistory } from "./StudentHistory";
import { StudentMap } from "./StudentMap";
import { StudentOverview } from "./StudentOverview";
import "./knowledge.css";
import { useStudentDetail } from "./useStudentDetail";
import { studentTabs, type StudentTab } from "./useStudentView";
function StudentPage({ state, student }: { state: StoreState; student: Student }) {
  const context = useStudentDetail({ state, student });
  const {
    command,
    writeAccess,
    open,
    closed,
    works,
    view,
    tab,
    editing,
    setEditing,
    page,
    closing,
    note,
    setNote,
    closeGap,
    cancelClose,
  } = context;

  return (
    <div ref={page} className="dp-page dp-student-page">
      <PageBar
        trail={<span>{student.name}</span>}
        actions={
          <>
            <button
              className="dp-compact-action"
              aria-label="Редактировать ученика"
              disabled={!writeAccess.allowed}
              onClick={() => setEditing(true)}
            >
              <Pencil size={14} aria-hidden="true" />
              <span>Редактировать</span>
            </button>
            <StudentActions student={student} />
          </>
        }
      />
      <header className="dp-student-head student-header">
        <Avatar student={student} />
        <div className="dp-student-id">
          <h1>{student.name}</h1>
          <p>
            {student.grade} класс · {student.goal || "цель занятий пока не указана"}
          </p>
        </div>
        <p className="dp-student-stats">
          <span>
            <strong>{works.length}</strong>{" "}
            {wordForCount(works.length, ["работа", "работы", "работ"])}
          </span>
          <span>
            <strong>{open.length}</strong>{" "}
            {wordForCount(open.length, [
              "открытый пробел",
              "открытых пробела",
              "открытых пробелов",
            ])}
          </span>
          <span>
            <strong>{closed.length}</strong>{" "}
            {wordForCount(closed.length, [
              "закрытый пробел",
              "закрытых пробела",
              "закрытых пробелов",
            ])}
          </span>
        </p>
      </header>
      <FirstVisitHint id="knowledge-map" />
      <TabSet
        label="Разделы карточки"
        value={tab}
        onChange={(next) => view.changeTab(next as StudentTab)}
        items={studentTabs}
      >
        <StudentOverview context={context} />
        <StudentMap context={context} />
        <StudentHistory context={context} />
      </TabSet>
      <StudentForm student={student} open={editing} onClose={() => setEditing(false)} />
      <Modal
        open={!!closing}
        onOpenChange={(value) => {
          if (!value) cancelClose();
        }}
        title="Закрыть пробел"
        description="Напишите, почему вы считаете пробел закрытым. Запись останется в истории ученика"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (closing && note.trim()) closeGap(closing);
          }}
        >
          <label>
            Почему пробел закрыт
            <textarea
              required
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Например, ученик самостоятельно решил три похожие задачи"
            />
          </label>
          <ErrorMessage error={command.error} />
          <div className="dp-dialog-actions">
            <button type="button" onClick={cancelClose}>
              Отмена
            </button>
            <button className="dp-primary" disabled={!note.trim() || command.isPending}>
              <Check size={16} aria-hidden="true" />
              Закрыть пробел
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default function StudentDetail() {
  const { id } = useParams();
  const query = useStore();
  if (query.isPending) return <PageLoading variant="student" />;
  if (!query.data)
    return (
      <PageState
        title="Ученик"
        errorTitle="Не удалось загрузить карточку ученика"
        error={query.error}
        retry={() => void query.refetch()}
      />
    );
  const student = query.data.students.find((item) => item.id === id);
  if (!student)
    return (
      <PageState
        title="Ученик не найден. Откройте список учеников"
        description="Проверьте ссылку или выберите ученика из списка"
        to="/students"
        linkLabel="К ученикам"
      />
    );
  return <StudentPage key={student.id} state={query.data} student={student} />;
}
