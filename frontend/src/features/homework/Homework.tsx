import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { gateway } from "../../data/gateway";
import { useWriteAccess } from "../../shared/session";
import { ErrorMessage, PageLoading, PageState } from "../../shared/ui";
import { HomeworkEditor } from "./HomeworkEditor";
import "./homework.css";

export default function Homework() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const client = useQueryClient();
  const access = useWriteAccess();
  const query = useQuery({ queryKey: ["homework"], queryFn: () => gateway.homework.list() });
  const create = useMutation({
    mutationFn: () =>
      gateway.homework.save(crypto.randomUUID(), { title: "Новое ДЗ", tasks: [], baseRevision: 0 }),
    onSuccess: async (homework) => {
      await client.invalidateQueries({ queryKey: ["homework"] });
      navigate(
        "/homework/" +
          homework.id +
          (params.get("student") ? "?student=" + encodeURIComponent(params.get("student")!) : ""),
      );
    },
  });
  if (query.isPending) return <PageLoading variant="list" />;
  if (query.isError)
    return (
      <PageState
        title="Домашние задания"
        errorTitle="Не удалось открыть ДЗ"
        error={query.error}
        retry={() => void query.refetch()}
      />
    );
  const homework = query.data.find((item) => item.id === id);
  if (id && !homework)
    return (
      <PageState title="ДЗ не найдено. Откройте список ДЗ" to="/homework" linkLabel="К списку ДЗ" />
    );
  if (homework) return <HomeworkEditor key={homework.id} homework={homework} />;
  return (
    <div className="hw-page">
      <header className="hw-heading">
        <div>
          <h1>Домашние задания</h1>
          <p className="dp-caption">Подготовьте условия, подтвердите и назначьте ученикам</p>
        </div>
        <button
          className="dp-primary"
          disabled={!access.allowed || create.isPending}
          onClick={() => create.mutate()}
        >
          Создать ДЗ
        </button>
      </header>
      <ErrorMessage error={create.error} />
      {!query.data.length ? (
        <p className="hw-empty">ДЗ пока нет. Создайте подборку из текста или фотографий</p>
      ) : (
        <ul className="hw-list">
          {query.data.map((item) => (
            <li key={item.id}>
              <Link to={"/homework/" + item.id}>
                <strong>{item.title}</strong>
                <span>
                  {item.tasks.length} заданий ·{" "}
                  {item.assignedAt ? "Назначено: " + item.assignments.length : "Черновик"}
                </span>
                <span>
                  {item.deadline
                    ? "До " + new Date(item.deadline).toLocaleString("ru-RU")
                    : "Без срока сдачи"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
