import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router";
import { account } from "../../data/account";
import { useSetSession } from "../../shared/session";
import { ErrorMessage } from "../../shared/ui";
import { AuthLayout } from "./AuthLayout";
import { useOnce } from "./useOnce";

export default function ConfirmEmail() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const setSession = useSetSession();
  const confirm = useMutation({
    mutationFn: () => account.confirm(params.get("token") ?? ""),
    onSuccess: (session) => {
      setSession(session);
      navigate("/dashboard", { replace: true });
    },
  });
  useOnce(() => confirm.mutate());
  return (
    <AuthLayout
      title="Подтверждение почты"
      footer={confirm.isError && <Link to="/login">Вернуться ко входу</Link>}
    >
      {confirm.isError ? <ErrorMessage error={confirm.error} /> : <p>Проверяем ссылку…</p>}
    </AuthLayout>
  );
}
