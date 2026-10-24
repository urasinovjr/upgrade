import { useEffect, useEffectEvent, useState } from "react";
import { useSearchParams } from "react-router";
import { topics } from "../../data/fixtures";

export type StudentTab = "overview" | "map" | "history";
export const studentTabs: { value: StudentTab; label: string }[] = [
  { value: "overview", label: "Сводка" },
  { value: "map", label: "Карта знаний" },
  { value: "history", label: "История" },
];
const parseTab = (value: string | null) => studentTabs.find((tab) => tab.value === value)?.value;
const parseTopic = (value: string | null) => topics.find((topic) => topic.id === value)?.id;
const tabFrom = (params: URLSearchParams) =>
  parseTab(params.get("tab")) ?? (params.has("topic") ? "map" : "overview");

export function useStudentView(defaultTopic: string) {
  const [params, setParams] = useSearchParams();
  const search = params.toString();
  const [tab, setTab] = useState<StudentTab>(() => tabFrom(params));
  const [topic, setTopic] = useState(() => parseTopic(params.get("topic")) ?? defaultTopic);
  const [sync, setSync] = useState({ seen: search, written: search });
  if (search !== sync.seen) {
    setSync({ seen: search, written: sync.written });
    if (search !== sync.written) {
      setTab(tabFrom(params));
      setTopic(parseTopic(params.get("topic")) ?? topic);
    }
  }
  const urlFor = (nextTab: StudentTab, nextTopic: string) => {
    const next = new URLSearchParams(params);
    next.delete("tab");
    next.delete("topic");
    if (nextTab !== "overview") next.set("tab", nextTab);
    if (nextTab === "map") next.set("topic", nextTopic);
    return next;
  };
  const write = (nextTab: StudentTab, nextTopic: string) => {
    const next = urlFor(nextTab, nextTopic);
    setSync({ seen: search, written: next.toString() });
    setParams(next, { replace: true, preventScrollReset: true });
  };
  const normalizeUrl = useEffectEvent(() => {
    const rawTab = params.get("tab");
    const rawTopic = params.get("topic");
    const urlTab = tabFrom(params);
    const badTab = rawTab !== null && (urlTab === "overview" || rawTab !== urlTab);
    const legacy = rawTab === null && urlTab === "map";
    const badTopic = rawTopic !== null && (urlTab !== "map" || !parseTopic(rawTopic));
    const missingTopic = urlTab === "map" && rawTopic === null;
    if (badTab || legacy || badTopic || missingTopic)
      setParams(urlFor(urlTab, parseTopic(rawTopic) ?? topic), {
        replace: true,
        preventScrollReset: true,
      });
  });
  useEffect(() => normalizeUrl(), [search]);
  return {
    tab,
    topic,
    changeTab(next: StudentTab) {
      setTab(next);
      write(next, topic);
    },
    writeTopic(next: string) {
      if (tab === "map") write("map", next);
    },
    setTopic,
    openMap(next: string) {
      setTopic(next);
      setTab("map");
      write("map", next);
    },
  };
}
