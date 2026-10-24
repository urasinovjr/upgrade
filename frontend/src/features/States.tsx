import { useState } from "react";
import { AlertCircle, CircleHelp, Info, LoaderCircle, ShieldCheck } from "lucide-react";
import { Link } from "react-router";
import {
  Avatar,
  Badge,
  Callout,
  Disclosure,
  ErrorMessage,
  Modal,
  PageLoading,
  PageState,
  Panel,
  TabSet,
} from "../shared/ui";
import { statusMeta } from "../shared/status";
import { FormulaInput } from "../shared/math";
import { gateway } from "../data/gateway";
import { useCommand } from "../shared/query";
import type { WorkStatus } from "../domain/models";
import "./states.css";

const statuses = Object.keys(statusMeta) as WorkStatus[];
const sampleStudents = [
  { name: "Анна Соколова", color: "teal" },
  { name: "Михаил Орлов", color: "sand" },
  { name: "Полина Волкова", color: "lilac" },
  { name: "Иван Лебедев", color: "blue" },
  { name: "Без цвета", color: "" },
];
const tabs = [
  { value: "overview", label: "Обзор" },
  { value: "map", label: "Карта знаний" },
  { value: "history", label: "История" },
];

function Crash(): never {
  throw new Error("Тестовая ошибка экрана.");
}

