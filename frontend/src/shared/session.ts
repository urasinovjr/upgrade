import { useQuery, useQueryClient } from "@tanstack/react-query";
import { account, type SessionInfo } from "../data/account";
import { ApiError } from "../data/api";
import { serverMode } from "../data/gateway";

export const sessionKey = ["session"];

async function loadSession(): Promise<SessionInfo | null> {
  try {
    return await account.session();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export function useSession() {
  return useQuery({
    queryKey: sessionKey,
    queryFn: loadSession,
    enabled: serverMode,
    staleTime: 60_000,
    retry: false,
  });
}

export function useSetSession() {
  const client = useQueryClient();
  return (session: SessionInfo | null) => {
    client.setQueryData(sessionKey, session);
    if (!session) client.removeQueries({ queryKey: ["store"] });
  };
}

export function useAuthConfig() {
  return useQuery({ queryKey: ["auth-config"], queryFn: account.config, staleTime: Infinity });
}

export function useWriteAccess() {
  const session = useSession();
  if (!serverMode) return { allowed: true, reason: "" };
  const status = session.data?.subscription.status;
  const allowed = status === "trial" || status === "active";
  return {
    allowed,
    reason: allowed ? "" : "Подписка закончилась. Работы и отчёты можно только смотреть.",
  };
}
