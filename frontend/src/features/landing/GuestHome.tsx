import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useSession } from "../../shared/session";

export function GuestHome({ children }: { children: ReactNode }) {
  const session = useSession();
  if (session.data) return <Navigate to="/dashboard" replace />;
  if (session.isPending) return null;
  return children;
}
