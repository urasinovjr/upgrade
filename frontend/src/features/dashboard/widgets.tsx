import type { ReactNode, RefObject } from "react";
import {
  Activity,
  AlertTriangle,
  CircleHelp,
  Gauge,
  History,
  LayoutList,
  PieChart,
  Crosshair,
  SquareCheckBig,
  Target,
  TableProperties,
  TimerReset,
  UserRoundX,
  type LucideIcon,
} from "lucide-react";
import type { ActivityFilter } from "../../domain/analytics";
import type { DashboardSummary } from "../../domain/dashboard";
import type { WidgetId } from "../../domain/dashboardLayout";
import type { StoreState } from "../../domain/models";
import { topics } from "../../data/catalog";
import { Roster } from "../students/Roster";
import { WorkQueue } from "../works/WorkQueue";
import type { QueueFilters, useQueueFilters } from "../works/useQueueFilters";
import { ActivityWidget, Closures, ReviewSpeed, StatusWidget, TopicErrors } from "./widgets/Charts";
import { Focus } from "./widgets/Focus";
import { Kpis } from "./widgets/Kpis";
import { CommonGaps, Events, Hypotheses, Inactive } from "./widgets/Lists";

export type WidgetContext = {
  state: StoreState;
  summary: DashboardSummary;
  filters: QueueFilters;
  update: ReturnType<typeof useQueueFilters>["update"];
  queueRef: RefObject<HTMLElement | null>;
  onChartChange: (value: ActivityFilter) => void;
};
export type WidgetDefinition = {
  title: string;
  description: string;
  Icon: LucideIcon;
  skeletonHeight: number;
  divider: boolean;
  hiddenWhen?: (state: StoreState) => boolean;
  render: (context: WidgetContext) => ReactNode;
};

const noWorks = (state: StoreState) => !state.works.length;
const chartFilter = ({ filters }: WidgetContext) => ({ day: filters.day, status: filters.status });

export const widgets: Record<WidgetId, WidgetDefinition> = {
  kpis: {
    title: "Сводка",
    description:
      "Сколько работ ждёт проверки или сверки, сколько опубликовано, сколько учеников и открытых пробелов",
    Icon: LayoutList,
    skeletonHeight: 72,
    divider: false,
    render: ({ summary }) => <Kpis summary={summary} />,
  },
  queue: {
    title: "Очередь работ",
    description: "Сдачи учеников, которые нужно подготовить или проверить",
    Icon: SquareCheckBig,
    skeletonHeight: 320,
    divider: true,
    render: ({ state, filters, update, queueRef }) => (
      <WorkQueue
        ref={queueRef}
        state={state}
        mode="preview"
        filters={filters}
        update={update}
        className="dashboard-upload"
      />
    ),
  },
  focus: {
    title: "Фокус на ученике",
    description: "Открытые пробелы: что повторить с учеником дальше",
    Icon: Crosshair,
    skeletonHeight: 240,
    divider: false,
    render: ({ summary }) => <Focus summary={summary} />,
  },
  activity: {
    title: "Ритм работы",
    description:
      "Добавленные работы и впервые опубликованные результаты за 14 дней. Нажмите на день, чтобы увидеть его работы в очереди",
    Icon: Activity,
    skeletonHeight: 200,
    divider: true,
    hiddenWhen: noWorks,
    render: (context) => (
      <ActivityWidget
        works={context.state.works}
        filter={chartFilter(context)}
        onChange={context.onChartChange}
      />
    ),
  },
  status: {
    title: "Состояние работ",
    description:
      "Все работы кабинета по состояниям. Нажмите на состояние, чтобы отфильтровать очередь",
    Icon: PieChart,
    skeletonHeight: 200,
    divider: true,
    hiddenWhen: noWorks,
    render: (context) => (
      <StatusWidget
        works={context.state.works}
        filter={chartFilter(context)}
        onChange={context.onChartChange}
      />
    ),
  },
  roster: {
    title: "Ученики и темы",
    description:
      "Каждый ученик по темам карты знаний: открытые и закрытые пробелы и темы, которые к ним ведут",
    Icon: TableProperties,
    skeletonHeight: 220,
    divider: false,
    render: ({ state }) => <Roster state={state} />,
  },
  topicErrors: {
    title: "Ошибки по темам",
    description: "Доля шагов с ошибкой по каждой теме в опубликованных результатах",
    Icon: AlertTriangle,
    skeletonHeight: 180,
    divider: true,
    render: ({ state }) => <TopicErrors works={state.works} topics={topics} />,
  },
  events: {
    title: "Лента событий",
    description: "Последние добавленные работы и опубликованные результаты, закрытые пробелы",
    Icon: History,
    skeletonHeight: 260,
    divider: true,
    render: ({ state }) => <Events state={state} />,
  },
  reviewSpeed: {
    title: "Скорость проверки",
    description: "Сколько проходит от загрузки работы до первой публикации результата",
    Icon: Gauge,
    skeletonHeight: 220,
    divider: true,
    render: ({ state }) => <ReviewSpeed works={state.works} />,
  },
  closures: {
    title: "Закрытые пробелы",
    description: "Закрытые и снова открытые пробелы по неделям",
    Icon: TimerReset,
    skeletonHeight: 200,
    divider: true,
    render: ({ state }) => <Closures closures={state.closures} />,
  },
  inactive: {
    title: "Давно не сдавали",
    description: "Ученики без новых работ 14 дней и дольше",
    Icon: UserRoundX,
    skeletonHeight: 180,
    divider: true,
    render: ({ state }) => <Inactive state={state} />,
  },
  commonGaps: {
    title: "Частые пробелы",
    description: "Темы, в которых открытый пробел есть у нескольких учеников",
    Icon: Target,
    skeletonHeight: 180,
    divider: true,
    render: ({ state }) => <CommonGaps state={state} topics={topics} />,
  },
  hypotheses: {
    title: "Гипотезы на проверку",
    description: "Возможные пробелы из разбора, которые ещё ждут вашего решения",
    Icon: CircleHelp,
    skeletonHeight: 240,
    divider: true,
    render: ({ state }) => <Hypotheses state={state} topics={topics} />,
  },
};
