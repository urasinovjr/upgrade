import type { TourStep, TourTarget } from "../../domain/tour";

export const tourSteps: TourStep[] = [
  {
    target: "new-work",
    title: "Начните с новой работы",
    text: "Загрузите фото или PDF домашней работы. ИИ разложит решение на шаги карандашом, а вы проверите их ручкой.",
  },
  {
    target: "queue",
    title: "Очередь работ",
    text: "Здесь собраны работы, которые ждут вас: к проверке, к сверке и те, где разбор не удался.",
  },
  {
    target: "students",
    title: "Ученики и карта знаний",
    text: "У каждого ученика своя карта знаний. Пробел попадает в неё, когда вы подтверждаете работу.",
  },
  {
    target: "overview",
    title: "Обзор под вас",
    text: "Добавьте, уберите или переставьте блоки обзора. Расположение сохранится.",
  },
  {
    target: "restart",
    title: "Знакомство можно пройти заново",
    text: "Кнопка «Знакомство с кабинетом» внизу слева снова покажет эти подсказки.",
  },
];

const selectors: Record<TourTarget, string> = {
  "new-work": '[data-tour="new-work"]',
  queue: '[data-widget="queue"]',
  students: '[data-tour="students"]',
  overview: '[data-tour="overview"]',
  restart: '[data-tour="restart"]',
};

function isVisible(element: HTMLElement) {
  const box = element.getBoundingClientRect();
  return box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== "hidden";
}

export function findTarget(target: TourTarget) {
  const elements = document.querySelectorAll<HTMLElement>(selectors[target]);
  return [...elements].find(isVisible) ?? null;
}
