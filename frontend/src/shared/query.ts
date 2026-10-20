import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { gateway, serverMode } from "../data/gateway";
import type { DashboardLayout } from "../domain/dashboardLayout";

export function useStore() {
  return useQuery({
    queryKey: ["store"],
    queryFn: () => gateway.read(),
    refetchInterval: (query) =>
      query.state.data?.works.some((work) => work.job) ? (serverMode ? 2000 : 500) : false,
  });
}
export function useCommand() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (command: () => Promise<void>) => command(),
    onSuccess: () => client.invalidateQueries({ queryKey: ["store"] }),
  });
}
export function useDashboardLayout() {
  return useQuery({
    queryKey: ["dashboard-layout"],
    queryFn: () => gateway.layout(),
    staleTime: Infinity,
    retry: false,
  });
}
export function useSaveLayout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (layout: DashboardLayout) => gateway.saveLayout(layout),
    onSuccess: (_, layout) => client.setQueryData(["dashboard-layout"], layout),
  });
}
