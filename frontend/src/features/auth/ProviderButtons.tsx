import { useMutation } from "@tanstack/react-query";
import { account, providerTitles, type Consents, type Provider } from "../../data/account";
import { useAuthConfig } from "../../shared/session";
import { ErrorMessage } from "../../shared/ui";

export function ProviderButtons({ verb, consents }: { verb: string; consents?: Consents }) {
  const config = useAuthConfig();
  const start = useMutation({
    mutationFn: (provider: Provider) => account.startProvider(provider, consents),
    onSuccess: ({ authorizeUrl }) => window.location.assign(authorizeUrl),
  });
  const providers = config.data?.providers ?? [];
  if (!providers.length) return null;
  return (
    <div className="dp-auth-providers">
      {providers.map((provider) => (
        <button
          key={provider}
          type="button"
          disabled={start.isPending}
          onClick={() => start.mutate(provider)}
        >
          {verb} через {providerTitles[provider]}
        </button>
      ))}
      <ErrorMessage error={start.error} />
    </div>
  );
}
