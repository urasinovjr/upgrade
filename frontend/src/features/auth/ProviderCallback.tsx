import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { account, type Provider } from "../../data/account";
import { useSetSession } from "../../shared/session";
import { ErrorMessage } from "../../shared/ui";
import { AuthLayout } from "./AuthLayout";
import { useOnce } from "./useOnce";

export default function ProviderCallback() {
  const { provider = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const setSession = useSetSession();
  const finish = useMutation({
    mutationFn: () => {
      if (params.get("error") || !params.get("code"))
        throw new Error("Вход отменён. Попробуйте ещё раз");
      return account.finishProvider(
        provider as Provider,
        params.get("code") ?? "",
        params.get("state") ?? "",
        params.get("device_id") ?? undefined,
      );
    },
    onSuccess: (result) => {
      if (result.session) {
        setSession(result.session);
        navigate("/dashboard", { replace: true });
        return;
      }
      void client.invalidateQueries({ queryKey: ["account"] });
      navigate("/settings", { replace: true });
    },
  });
  useOnce(() => finish.mutate());
  return (
    <AuthLayout
      title="Вход через сервис"
      footer={finish.isError && <Link to="/login">Вернуться ко входу</Link>}
    >
      {finish.isError ? <ErrorMessage error={finish.error} /> : <p>Завершаем вход…</p>}
    </AuthLayout>
  );
}
