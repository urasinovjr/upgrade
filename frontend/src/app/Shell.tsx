import "@fontsource/golos-text/400.css";
import "@fontsource/golos-text/500.css";
import "@fontsource/golos-text/600.css";
import "@fontsource/golos-text/700.css";
import "@fontsource/unbounded/600.css";
import "@fontsource/unbounded/700.css";
import {
  BookOpen,
  CircleHelp,
  Files,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  SquarePen,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Suspense, useEffect, useRef, useState } from "react";
import { Link, Outlet, ScrollRestoration, useLocation, useNavigate } from "react-router";
import { account } from "../data/account";
import { serverMode } from "../data/gateway";
import { needsAttention } from "../domain/analytics";
import { ReadOnlyBanner } from "../features/account/ReadOnlyBanner";
import { CatalogBanner } from "../features/knowledge/CatalogBanner";
import { TimingTracker } from "../features/timing/TimingTracker";
import { useStore } from "../shared/query";
import { useSession, useSetSession, useWriteAccess } from "../shared/session";
import { studentTone } from "../shared/status";
import { wordForCount } from "../shared/text";
import { BrandMark, PageLoading, Wordmark } from "../shared/ui";
import { TopbarSlots } from "../shared/ui/topbar";
import { useMediaQuery } from "../shared/useMediaQuery";
import "../styles.css";
import { pages } from "./pages";
const railQuery = "(min-width: 701px) and (max-width: 1199px)";

type Section = "dashboard" | "homework" | "works" | "students";
const sections: Record<Section, { title: string; path: string; Icon: LucideIcon }> = {
  dashboard: { title: "Обзор", path: "/dashboard", Icon: LayoutDashboard },
  homework: { title: "ДЗ", path: "/homework", Icon: BookOpen },
  works: { title: "Проверка", path: "/works", Icon: Files },
  students: { title: "Ученики", path: "/students", Icon: Users },
};
function sectionOf(path: string): Section | undefined {
  if (path === "/dashboard") return "dashboard";
  if (path === "/homework" || path.startsWith("/homework/")) return "homework";
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
  tour,
}: {
  section: Section;
  current?: Section;
  exact?: boolean;
  count?: number;
  childActive?: boolean;
  tour?: string;
}) {
  const { title, path, Icon } = sections[section];
  const active = section === current;
  const activeClass = childActive ? "active dp-nav-parent" : "active";
  const currentValue = exact && !childActive ? "page" : "true";
  const descriptionId = count ? `nav-${section}-count` : undefined;
  return (
    <Link
      to={path}
      viewTransition
      onPointerEnter={() => void pages[section]()}
      onFocus={() => void pages[section]()}
      className={active ? activeClass : undefined}
      aria-current={active ? currentValue : undefined}
      aria-label={title}
      aria-describedby={descriptionId}
      title={title}
      data-tour={tour}
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

export function Shell() {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;
  const store = useStore();
  const session = useSession();
  const setSession = useSetSession();
  const writeAccess = useWriteAccess();
  const displayName = session.data?.account.displayName ?? "Репетитор";
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
            <Wordmark className="dp-nav-text dp-workspace-name" />
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
            onClick={() => navigate("/homework", { viewTransition: true })}
            onPointerEnter={() => void pages.homework()}
            aria-label="Открыть ДЗ"
            title="Открыть ДЗ"
            data-tour="new-work"
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
                <BrandMark className="dp-rail-mark" />
                <PanelLeftOpen className="dp-rail-open" size={16} />
              </>
            ) : (
              <PanelLeftClose size={16} />
            )}
          </button>
        </div>
        <nav aria-label="Основная навигация">
          <NavItem section="dashboard" current={section} exact={exact} />
          <NavItem section="homework" current={section} exact={exact} />
          <NavItem section="works" current={section} exact={exact} count={attention} />
          <NavItem
            section="students"
            current={section}
            exact={exact}
            childActive={students.some((student) => path === "/students/" + student.id)}
            tour="students"
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
                  viewTransition
                  onPointerEnter={() => void pages.student()}
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
        <button
          className="dp-sidebar-help"
          onClick={() => navigate("/dashboard", { state: { tour: "restart" } })}
          aria-label="Знакомство с кабинетом"
          title="Знакомство с кабинетом"
          data-tour="restart"
        >
          <CircleHelp size={16} aria-hidden="true" />
          <span className="dp-nav-text">Знакомство с кабинетом</span>
        </button>
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
        <CatalogBanner />
        {serverMode && <TimingTracker />}
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
