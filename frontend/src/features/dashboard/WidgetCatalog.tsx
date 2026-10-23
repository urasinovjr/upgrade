import { Plus } from "lucide-react";
import type { WidgetId } from "../../domain/dashboardLayout";
import { Modal } from "../../shared/ui";
import { widgets } from "./widgets";

export function WidgetCatalog({
  open,
  onOpenChange,
  available,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  available: WidgetId[];
  onAdd: (id: WidgetId) => void;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Добавить блок"
      description="Блок появится в конце обзора. Потом перетащите его, куда удобно."
    >
      {available.length ? (
        <ul className="dp-catalog">
          {available.map((id) => {
            const { title, description, Icon } = widgets[id];
            return (
              <li key={id}>
                <button
                  className="dp-catalog-item"
                  aria-label={`Добавить «${title}»`}
                  aria-describedby={"catalog-" + id}
                  onClick={() => onAdd(id)}
                >
                  <span className="dp-catalog-icon" aria-hidden="true">
                    <Icon size={16} />
                  </span>
                  <span className="dp-catalog-text">
                    <strong>{title}</strong>
                    <small id={"catalog-" + id}>{description}</small>
                  </span>
                  <Plus className="dp-catalog-plus" size={16} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="dp-catalog-empty">Все блоки уже на обзоре.</p>
      )}
    </Modal>
  );
}
