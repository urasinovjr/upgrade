import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createBrowserRouter,
  createHashRouter,
  Navigate,
  Outlet,
  Link,
  useRouteError,
  useLocation,
  useNavigate,
  useParams,
  ScrollRestoration,
} from "react-router";
import { RouterProvider } from "react-router/dom";
import {
  ArrowUpRight,
  Files,
  LogOut,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  SearchX,
  SquarePen,
  Users,
  type LucideIcon,
} from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "./styles.css";
import { PageLoading, PageState } from "./shared/ui";
import { TopbarSlots } from "./shared/ui/topbar";
import { useStore } from "./shared/query";
import { wordForCount } from "./shared/text";
import { studentTone } from "./shared/status";
import { needsAttention } from "./domain/analytics";
import { useMediaQuery } from "./shared/useMediaQuery";
import { account } from "./data/account";
import { onAuthLost, onSubscriptionEnded } from "./data/api";
import { serverMode } from "./data/gateway";
import { sessionKey, useSession, useSetSession, useWriteAccess } from "./shared/session";
import { RequireSession } from "./features/auth/RequireSession";
import { ReadOnlyBanner } from "./features/account/ReadOnlyBanner";

const Works = lazy(() => import("./features/works/Works"));
const Dashboard = lazy(() => import("./features/dashboard/Dashboard"));
const NewWork = lazy(() => import("./features/works/NewWork"));
const Review = lazy(() => import("./features/review/Review"));
const Students = lazy(() => import("./features/students/Students"));
const StudentDetail = lazy(() => import("./features/knowledge/StudentDetail"));
const Report = lazy(() => import("./features/reports/Report"));
const States = lazy(() => import("./features/States"));
const Login = lazy(() => import("./features/auth/Login"));
const Register = lazy(() => import("./features/auth/Register"));
const ConfirmEmail = lazy(() => import("./features/auth/ConfirmEmail"));
const ResetRequest = lazy(() => import("./features/auth/ResetRequest"));
const ResetPassword = lazy(() => import("./features/auth/ResetPassword"));
const ProviderCallback = lazy(() => import("./features/auth/ProviderCallback"));
const AccountSettings = lazy(() => import("./features/account/AccountSettings"));
const Subscription = lazy(() => import("./features/account/Subscription"));

const railQuery = "(min-width: 701px) and (max-width: 1199px)";

type Section = "dashboard" | "works" | "students";
const sections: Record<Section, { title: string; path: string; Icon: LucideIcon }> = {
  dashboard: { title: "Обзор", path: "/dashboard", Icon: LayoutDashboard },
  works: { title: "Работы", path: "/works", Icon: Files },
  students: { title: "Ученики", path: "/students", Icon: Users },
};
function sectionOf(path: string): Section | undefined {
  if (path === "/dashboard") return "dashboard";
  if (path === "/works" || path.startsWith("/works/")) return "works";
  if (path === "/students" || path.startsWith("/students/")) return "students";
}

function loadingVariant(path: string) {
  if (path === "/dashboard") return "dashboard";
  if (path === "/works/new") return "form";
  if (path.includes("/report")) return "report";
  if (path.startsWith("/works/")) return "review";
  if (path.startsWith("/students/")) return "student";
  return "list";
}

function NavItem({
  section,
  current,
  exact = false,
  count = 0,
  childActive = false,
}: {
  section: Section;
  current?: Section;
  exact?: boolean;
  count?: number;
  childActive?: boolean;
}) {
  const { title, path, Icon } = sections[section];
  const active = section === current;
  const activeClass = childActive ? "active dp-nav-parent" : "active";
  const currentValue = exact && !childActive ? "page" : "true";
  const descriptionId = count ? `nav-${section}-count` : undefined;
  return (
    <Link
      to={path}
      className={active ? activeClass : undefined}
      aria-current={active ? currentValue : undefined}
      aria-label={title}
      aria-describedby={descriptionId}
      title={title}
    >
      <Icon size={16} aria-hidden="true" />
      <span className="dp-nav-text">{title}</span>
      {count ? (
        <span className="dp-nav-count" aria-hidden="true">
          {count}
        </span>
      ) : null}
      {descriptionId ? (
        <span id={descriptionId} className="dp-visually-hidden">
          {count} {wordForCount(count, ["работа требует", "работы требуют", "работ требуют"])}{" "}
          внимания
        </span>
      ) : null}
    </Link>
  );
}

