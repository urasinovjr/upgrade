import { Link } from "react-router";
import { useWriteAccess } from "../../shared/session";
import "./account.css";

export function ReadOnlyBanner() {
  const access = useWriteAccess();
  if (access.allowed) return null;
  return (
    <div className="dp-read-only" role="status">
      <span>{access.reason}</span>
      <Link to="/subscription">Продлить подписку</Link>
    </div>
  );
}
