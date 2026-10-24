import { useState } from "react";
import { families, topicById, topics, unknownTopicName } from "../data/catalog";

const matches = (text: string, query: string) => text.toLowerCase().includes(query);

export function TopicSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (topicId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const search = query.trim().toLowerCase();
  const visible = topics.filter(
    (topic) => topic.id === value || !search || matches(topic.name, search),
  );
  return (
    <>
      <label>
        Найти тему
        <input
          type="search"
          value={query}
          placeholder="Например, логарифм"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <label>
        {label}
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          {!topicById(value) && <option value={value}>{unknownTopicName}</option>}
          {families.map((family) => {
            const items = visible.filter((topic) => topic.family === family.id);
            if (!items.length) return null;
            return (
              <optgroup key={family.id} label={family.name}>
                {items.map((topic) => (
                  <option value={topic.id} key={topic.id}>
                    {topic.name}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
      </label>
    </>
  );
}
