import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import App from "./App";
import "./index.css";
import { installLocalFetchInterceptor } from "@/lib/local-mode";
import { store } from "@/lib/local-store";
import { applyTheme } from "@/lib/theme";

applyTheme();
installLocalFetchInterceptor();

// Load the device's saved data before the first render so screens never see
// an empty store.
void store.hydrate().catch((e) => {
  console.error("Could not load saved data from this device", e);
}).then(() => createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster />
      <SonnerToaster />
    </QueryClientProvider>
  </StrictMode>
));
