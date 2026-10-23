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
import { topics } from "../../data/fixtures";
import { Roster } from "../students/Roster";
import { WorkQueue } from "../works/WorkQueue";
import type { QueueFilters, useQueueFilters } from "../works/useQueueFilters";
import type { QuickUpload } from "../works/useQuickUpload";
import { ActivityWidget, Closures, ReviewSpeed, StatusWidget, TopicErrors } from "./widgets/Charts";
import { Focus } from "./widgets/Focus";
import { Kpis } from "./widgets/Kpis";
import { CommonGaps, Events, Hypotheses, Inactive } from "./widgets/Lists";

export type WidgetContext = {
  state: StoreState;
  summary: DashboardSummary;
  filters: QueueFilters;
  update: ReturnType<typeof useQueueFilters>["update"];
  upload: QuickUpload;
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
      "Сколько работ ждёт проверки или уточнения, сколько подтверждено, сколько учеников и тем.",
    Icon: LayoutList,
    skeletonHeight: 72,
    divider: false,
    render: ({ summary }) => <Kpis summary={summary} />,
  },
  queue: {
    title: "Очередь работ",
    description: "Первые работы очереди с поиском и быстрой загрузкой файлов.",
    Icon: SquareCheckBig,
    skeletonHeight: 320,
    divider: true,
    render: ({ state, filters, update, upload, queueRef }) => (
      <WorkQueue
        ref={queueRef}
        state={state}
        mode="preview"
        filters={filters}
        update={update}
        upload={upload}
        className="dashboard-upload"
      />
    ),
  },
  focus: {
    title: "Фокус на ученике",
    description: "Открытые пробелы: что повторить с учеником дальше.",
    Icon: Crosshair,
    skeletonHeight: 240,
    divider: false,
    render: ({ summary }) => <Focus summary={summary} />,
  },
  activity: {
    title: "Ритм работы",
    description:
      "Добавленные и впервые подтверждённые работы за 14 дней. Нажмите на день, чтобы увидеть его работы в очереди.",
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
      "Все работы кабинета по состояниям. Нажмите на состояние, чтобы отфильтровать очередь.",
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
      "Каждый ученик по темам карты знаний: пробелы, закрытые темы и то, что к ним ведёт.",
    Icon: TableProperties,
    skeletonHeight: 220,
    divider: false,
    render: ({ state }) => <Roster state={state} />,
  },
  topicErrors: {
    title: "Ошибки по темам",
    description: "Доля шагов с ошибкой по каждой теме в подтверждённых работах.",
    Icon: AlertTriangle,
    skeletonHeight: 180,
    divider: true,
    render: ({ state }) => <TopicErrors works={state.works} topics={topics} />,
  },
  events: {
    title: "Лента событий",
    description: "Последние добавленные и подтверждённые работы, закрытые пробелы.",
    Icon: History,
    skeletonHeight: 260,
    divider: true,
    render: ({ state }) => <Events state={state} />,
  },
  reviewSpeed: {
    title: "Скорость проверки",
    description: "Сколько проходит от загрузки работы до первого подтверждения.",
    Icon: Gauge,
    skeletonHeight: 220,
    divider: true,
    render: ({ state }) => <ReviewSpeed works={state.works} />,
  },
  closures: {
    title: "Закрытые пробелы",
    description: "Закрытые и снова открытые пробелы по неделям.",
    Icon: TimerReset,
    skeletonHeight: 200,
    divider: true,
    render: ({ state }) => <Closures closures={state.closures} />,
  },
  inactive: {
    title: "Давно не сдавали",
    description: "Ученики без новых работ две недели и дольше.",
    Icon: UserRoundX,
    skeletonHeight: 180,
    divider: true,
    render: ({ state }) => <Inactive state={state} />,
  },
  commonGaps: {
    title: "Частые пробелы",
    description: "Темы, в которых открытый пробел есть у нескольких учеников.",
    Icon: Target,
    skeletonHeight: 180,
    divider: true,
    render: ({ state }) => <CommonGaps state={state} topics={topics} />,
  },
  hypotheses: {
    title: "Гипотезы на проверку",
    description: "Возможные пробелы из разбора, которые ещё ждут вашего решения.",
    Icon: CircleHelp,
    skeletonHeight: 240,
    divider: true,
    render: ({ state }) => <Hypotheses state={state} topics={topics} />,
  },
};
