import { registerSW } from "virtual:pwa-register";

let controllerReloadScheduled = false;

/** Reload open tabs when a waiting service worker activates (skipWaiting + clientsClaim). */
function onServiceWorkerControllerChange(): void {
  if (controllerReloadScheduled) return;
  controllerReloadScheduled = true;
  window.location.reload();
}

/**
 * Register the PWA service worker in production and reload when a new version takes control,
 * so Android Chrome does not keep running a stale JS shell after deploy.
 */
export function setupPwaUpdates(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;

  navigator.serviceWorker.addEventListener(
    "controllerchange",
    onServiceWorkerControllerChange
  );

  registerSW({
    immediate: true,
    onRegisterError(error) {
      console.error("Service worker registration failed:", error);
    },
  });
}
