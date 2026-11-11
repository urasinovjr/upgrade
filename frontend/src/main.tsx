import "@fontsource/golos-text/400.css";
import "@fontsource/golos-text/500.css";
import "@fontsource/golos-text/600.css";
import "@fontsource/golos-text/700.css";
import "@fontsource/unbounded/600.css";
import "@fontsource/unbounded/700.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { router } from "./app/router";
import { onAuthLost, onSubscriptionEnded } from "./data/api";
import { sessionKey } from "./shared/session";
import "./styles.css";
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});
onAuthLost(() => queryClient.setQueryData(sessionKey, null));
onSubscriptionEnded(() => void queryClient.invalidateQueries({ queryKey: sessionKey }));
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
