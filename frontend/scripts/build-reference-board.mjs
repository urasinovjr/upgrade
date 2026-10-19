import { readFile, writeFile, mkdir } from "node:fs/promises";

const root = new URL("../../", import.meta.url);
const references = [
  {
    number: "01",
    name: "Linear",
    role: "Спокойная рабочая среда",
    file: "linear-sidebar.png",
    url: "https://linear.app/now/behind-the-latest-design-refresh",
    text: "Изучены главная страница, Features, Plan, Insights и заметка об обновлении интерфейса. Повторяющиеся приёмы: тональные поверхности, постоянные заголовки, компактные вкладки и раскрытие деталей по запросу.",
    decision:
      "В UpGrade: тихая навигация с режимом иконок, единое рабочее окно, фильтрация очереди из графиков и быстрые переходы. Светлая поверхность, синий и фиолетовый остаются своими.",
  },
  {
    number: "02",
    name: "Gradescope",
    role: "Проверка рядом с оригиналом",
    file: "gradescope.png",
    url: "https://www.gradescope.com/help#grading-submissions",
    text: "Оригинал решения и инструменты проверки находятся рядом. Навигация по заданиям отделена от финальных действий.",
    decision:
      "В UpGrade: оригинал слева, читаемый разбор справа; правки открываются по запросу. На телефоне эти области переключаются.",
  },
  {
    number: "03",
    name: "Formative",
    role: "Внимание преподавателя",
    file: "formative.png",
    url: "https://help.formative.com/en/articles/6198532-view-and-score-responses",
    text: "Статусы ответов помогают найти работы, требующие вмешательства. Из сводки можно перейти к отдельному ответу ученика.",
    decision:
      "В UpGrade: очередь действий и текстовые статусы с иконками. Основания рекомендаций ведут к конкретной подтверждённой редакции.",
  },
];
const cards = await Promise.all(
  references.map(async (ref) => {
    const data = await readFile(new URL("docs/design/references/" + ref.file, root));
    return `<article><div class="card-head"><span>${ref.number}</span><div><h2>${ref.name}</h2><p>${ref.role}</p></div></div><a class="image" href="${ref.url}" target="_blank" rel="noopener"><img src="data:image/png;base64,${data.toString("base64")}" alt="Фрагмент интерфейса ${ref.name} из официальной документации"></a><div class="copy"><p>${ref.text}</p><div class="decision">${ref.decision}</div><a href="${ref.url}" target="_blank" rel="noopener">Официальный источник ↗</a></div></article>`;
  }),
);
const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>UpGrade — референсы и направление</title><style>
*{box-sizing:border-box}body{margin:0;background:#f7f8fd;color:#20263b;font:16px/1.6 system-ui,sans-serif}main{max-width:1360px;margin:auto;padding:48px 36px}a{color:#315efb;text-underline-offset:4px}a:focus-visible{outline:3px solid #315efb;outline-offset:5px}header{display:flex;justify-content:space-between;gap:32px;margin-bottom:36px}.brand{font-size:21px;font-weight:750;letter-spacing:-.6px}.brand b{display:inline-grid;place-items:center;background:linear-gradient(130deg,#315efb,#7c3aed);color:white;border-radius:9px;width:32px;height:32px;margin-right:8px}h1{max-width:760px;font-size:clamp(32px,4vw,50px);line-height:1.12;letter-spacing:-1.7px;margin:36px 0 20px}header p{max-width:680px;color:#616d82;margin:0}.eyebrow{font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#7c3aed;margin-top:42px}.date{font-size:13px;color:#616d82;white-space:nowrap}.palette{display:flex;flex-wrap:wrap;gap:22px;margin:30px 0 45px}.swatch{display:flex;align-items:center;gap:9px;font-size:13px}.swatch i{width:26px;height:26px;border-radius:8px;border:1px solid #dfe3ee}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}article{background:white;border:1px solid #e0e5f0;border-radius:16px;overflow:hidden;display:flex;flex-direction:column}.card-head{display:flex;align-items:center;gap:15px;padding:24px}.card-head>span{font-size:13px;color:#7c3aed;background:#f2edff;padding:8px;border-radius:8px}h2{font-size:22px;line-height:1.2;letter-spacing:-.5px;margin:0}.card-head p{font-size:13px;margin:4px 0 0;color:#616d82}.image{display:flex;align-items:center;background:#edf0f8;height:290px;border-block:1px solid #e0e5f0;padding:10px}.image img{display:block;width:100%;height:100%;object-fit:contain}.copy{padding:24px;display:flex;flex-direction:column;gap:18px;flex:1;font-size:14px}.copy p{margin:0;color:#616d82}.decision{border-left:3px solid #7c3aed;padding-left:14px}.copy>a{margin-top:auto}.principle{margin-top:28px;display:grid;grid-template-columns:1fr 2fr;gap:40px;background:white;border:1px solid #e0e5f0;border-radius:16px;padding:30px}.principle p{margin:0;color:#616d82;font-size:15px}.principle h2{font-size:23px}.principle a{font-size:14px}footer{border-top:1px solid #dfe3ee;margin-top:38px;padding-top:20px;font-size:12px;color:#616d82}footer p{margin:8px 0}@media(max-width:950px){.grid{grid-template-columns:1fr}.image{height:350px}.principle{grid-template-columns:1fr;gap:16px}}@media(max-width:600px){main{padding:25px 18px}header{display:block}.date{margin-top:16px}.image{height:260px}.principle{padding:24px}}
</style></head><body><main><header><div><div class="brand"><b>↗</b>UpGrade</div><div class="eyebrow">Направление дизайна · 02</div><h1>Меньше шума.<br>Больше внимания к ученику.</h1><p>Профессиональный кабинет преподавателя: очередь работ, понятная проверка и следующий учебный шаг. Референсы помогают выбрать устройство интерфейса; визуальный язык остаётся нашим.</p></div><div class="date">18 октября 2026<br>Доска для обсуждения</div></header><div class="palette"><span class="swatch"><i style="background:#315efb"></i>Действие · #315EFB</span><span class="swatch"><i style="background:#7c3aed"></i>Следующий шаг · #7C3AED</span><span class="swatch"><i style="background:#20263b"></i>Текст · #20263B</span><span class="swatch"><i style="background:#f7f8fd"></i>Фон · #F7F8FD</span></div><section class="grid" aria-label="Референсы">${cards.join("")}</section><section class="principle"><div><h2>Linear: устройство и движение</h2><a href="https://linear.app/insights">Insights ↗</a> · <a href="https://linear.app/quality">Quality ↗</a></div><p>В публичных демонстрациях Linear графики ведут к исходным данным, панели группируют одну задачу, навигация не соперничает с содержимым. В UpGrade графики показывают события за 14 дней и текущие статусы; выбор фильтрует очередь. Движение адаптировано для работы: 140 мс для отклика, 180–220 мс для деталей, 300 мс для панели. Три цветные кнопки — отдельное согласованное решение для UpGrade по мотивам macOS; это не функция, приписываемая Linear.</p></section><section class="principle"><div><h2>Подробности —<br>когда они нужны</h2><a href="https://www.nngroup.com/articles/progressive-disclosure/">Принцип progressive disclosure ↗</a></div><p>Сначала преподаватель читает решение и объяснение ошибки. Формула, вердикт и комментарий становятся полями только после «Изменить». В карточке ученика сначала видны рекомендации и их основания; граф открывается отдельной вкладкой. История редакций остаётся доступной рядом с результатом.</p></section><footer><p>Изображения Linear, Gradescope и Formative принадлежат их правообладателям. Приведены из открытых официальных материалов для сравнения интерфейсных решений; это не дизайн UpGrade.</p><p>Доска автономна: изображения встроены. Для перехода к источникам нужен интернет. Интерактивная концепция находится в отдельном файле UpGrade-design-preview.html.</p></footer></main></body></html>`;
await mkdir(new URL("output/", root), { recursive: true });
await writeFile(new URL("output/UpGrade-references.html", root), html);
console.log("Готово: output/UpGrade-references.html");
