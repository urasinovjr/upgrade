import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

export function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="dp-disclosure" data-open={open}>
      <button aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <ChevronDown size={14} aria-hidden="true" />
        {title}
      </button>
      <div className="dp-disclosure-reveal" inert={!open} aria-hidden={!open}>
        <div id={id}>{children}</div>
      </div>
    </div>
  );
}
