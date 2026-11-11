import { Navigate, useLocation, useParams } from "react-router";
export function HomeworkRedirect() {
  const location = useLocation();
  return <Navigate to={"/homework" + location.search + location.hash} replace />;
}

export function Alias({ base }: { base: string }) {
  const { id = "" } = useParams();
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: base + id, search, hash }} replace />;
}
