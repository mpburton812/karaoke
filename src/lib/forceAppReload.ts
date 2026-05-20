/** Clear PWA caches, refresh service workers, and reload to fetch the latest deployed app. */
export async function forceAppReload(): Promise<void> {
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations.map(async (reg) => {
        try {
          await reg.update();
        } catch {
          /* offline or update blocked */
        }
      })
    );
  }

  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }

  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((reg) => reg.unregister()));
  }

  window.location.reload();
}

export function isChunkLoadError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("failed to fetch dynamically imported module") ||
    lower.includes("importing a module script failed") ||
    lower.includes("loading chunk") ||
    lower.includes("chunkloaderror")
  );
}
