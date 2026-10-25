import { type CSSProperties, useEffect, useRef } from "react";
import { Link } from "react-router";
import "@fontsource/caveat/500.css";
import "@fontsource/caveat/600.css";
import { Disclosure, Wordmark } from "../../shared/ui";
import { MotionScope } from "../../shared/ui/MotionScope";
import { Reveal, RevealWords } from "../../shared/ui/Reveal";
import { useReveal } from "../../shared/ui/useInView";
import { Hero } from "./Hero";
import { HonestSection } from "./HonestSection";
import { InkUnderline } from "./InkUnderline";
import { MagnetLink } from "./MagnetLink";
import { MapPreview } from "./MapPreview";
import { PencilDemo } from "./PencilDemo";
import { ScrollProgress } from "./ScrollProgress";
import { TopicMarquee } from "./TopicMarquee";
import { WorkJourney } from "./WorkJourney";
import { landingLinks } from "./links";
import { useSmoothScroll } from "./useSmoothScroll";
import "./landing.css";

const limits = [
  {
    title: "Оценку ставите вы",
    text: "UpGrade не ставит баллов. Он показывает шаги, пометки и возможную причину ошибки.",
  },
  {
    title: "Алгебра 9–11 класса",
    text: "Выражения, дроби, степени и корни, уравнения, неравенства и тригонометрия. Задачи из других разделов UpGrade пока не разбирает.",
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

function itemStyle(index: number) {
  return { "--reveal-index": index } as CSSProperties;
}

function Heading({
  id,
  text,
  underline = true,
}: {
  id: string;
  text: string;
  underline?: boolean;
}) {
  return (
    <h2 id={id}>
      <RevealWords text={text} />
      {underline && <InkUnderline delay={450} />}
    </h2>
  );
}

function HonestLimits() {
  const ref = useRef<HTMLUListElement>(null);
  const revealed = useReveal(ref, 0.3);
  return (
    <ul ref={ref} data-revealed={revealed}>
      {limits.map((item, index) => (
        <li key={item.title} className="dp-reveal-item" style={itemStyle(index)}>
          <h3>{item.title}</h3>
          <p>{item.text}</p>
        </li>
      ))}
    </ul>
  );
}

export default function Landing() {
  const links = landingLinks;
  useSmoothScroll();
  useEffect(() => {
    const previous = document.title;
    document.title = "UpGrade — помощник репетитора по алгебре";
    return () => {
      document.title = previous;
    };
  }, []);
  return (
    <MotionScope>
      <div className="dp-app dp-landing">
        <ScrollProgress />
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
          <TopicMarquee />

          <section className="dp-landing-section dp-journey" id="how" aria-labelledby="how-title">
            <WorkJourney
              head={
                <>
                  <Heading id="how-title" text="От фото тетради до отчёта родителям" />
                  <Reveal index={2}>
                    <p>
                      ИИ делает черновик карандашом. Вы сверяете его с фото и обводите чернилами то,
                      с чем согласны.
                    </p>
                  </Reveal>
                </>
              }
            />
          </section>

          <section
            className="dp-landing-section dp-landing-split"
            id="pencil"
            aria-labelledby="pencil-title"
          >
            <div className="dp-landing-section-head is-stacked">
              <Heading id="pencil-title" text="Карандаш и чернила" />
              <Reveal index={2}>
                <p>
                  Всё, что предложил ИИ, написано карандашом, серым и пунктиром. Ошибка в решении
                  отмечена красной ручкой, как в тетради.
                </p>
              </Reveal>
              <Reveal index={3}>
                <p>
                  Нажмите «Подтвердить пробел», и пометка перепишется чернилами. Только такие
                  пометки попадают в отчёт и карту знаний.
                </p>
              </Reveal>
            </div>
            <Reveal index={1}>
              <PencilDemo />
            </Reveal>
          </section>

          <section className="dp-landing-section" id="map" aria-labelledby="map-title">
            <div className="dp-landing-section-head">
              <Heading id="map-title" text="Карта знаний ученика" />
              <Reveal index={2}>
                <p>
                  Подтверждённые пробелы собираются в карту знаний. По ней видно, что разобрать на
                  следующем занятии и какие темы ведут к пробелу. Нажмите на тему, чтобы увидеть,
                  что в неё входит.
                </p>
              </Reveal>
            </div>
            <Reveal index={1}>
              <MapPreview />
            </Reveal>
          </section>

          <HonestSection>
            <Heading id="honest-title" text="Что важно знать заранее" underline={false} />
            <HonestLimits />
          </HonestSection>

          <section
            className="dp-landing-section dp-landing-price"
            id="price"
            aria-labelledby="price-title"
          >
            <div>
              <Heading id="price-title" text="14 дней бесплатно" />
              <Reveal index={2}>
                <p>
                  Зарегистрируйтесь по почте, через Яндекс ID или VK ID, и все функции откроются
                  сразу. Банковская карта не нужна. Дальше работает подписка, а без неё кабинет
                  открыт для чтения.
                </p>
                <MagnetLink className="dp-landing-button is-marker" to={links.start}>
                  {links.startLabel}
                </MagnetLink>
              </Reveal>
            </div>
            <Reveal className="dp-landing-faq" index={1}>
              <h3>Частые вопросы</h3>
              {questions.map((item) => (
                <Disclosure key={item.title} title={item.title}>
                  <p>{item.text}</p>
                </Disclosure>
              ))}
            </Reveal>
          </section>

          <section className="dp-landing-final" aria-labelledby="final-title">
            <Heading
              id="final-title"
              text="Попробуйте на следующей домашней работе"
              underline={false}
            />
            <Reveal index={3}>
              <MagnetLink className="dp-landing-button is-marker" to={links.start}>
                {links.startLabel}
              </MagnetLink>
            </Reveal>
          </section>
        </main>
        <footer className="dp-landing-footer">
          <Wordmark />
          <span>Помощник репетитора по алгебре</span>
        </footer>
      </div>
    </MotionScope>
  );
}
