import { useEffect } from "react";
import { Link } from "react-router";
import "@fontsource/caveat/500.css";
import "@fontsource/caveat/600.css";
import { Disclosure, Wordmark } from "../../shared/ui";
import { Hero } from "./Hero";
import { MapPreview } from "./MapPreview";
import { PencilDemo } from "./PencilDemo";
import { landingLinks } from "./links";
import "./landing.css";

const steps = [
  {
    title: "Загрузите работу",
    text: "Фото или PDF решения. Закрасьте имя ученика и отметьте проверенные страницы.",
  },
  {
    title: "Проверьте шаги",
    text: "Решение разложено на шаги с вердиктами. Каждый шаг ведёт к своему месту в оригинале.",
  },
  {
    title: "Подтвердите пробел",
    text: "Гипотеза о причине ошибки становится темой для повторения только после вашего решения.",
  },
  {
    title: "Отправьте отчёт",
    text: "Готовый текст для мессенджера или PDF для ученика и родителей.",
  },
];

const limits = [
  {
    title: "Оценку ставите вы",
    text: "UpGrade не выставляет баллы. Он показывает шаги, вердикты и возможную причину ошибки.",
  },
  {
    title: "Алгебра 9–11 класса",
    text: "Выражения, дроби, степени и корни, уравнения и неравенства. Другие разделы пока не разбираются.",
  },
  {
    title: "Гипотеза остаётся гипотезой",
    text: "Пока вы не подтвердили пробел, он не попадает ни в карту ученика, ни в отчёт.",
  },
  {
    title: "Имя ученика скрыто",
    text: "Имя закрашивается до анализа, а на распознавание уходят только отмеченные страницы.",
  },
];

const questions = [
  {
    title: "Ученику или родителям нужно регистрироваться?",
    text: "Нет. Они получают от вас текст для мессенджера или PDF-отчёт.",
  },
  {
    title: "В каком виде загружать работу?",
    text: "Фото JPG или PNG либо PDF, до 20 МБ на файл. Условие задачи можно ввести текстом или формулой, эталонный ответ необязателен.",
  },
  {
    title: "Что, если ИИ ошибся?",
    text: "Любой шаг, вердикт и объяснение исправляются прямо рядом с оригиналом. В отчёт попадает только то, что вы подтвердили.",
  },
  {
    title: "Что будет после пробного периода?",
    text: "Без подписки кабинет остаётся доступен для чтения: работы, отчёты и карты знаний сохраняются.",
  },
];

export default function Landing() {
  const links = landingLinks;
  useEffect(() => {
    const previous = document.title;
    document.title = "UpGrade — разбор решений для репетитора";
    return () => {
      document.title = previous;
    };
  }, []);
  return (
    <div className="dp-app dp-landing">
      <header className="dp-landing-header">
        <Link to="/welcome" className="dp-landing-logo" aria-label="UpGrade">
          <Wordmark />
        </Link>
        <nav aria-label="Разделы страницы">
          <a href="#how">Как работает</a>
          <a href="#pencil">Карандаш и чернила</a>
          <a href="#map">Карта знаний</a>
          <a href="#honest">Честно о рамках</a>
          <a href="#price">Тариф</a>
        </nav>
        <Link className="dp-landing-button is-small" to={links.signIn ?? links.start}>
          {links.signIn ? "Войти" : links.startLabel}
        </Link>
      </header>
      <main id="main-content" tabIndex={-1}>
        <Hero links={links} />

        <section className="dp-landing-section" id="how" aria-labelledby="how-title">
          <div className="dp-landing-section-head">
            <h2 id="how-title">От фото тетради до отчёта родителям</h2>
            <p>
              ИИ готовит черновик карандашом: шаги, вердикты, гипотезу о пробеле. Вы проверяете его
              рядом с оригиналом и подтверждаете чернилами.
            </p>
          </div>
          <ol className="dp-landing-steps">
            {steps.map(({ title, text }, index) => (
              <li key={title}>
                <span className="dp-landing-step-index">{index + 1}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section
          className="dp-landing-section dp-landing-split"
          id="pencil"
          aria-labelledby="pencil-title"
        >
          <div className="dp-landing-section-head is-stacked">
            <h2 id="pencil-title">Карандаш и чернила</h2>
            <p>
              Всё, что предложил ИИ, нарисовано карандашом: пунктир и графит. Ошибка в решении
              отмечена красной ручкой, как в тетради.
            </p>
            <p>
              Нажмите «Подтвердить пробел», и пометка перепишется чернилами. Только такие пометки
              попадают в отчёт и карту ученика.
            </p>
          </div>
          <PencilDemo />
        </section>

        <section className="dp-landing-section" id="map" aria-labelledby="map-title">
          <div className="dp-landing-section-head">
            <h2 id="map-title">Карта знаний ученика</h2>
            <p>
              Подтверждённые пробелы складываются в карту тем. Видно, что повторить сейчас и какие
              темы ведут к пробелу. Выберите тему, чтобы прочитать, что в неё входит.
            </p>
          </div>
          <MapPreview />
        </section>

        <section
          className="dp-landing-section dp-landing-honest"
          id="honest"
          aria-labelledby="honest-title"
        >
          <h2 id="honest-title">Честно о рамках</h2>
          <ul>
            {limits.map((item) => (
              <li key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section
          className="dp-landing-section dp-landing-price"
          id="price"
          aria-labelledby="price-title"
        >
          <div>
            <h2 id="price-title">14 дней бесплатно</h2>
            <p>
              Все возможности сразу после регистрации по почте, через Яндекс ID или VK ID. Затем
              подписка. Без неё кабинет остаётся доступен для чтения.
            </p>
            <Link className="dp-landing-button is-marker" to={links.start}>
              {links.startLabel}
            </Link>
          </div>
          <div className="dp-landing-faq">
            <h3>Частые вопросы</h3>
            {questions.map((item) => (
              <Disclosure key={item.title} title={item.title}>
                <p>{item.text}</p>
              </Disclosure>
            ))}
          </div>
        </section>

        <section className="dp-landing-final" aria-labelledby="final-title">
          <h2 id="final-title">Проверьте следующую домашнюю работу с UpGrade</h2>
          <Link className="dp-landing-button is-marker" to={links.start}>
            {links.startLabel}
          </Link>
        </section>
      </main>
      <footer className="dp-landing-footer">
        <Wordmark />
        <span>Пространство репетитора по алгебре</span>
      </footer>
    </div>
  );
}
