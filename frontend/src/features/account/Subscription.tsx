import { CreditCard } from "lucide-react";
import { useSession } from "../../shared/session";
import { PageLoading } from "../../shared/ui";
import "./account.css";

const statusTitles = {
  trial: "Пробный период",
  active: "Подписка активна",
  expired: "Подписка закончилась",
  none: "Подписка не оформлена",
};

function longDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

export default function Subscription() {
  const session = useSession();
  if (!session.data) return <PageLoading variant="list" />;
  const { status, endsAt, planTitle, contactUrl } = session.data.subscription;
  const active = status === "trial" || status === "active";
  return (
    <div className="dp-account">
      <h1>Подписка</h1>
      <section className="dp-account-section" aria-labelledby="subscription-status">
        <h2 id="subscription-status">{statusTitles[status]}</h2>
        {planTitle && <p>Тариф: {planTitle}</p>}
        {endsAt && (
          <p>
            {active ? "Действует до " : "Закончилась "}
            {longDate(endsAt)}
          </p>
        )}
        <p className="dp-caption">
          {active
            ? "Все возможности доступны: загрузка, разбор и подтверждение работ."
            : "Работы, отчёты и карта тем доступны для просмотра и экспорта. Новые работы и правки откроются после продления."}
        </p>
        <div className="dp-account-row">
          <a className="dp-button dp-primary" href={contactUrl}>
            <CreditCard size={14} aria-hidden="true" />
            Оформить подписку
          </a>
          <span className="dp-caption">Оплата картой появится позже, пока напишите нам.</span>
        </div>
      </section>
    </div>
  );
}
