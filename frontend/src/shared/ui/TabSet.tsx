import * as Tabs from "@radix-ui/react-tabs";
import { useRef, type ReactNode } from "react";
import { cancelContentChange, changeContent } from "./motion";

export function TabSet({
  label,
  items,
  value,
  onChange,
  children,
}: {
  label: string;
  items: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  const content = useRef<HTMLDivElement>(null);
  return (
    <Tabs.Root
      value={value}
      onValueChange={(next) => {
        if (next !== value) void changeContent(content.current, () => onChange(next));
      }}
    >
      <Tabs.List className="dp-tabs" aria-label={label}>
        {items.map((item) => (
          <Tabs.Trigger
            key={item.value}
            value={item.value}
            onClick={() => {
              if (item.value === value) cancelContentChange(content.current);
            }}
          >
            {item.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      <Tabs.Content ref={content} key={value} value={value} className="dp-tab-content">
        {children}
      </Tabs.Content>
    </Tabs.Root>
  );
}
