import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { serverMode } from "../../data/gateway";
import { useSession } from "../../shared/session";
import { ErrorMessage } from "../../shared/ui";
import { AuthLayout } from "./AuthLayout";

export function RequireSession({ children }: { children: ReactNode }) {
  const session = useSession();
  const location = useLocation();
  if (!serverMode) return children;
  if (session.isPending)
    return (
      <AuthLayout title="UpGrade">
        <p>Загружаем…</p>
      </AuthLayout>
    );
  if (session.isError)
    return (
      <AuthLayout title="Нет связи с сервером">
        <ErrorMessage error={session.error} />
        <button onClick={() => void session.refetch()}>Повторить</button>
      </AuthLayout>
    );
  if (!session.data) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={"/login?next=" + next} replace />;
  }
  return children;
}
