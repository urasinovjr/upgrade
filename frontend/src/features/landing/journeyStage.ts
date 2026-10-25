export const journeySteps = [
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

const settleAt = 0.4;

function clamp(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

export function stageAt(progress: number, count = journeySteps.length) {
  return Math.min(Math.floor(clamp(progress) * count), count - 1);
}

export function stageRange(index: number, count = journeySteps.length) {
  return [index / count, (index + 1) / count];
}

export function stageProgress(progress: number, index: number, count = journeySteps.length) {
  const [start, end] = stageRange(index, count);
  return clamp((progress - start) / (end - start));
}

export function isSettled(progress: number, count = journeySteps.length) {
  return stageProgress(progress, stageAt(progress, count), count) >= settleAt;
}
