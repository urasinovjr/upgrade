import { catalogVersion } from "../../data/catalog";
import { useStore } from "../../shared/query";
import "../account/account.css";

export function CatalogBanner() {
  const store = useStore();
  const serverVersion = store.data?.catalogVersion;
  if (!serverVersion || serverVersion === catalogVersion) return null;
  return (
    <div className="dp-read-only" role="status">
      <span>Справочник тем обновился. Обновите страницу, чтобы увидеть новые темы.</span>
      <button type="button" className="dp-text" onClick={() => window.location.reload()}>
        Обновить страницу
      </button>
    </div>
  );
}
