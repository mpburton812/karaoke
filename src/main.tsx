import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import AppBootstrap from "./components/AppBootstrap.tsx";
import ErrorBoundary from "./components/ErrorBoundary.tsx";
import { recoverFromChunkError } from "./lib/chunkRecovery.ts";
import { isChunkLoadError } from "./lib/forceAppReload.ts";
import { setupPwaUpdates } from "./lib/registerPwa.ts";

setupPwaUpdates();

/** After a new deploy, old cached JS may request missing chunk files. */
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  void recoverFromChunkError(event.payload ?? new Error("preload failed"));
});

window.addEventListener("unhandledrejection", (event) => {
  const message =
    event.reason instanceof Error
      ? event.reason.message
      : String(event.reason ?? "");
  if (!isChunkLoadError(message)) return;
  event.preventDefault();
  void recoverFromChunkError(event.reason);
});

sessionStorage.removeItem("karaoke_chunk_retry");
sessionStorage.removeItem("karaoke_build_sync_retry");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <AppBootstrap />
    </ErrorBoundary>
  </StrictMode>
);