export default function States() {
  const [latex, setLatex] = useState("\\frac{x^2-9}{x-3}");
  const [dialog, setDialog] = useState(false);
  const [tab, setTab] = useState("overview");
  const [panel, setPanel] = useState(true);
  const [crash, setCrash] = useState(false);
  const command = useCommand();
  return (
    <div className="dp-page dp-states">
      <header className="dp-states-head">
        <span className="dp-caption">Только в режиме разработки</span>
        <h1>Состояния интерфейса</h1>
        <p>Общие примитивы, уведомления и состояния страниц для проверки вида и адаптивности.</p>
      </header>
      <div className="dp-states-grid">
        <section className="dp-states-card" aria-labelledby="states-badges">
          <h2 id="states-badges">Статусы работ</h2>
          <div className="dp-states-row">
            {statuses.map((status) => (
              <Badge key={status} status={status} />
            ))}
          </div>
          <h3>Аватары учеников</h3>
          <div className="dp-states-row">
            {sampleStudents.map((student) => (
              <span className="dp-states-avatar" key={student.name}>
                <Avatar student={student} size="sm" />
                <Avatar student={student} />
                <Avatar student={student} size="lg" />
                <small>{student.color || "без цвета"}</small>
              </span>
            ))}
          </div>
        </section>
        <section className="dp-states-card" aria-labelledby="states-dialog">
          <h2 id="states-dialog">Диалог и раскрытие</h2>
          <p>Фокус переходит в диалог и возвращается на кнопку после закрытия.</p>
          <div className="dp-inline-actions">
            <button onClick={() => setDialog(true)}>Открыть диалог</button>
          </div>
          <Disclosure title="Как работает раскрытие">
            <p>Содержимое остаётся в разметке, но недоступно, пока блок свёрнут.</p>
          </Disclosure>
        </section>
        <section className="dp-states-card" aria-labelledby="states-tabs">
          <h2 id="states-tabs">Вкладки</h2>
          <TabSet label="Разделы примера" items={tabs} value={tab} onChange={setTab}>
            <p>
              {tab === "overview"
                ? "Короткая сводка по ученику."
                : tab === "map"
                  ? "Темы и связи между ними."
                  : "Работы и закрытые пробелы по датам."}
            </p>
          </TabSet>
        </section>
        <section className="dp-states-card" aria-labelledby="states-notices">
          <h2 id="states-notices">Уведомления</h2>
          <p>Полосой под заголовком окна и отдельным блоком в форме или диалоге.</p>
          <div className="dp-states-strips">
            <Callout
              tone="neutral"
              icon={<LoaderCircle className="dp-spin" size={16} aria-hidden="true" />}
              title="ИИ разбирает работу. Можно уйти со страницы и вернуться позже."
            />
            <Callout
              tone="warning"
              icon={<CircleHelp size={16} aria-hidden="true" />}
              title="Сверьте распознанное с оригиналом."
              more="Работа изменилась после разбора."
            >
              <button>Всё сверено</button>
            </Callout>
            <Callout
              tone="info"
              icon={<ShieldCheck size={16} aria-hidden="true" />}
              title="Черновик новой версии."
              more="Пока вы его не подтвердите, действует версия 1."
            />
          </div>
          <Callout
            tone="info"
            boxed
            icon={<Info size={16} aria-hidden="true" />}
            title="Файлы ещё не были сохранены в работе."
            more="После перезагрузки выберите их заново."
          />
          <Callout
            tone="warning"
            boxed
            icon={<AlertCircle size={16} aria-hidden="true" />}
            title="Это старая версия отчёта. В карте знаний учтена более новая."
          />
          <ErrorMessage error={new Error("Не удалось сохранить черновик. Попробуйте ещё раз.")} />
        </section>
        <section className="dp-states-card" aria-labelledby="states-processing">
          <h2 id="states-processing">Разбор учебного примера</h2>
          <p>Эти кнопки изменяют только пример demo-ready.</p>
          <div className="dp-inline-actions">
            {(["ready", "failed", "needs_input"] as const).map((outcome) => (
              <button
                disabled={command.isPending}
                key={outcome}
                onClick={() =>
                  command.mutate(async () => {
                    await gateway.action("demo-ready", "edit");
                    await gateway.action("demo-ready", "analyse", outcome);
                  })
                }
              >
                {statusMeta[outcome].label}
              </button>
            ))}
            <Link className="dp-button" to="/works/demo-ready">
              Открыть пример
            </Link>
          </div>
          <ErrorMessage error={command.error} />
        </section>
        <section className="dp-states-card" aria-labelledby="states-errors">
          <h2 id="states-errors">Ошибки экрана</h2>
          <p>Ошибка при отрисовке заменяет содержимое страницы, навигация остаётся.</p>
          <div className="dp-inline-actions">
            <button onClick={() => setCrash(true)}>Сломать этот экран</button>
            <Link className="dp-button" to="/dev/missing">
              Страница не найдена
            </Link>
          </div>
          {crash && <Crash />}
        </section>
        <section className="dp-states-card" aria-labelledby="states-formula">
          <h2 id="states-formula">Редактор формул</h2>
          <FormulaInput label="Тестовая формула" value={latex} onChange={setLatex} />
        </section>
      </div>
      {panel ? (
        <Panel
          title="Панель"
          summary="Свернуть, развернуть, закрыть"
          onClose={() => setPanel(false)}
        >
          <div className="dp-states-panel">
            <p>
              Содержимое панели не пересоздаётся при смене режима: прокрутка и ввод сохраняются.
            </p>
            <label>
              Заметка
              <input defaultValue="Текст остаётся после сворачивания" />
            </label>
          </div>
        </Panel>
      ) : (
        <button className="dp-states-restore" onClick={() => setPanel(true)}>
          Вернуть панель
        </button>
      )}
      <div className="dp-states-grid">
        <section className="dp-states-card dp-states-preview" aria-label="Ошибка загрузки">
          <PageState
            level={2}
            title="Пример страницы"
            error={new Error("Тестовая ошибка чтения.")}
            retry={() => {}}
          />
        </section>
        <section className="dp-states-card dp-states-preview" aria-label="Загрузка">
          <PageLoading variant="list" />
        </section>
      </div>
      <Modal
        open={dialog}
        onOpenChange={setDialog}
        title="Пример диалога"
        description="Так выглядят окна подтверждения и формы."
      >
        <label>
          Комментарий
          <textarea placeholder="Например, повторить область допустимых значений" />
        </label>
        <div className="dp-dialog-actions">
          <button onClick={() => setDialog(false)}>Отмена</button>
          <button className="dp-primary" onClick={() => setDialog(false)}>
            Применить
          </button>
        </div>
      </Modal>
    </div>
  );
}
