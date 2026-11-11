import "@fontsource/golos-text/400.css";
import "@fontsource/golos-text/500.css";
import "@fontsource/golos-text/600.css";
import "@fontsource/golos-text/700.css";
import "@fontsource/unbounded/600.css";
import "@fontsource/unbounded/700.css";
import { SearchX } from "lucide-react";
import { Suspense } from "react";
import { createBrowserRouter, createHashRouter, Navigate } from "react-router";
import { serverMode } from "../data/gateway";
import { RequireSession } from "../features/auth/RequireSession";
import { GuestHome } from "../features/landing/GuestHome";
import Legal from "../features/legal/Legal";
import { PageLoading, PageState } from "../shared/ui";
import "../styles.css";
import * as Pages from "./pages";
import { Alias, HomeworkRedirect } from "./RouteAliases";
import { RouteError, ShellError } from "./RouteError";
import { Shell } from "./Shell";
const createRouter = import.meta.env.MODE === "standalone" ? createHashRouter : createBrowserRouter;
const authPages = [
  { path: "login", Page: Pages.Login },
  { path: "register", Page: Pages.Register },
  { path: "auth/confirm", Page: Pages.ConfirmEmail },
  { path: "auth/reset", Page: Pages.ResetRequest },
  { path: "auth/reset/confirm", Page: Pages.ResetPassword },
  { path: "auth/callback/:provider", Page: Pages.ProviderCallback },
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
const landingPage = (
  <Suspense fallback={null}>
    <Pages.Landing />
  </Suspense>
);
const landingRoutes = [
  { path: "welcome", errorElement: <ShellError />, element: landingPage },
  ...(serverMode
    ? [
        {
          index: true,
          errorElement: <ShellError />,
          element: <GuestHome>{landingPage}</GuestHome>,
        },
      ]
    : []),
];
export const router = createRouter([
  { path: "legal/terms", element: <Legal document="terms" />, errorElement: <ShellError /> },
  {
    path: "legal/personal-data",
    element: <Legal document="personal-data" />,
    errorElement: <ShellError />,
  },
  {
    path: "student",
    element: (
      <Suspense fallback={<PageLoading />}>
        <Pages.StudentPortal />
      </Suspense>
    ),
    errorElement: <ShellError />,
  },
  ...["student/login", "student/activate"].map((path) => ({
    path,
    element: (
      <Suspense fallback={<PageLoading />}>
        <Pages.StudentAuth />
      </Suspense>
    ),
    errorElement: <ShellError />,
  })),
  ...authRoutes,
  ...landingRoutes,
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
          ...(serverMode ? [] : [{ index: true, element: <Navigate to="/dashboard" replace /> }]),
          { path: "dashboard", element: <Pages.Dashboard /> },
          { path: "homework", element: <Pages.Homework /> },
          { path: "homework/:id", element: <Pages.Homework /> },
          { path: "works", element: <Pages.Works /> },
          { path: "works/new", element: <HomeworkRedirect /> },
          { path: "works/:id", element: <Pages.Review /> },
          { path: "works/:id/report", element: <Pages.Report /> },
          { path: "students", element: <Pages.Students /> },
          { path: "students/:id", element: <Pages.StudentDetail /> },
          { path: "review/:id", element: <Alias base="/works/" /> },
          { path: "student/:id", element: <Alias base="/students/" /> },
          ...(serverMode
            ? [
                { path: "settings", element: <Pages.AccountSettings /> },
                { path: "subscription", element: <Pages.Subscription /> },
                { path: "timing", element: <Pages.Stopwatch /> },
              ]
            : []),
          ...(import.meta.env.DEV ? [{ path: "dev/states", element: <Pages.States /> }] : []),
          {
            path: "*",
            element: (
              <PageState
                title="Страница не найдена"
                description="Проверьте адрес или откройте список работ"
                icon={SearchX}
                to="/works"
                linkLabel="К работам"
              />
            ),
          },
        ],
      },
    ],
  },
]);
