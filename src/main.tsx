import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import AppBootstrap from "./components/AppBootstrap.tsx";
import ErrorBoundary from "./components/ErrorBoundary.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <AppBootstrap />
    </ErrorBoundary>
  </StrictMode>
);
