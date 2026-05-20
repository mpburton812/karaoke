import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import AppBootstrap from "./components/AppBootstrap.tsx";
import ErrorBoundary from "./components/ErrorBoundary.tsx";

/** After a new deploy, old cached JS may request missing chunk files — reload once. */
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  window.location.reload();
});

sessionStorage.removeItem("karaoke_chunk_retry");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <AppBootstrap />
    </ErrorBoundary>
  </StrictMode>
);