function Shell() {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;
  const store = useStore();
  const session = useSession();
  const setSession = useSetSession();
  const writeAccess = useWriteAccess();
  const displayName = session.data?.account.displayName ?? "Преподаватель";
  const railByDefault = useMediaQuery(railQuery);
  const [collapsedChoice, setCollapsedChoice] = useState<boolean | null>(null);
  const collapsed = collapsedChoice ?? railByDefault;
  const [trail, setTrail] = useState<HTMLElement | null>(null);
  const [actions, setActions] = useState<HTMLElement | null>(null);
  const section = sectionOf(path);
  const exact = section !== undefined && path === sections[section].path;
  const students = (store.data?.students ?? []).filter((student) => !student.archivedAt);
  const attention = store.data?.works.filter(needsAttention).length ?? 0;
  const studentGroup = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const group = studentGroup.current;
    const link = group?.querySelector<HTMLElement>("a.active");
    if (!group || !link) return;
    const top = link.offsetTop - group.offsetTop;
    const hiddenAbove = top < group.scrollTop;
    const hiddenBelow = top + link.offsetHeight > group.scrollTop + group.clientHeight;
    if (hiddenAbove || hiddenBelow)
      group.scrollTop = top - (group.clientHeight - link.offsetHeight) / 2;
  }, [path, students.length]);
  const toggleLabel = collapsed ? "Развернуть навигацию" : "Свернуть навигацию";
  const variant = loadingVariant(path);

  const openSearch = () => {
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Поиск работ"]');
    if (path === "/works" && input) input.focus();
    else navigate("/works", { state: { focusSearch: true } });
  };

  return (
    <div
      className={"dp-app" + (collapsed ? " dp-nav-collapsed" : "")}
      onClickCapture={(event) => {
        if (event.target instanceof Element) {
          event.target.closest("button")?.focus({ preventScroll: true });
        }
      }}
    >
      <a
        className="dp-skip"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          const content = document.getElementById("main-content");
          content?.focus();
          content?.scrollIntoView();
        }}
      >
        К содержимому
      </a>
      <aside id="app-sidebar" className="dp-sidebar sidebar">
        <div className="dp-sidebar-head">
          <Link to="/dashboard" className="dp-workspace">
            <span className="dp-brand-mark" aria-hidden="true">
              <ArrowUpRight size={14} strokeWidth={2.5} />
            </span>
            <span className="dp-nav-text dp-workspace-name">UpGrade</span>
          </Link>
          <button
            className="dp-icon dp-sidebar-tool"
            onClick={openSearch}
            aria-label="Найти работу"
            title="Найти работу"
          >
            <Search size={16} />
          </button>
          <button
            className="dp-icon dp-sidebar-tool"
            disabled={!writeAccess.allowed}
            onClick={() => navigate("/works/new")}
            aria-label="Новая работа"
            title="Новая работа"
          >
            <SquarePen size={16} />
          </button>
          <button
            className="dp-icon dp-sidebar-toggle"
            onClick={() => setCollapsedChoice(!collapsed)}
            aria-label={toggleLabel}
            title={toggleLabel}
            aria-expanded={!collapsed}
            aria-controls="app-sidebar"
          >
            {collapsed ? (
              <>
                <span className="dp-brand-mark dp-rail-mark" aria-hidden="true">
                  <ArrowUpRight size={14} strokeWidth={2.5} />
                </span>
                <PanelLeftOpen className="dp-rail-open" size={16} />
              </>
            ) : (
              <PanelLeftClose size={16} />
            )}
          </button>
        </div>
        <nav aria-label="Основная навигация">
          <NavItem section="dashboard" current={section} exact={exact} />
          <NavItem section="works" current={section} exact={exact} count={attention} />
          <NavItem
            section="students"
            current={section}
            exact={exact}
            childActive={students.some((student) => path === "/students/" + student.id)}
          />
        </nav>
        {students.length > 0 && (
          <div
            ref={studentGroup}
            className="dp-sidebar-group"
            role="group"
            aria-labelledby="sidebar-students-label"
          >
            <div id="sidebar-students-label" className="dp-sidebar-label">
              Мои ученики
            </div>
            {students.map((student) => {
              const current = path === "/students/" + student.id;
              return (
                <Link
                  key={student.id}
                  to={"/students/" + student.id}
                  className={current ? "active" : undefined}
                  aria-current={current ? "page" : undefined}
                >
                  <span
                    className={"dp-sidebar-initial dp-tone-" + studentTone(student.color)}
                    aria-hidden="true"
                  >
                    {student.name[0]}
                  </span>
                  <span className="dp-nav-text">{student.name}</span>
                </Link>
              );
            })}
          </div>
        )}
        <div className="dp-sidebar-bottom">
          <span className="dp-sidebar-avatar" aria-hidden="true">
            {displayName[0]}
          </span>
          {serverMode ? (
            <Link to="/settings" className="dp-sidebar-person" title="Настройки аккаунта">
              <span className="dp-nav-text">{displayName}</span>
              <span className="dp-nav-text dp-sidebar-meta">Настройки и подписка</span>
            </Link>
          ) : (
            <span className="dp-sidebar-person">
              <span className="dp-nav-text">{displayName}</span>
              <span className="dp-nav-text dp-sidebar-meta">Математика · 9–11 класс</span>
            </span>
          )}
          {serverMode && (
            <button
              className="dp-icon dp-sidebar-tool"
              onClick={() => void account.logout().finally(() => setSession(null))}
              aria-label="Выйти"
              title="Выйти"
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </aside>
      <div className="dp-workspace-main">
        <header className="dp-topbar">
          <div className="dp-topbar-trail">
            {section &&
              (exact ? (
                <strong className="dp-topbar-section">{sections[section].title}</strong>
              ) : (
                <Link to={sections[section].path} className="dp-topbar-section">
                  {sections[section].title}
                </Link>
              ))}
            <span ref={setTrail} className="dp-topbar-slot" />
          </div>
          <div ref={setActions} className="dp-topbar-actions" />
        </header>
        <ReadOnlyBanner />
        <main id="main-content" className="dp-main" tabIndex={-1}>
          <TopbarSlots.Provider value={{ trail, actions }}>
            <Suspense fallback={<PageLoading variant={variant} />}>
              <Outlet />
            </Suspense>
          </TopbarSlots.Provider>
        </main>
      </div>
      <ScrollRestoration />
    </div>
  );
}
function Alias({ base }: { base: string }) {
  const { id = "" } = useParams();
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: base + id, search, hash }} replace />;
}
function RouteError() {
  const error = useRouteError();
  return (
    <PageState
      title="Не удалось открыть экран"
      description="Обновите страницу или вернитесь к списку работ: сохранённые данные не пострадали."
      error={error}
      to="/works"
      linkLabel="К работам"
    />
  );
}
function ShellError() {
  return (
    <div className="dp-app">
      <main id="main-content" className="dp-main">
        <RouteError />
      </main>
    </div>
  );
}
const createRouter = import.meta.env.MODE === "standalone" ? createHashRouter : createBrowserRouter;
const authPages = [
  { path: "login", Page: Login },
  { path: "register", Page: Register },
  { path: "auth/confirm", Page: ConfirmEmail },
  { path: "auth/reset", Page: ResetRequest },
  { path: "auth/reset/confirm", Page: ResetPassword },
  { path: "auth/callback/:provider", Page: ProviderCallback },
];
const authRoutes = serverMode
  ? authPages.map(({ path, Page }) => ({
      path,
      errorElement: <ShellError />,
      element: (
        <Suspense fallback={null}>
          <Page />
        </Suspense>
      ),
    }))
  : [];
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});
onAuthLost(() => queryClient.setQueryData(sessionKey, null));
onSubscriptionEnded(() => void queryClient.invalidateQueries({ queryKey: sessionKey }));
const router = createRouter([
  ...authRoutes,
  {
    element: (
      <RequireSession>
        <Shell />
      </RequireSession>
    ),
    errorElement: <ShellError />,
    children: [
      {
        errorElement: <RouteError />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: "dashboard", element: <Dashboard /> },
          { path: "works", element: <Works /> },
          { path: "works/new", element: <NewWork /> },
          { path: "works/:id", element: <Review /> },
          { path: "works/:id/report", element: <Report /> },
          { path: "students", element: <Students /> },
          { path: "students/:id", element: <StudentDetail /> },
          { path: "review/:id", element: <Alias base="/works/" /> },
          { path: "student/:id", element: <Alias base="/students/" /> },
          ...(serverMode
            ? [
                { path: "settings", element: <AccountSettings /> },
                { path: "subscription", element: <Subscription /> },
              ]
            : []),
          ...(import.meta.env.DEV ? [{ path: "dev/states", element: <States /> }] : []),
          {
            path: "*",
            element: (
              <PageState
                title="Страница не найдена"
                description="Проверьте адрес или откройте список работ."
                icon={SearchX}
                to="/works"
                linkLabel="Открыть работы"
              />
            ),
          },
        ],
      },
    ],
  },
]);
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
