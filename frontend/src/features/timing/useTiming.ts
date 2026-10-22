import { useQuery } from "@tanstack/react-query";
import { serverMode } from "../../data/gateway";
import { timing } from "../../data/timing";

export function useTiming() {
  const query = useQuery({
    queryKey: ["timing"],
    queryFn: timing.status,
    enabled: serverMode,
    staleTime: 5 * 60 * 1000,
  });
  return Boolean(query.data?.enabled);
}
