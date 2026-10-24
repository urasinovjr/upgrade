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
    text: "Фото или PDF. Закрасьте имя ученика: ИИ увидит страницы уже без него.",
  },
  {
    title: "Проверьте шаги",
    text: "ИИ делит решение на шаги и ставит у каждого пометку. Каждый шаг можно найти на фото одним нажатием.",
  },
  {
    title: "Подтвердите пробел",
    text: "ИИ предполагает, какую тему ученик не понял. В карту знаний она попадёт, только если вы согласны.",
  },
  {
    title: "Отправьте отчёт",
    text: "Скопируйте текст в мессенджер или скачайте PDF для ученика и родителей.",
  },
];

const limits = [
  {
    title: "Оценку ставите вы",
    text: "UpGrade не ставит баллов. Он показывает шаги, пометки и возможную причину ошибки.",
  },
  {
    title: "Алгебра 9–11 класса",
    text: "Выражения, дроби, степени и корни, уравнения и неравенства. Задачи из других разделов UpGrade пока не разбирает.",
  },
  {
    title: "Без вас пробел не засчитывается",
    text: "Пока вы не подтвердили пробел, он не попадает ни в карту знаний, ни в отчёт.",
  },
  {
    title: "Имя ученика скрыто",
    text: "Имя вы закрашиваете до разбора. ИИ получает только страницы, которые вы отметили.",
  },
];

const questions = [
  {
    title: "Ученику или родителям нужно регистрироваться?",
    text: "Нет. Они получают от вас текст для мессенджера или PDF-отчёт.",
  },
  {
    title: "В каком виде загружать работу?",
    text: "Фото в JPG или PNG либо PDF, до 20 МБ на файл. Условие можно набрать текстом или формулой. Правильный ответ добавлять не обязательно.",
  },
  {
    title: "Что, если ИИ ошибся?",
    text: "Исправьте шаг, пометку или объяснение прямо рядом с фото. В отчёт попадёт только то, что вы подтвердили.",
  },
  {
    title: "Что будет после пробного периода?",
    text: "Без подписки кабинет открыт для чтения. Работы, отчёты и карты знаний остаются на месте.",
  },
];

export default function Landing() {
  const links = landingLinks;
  useEffect(() => {
    const previous = document.title;
    document.title = "UpGrade — помощник репетитора по алгебре";
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
          <a href="#honest">Что важно знать</a>
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
              ИИ делает черновик карандашом. Вы сверяете его с фото и обводите чернилами то, с чем
              согласны.
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
              Всё, что предложил ИИ, написано карандашом, серым и пунктиром. Ошибка в решении
              отмечена красной ручкой, как в тетради.
            </p>
            <p>
              Нажмите «Подтвердить пробел», и пометка перепишется чернилами. Только такие пометки
              попадают в отчёт и карту знаний.
            </p>
          </div>
          <PencilDemo />
        </section>

        <section className="dp-landing-section" id="map" aria-labelledby="map-title">
          <div className="dp-landing-section-head">
            <h2 id="map-title">Карта знаний ученика</h2>
            <p>
              Подтверждённые пробелы собираются в карту знаний. По ней видно, что разобрать на
              следующем занятии и какие темы ведут к пробелу. Нажмите на тему, чтобы увидеть, что в
              неё входит.
            </p>
          </div>
          <MapPreview />
        </section>

        <section
          className="dp-landing-section dp-landing-honest"
          id="honest"
          aria-labelledby="honest-title"
        >
          <h2 id="honest-title">Что важно знать заранее</h2>
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
              Зарегистрируйтесь по почте, через Яндекс ID или VK ID, и все функции откроются сразу.
              Банковская карта не нужна. Дальше работает подписка, а без неё кабинет открыт для
              чтения.
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
          <h2 id="final-title">Попробуйте на следующей домашней работе</h2>
          <Link className="dp-landing-button is-marker" to={links.start}>
            {links.startLabel}
          </Link>
        </section>
      </main>
      <footer className="dp-landing-footer">
        <Wordmark />
        <span>Помощник репетитора по алгебре</span>
      </footer>
    </div>
  );
}
