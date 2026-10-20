import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Search, UserPlus, Users } from "lucide-react";
import { useStore } from "../../shared/query";
import { PageBar, PageLoading, PageState } from "../../shared/ui";
import { Roster } from "./Roster";
import { StudentForm } from "./StudentForm";
import "./students.css";
import { useWriteAccess } from "../../shared/session";

export default function Students() {
  const query = useStore();
  const [search, setSearch] = useState("");
  const location = useLocation();
  const navigate = useNavigate();
  const requested = location.state?.addStudent === true;
  const [open, setOpen] = useState(requested);
  useEffect(() => {
    if (requested)
      void navigate(location.pathname + location.search, { replace: true, state: null });
  }, [requested, navigate, location.pathname, location.search]);
  const writeAccess = useWriteAccess();
  const [showArchive, setShowArchive] = useState(false);
  const add = () => setOpen(true);
  const bar = (
    <PageBar
      actions={
        <button
          className="dp-primary dp-compact-action"
          onClick={add}
          disabled={!writeAccess.allowed}
        >
          <UserPlus size={16} aria-hidden="true" />
          <span>Добавить ученика</span>
        </button>
      }
    />
  );
  const form = <StudentForm open={open} onClose={() => setOpen(false)} />;
  if (query.isPending)
    return (
      <>
        {bar}
        <PageLoading />
        {form}
      </>
    );
  if (!query.data)
    return <PageState title="Ученики" error={query.error} retry={() => void query.refetch()} />;
  const state = query.data;
  const term = search.trim().toLowerCase();
  const archivedCount = state.students.filter((student) => student.archivedAt).length;
  const pool = state.students.filter((student) => Boolean(student.archivedAt) === showArchive);
  const visible = pool.filter((student) =>
    (student.name + " " + student.goal).toLowerCase().includes(term),
  );
  return (
    <>
      {bar}
      <div className="dp-page dp-students">
        <div className="dp-students-bar">
          <h1 id="students-title">Ученики</h1>
          <span className="dp-count">{pool.length}</span>
          {(archivedCount > 0 || showArchive) && (
            <button
              className="dp-text"
              aria-pressed={showArchive}
              onClick={() => setShowArchive(!showArchive)}
            >
              {showArchive ? "Активные ученики" : "Архив · " + archivedCount}
            </button>
          )}
          {state.students.length > 0 && (
            <label className="dp-search">
              <Search size={14} aria-hidden="true" />
              <input
                aria-label="Поиск учеников"
                placeholder="Найти ученика"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
          )}
        </div>
        <p className="dp-visually-hidden" role="status">
          {term && (visible.length ? "Найдено: " + visible.length : "Ученики не найдены")}
        </p>
        <Roster
          state={state}
          students={visible}
          full
          labelledBy="students-title"
          empty={
            state.students.length ? (
              <div className="dp-students-empty">
                <Search size={16} aria-hidden="true" />
                <span>
                  <strong>Ученики не найдены</strong>
                  Проверьте написание имени или цели занятий.
                </span>
                <button className="dp-text" onClick={() => setSearch("")}>
                  Сбросить поиск
                </button>
              </div>
            ) : (
              <div className="dp-students-empty">
                <Users size={16} aria-hidden="true" />
                <span>
                  <strong>Учеников пока нет</strong>
                  Добавьте ученика, чтобы загружать его работы и видеть темы для повторения.
                </span>
                <button className="dp-text" onClick={add} disabled={!writeAccess.allowed}>
                  <UserPlus size={14} aria-hidden="true" />
                  Добавить ученика
                </button>
              </div>
            )
          }
        />
      </div>
      {form}
    </>
  );
}
