const RECOVERY_KEY = "perkup:chunk-recovery-version";
const APP_CACHE_PREFIX = "perkup-";

type VitePreloadErrorEvent = Event & {
  payload?: unknown;
};

function currentEntryVersion() {
  const entryScript = Array.from(document.scripts).find(
    (script) => script.type === "module" && script.src.includes("/assets/"),
  );

  return entryScript?.src || window.location.origin;
}

function hasRetried(version: string) {
  try {
    return window.sessionStorage.getItem(RECOVERY_KEY) === version;
  } catch {
    return false;
  }
}

function rememberRetry(version: string) {
  try {
    window.sessionStorage.setItem(RECOVERY_KEY, version);
  } catch {
    // Recovery still works when session storage is unavailable.
  }
}

async function clearAppCaches() {
  if (!("caches" in window)) return;

  const cacheNames = await window.caches.keys();
  await Promise.all(
    cacheNames
      .filter((cacheName) => cacheName.startsWith(APP_CACHE_PREFIX))
      .map((cacheName) => window.caches.delete(cacheName)),
  );
}

/**
 * Vite emits this event when a deployed page still references a code-split
 * chunk from an older release. Clear only PerkUp's caches and reload once so
 * the browser obtains the current HTML and matching asset graph.
 */
export function installChunkRecovery() {
  window.addEventListener("vite:preloadError", (rawEvent) => {
    const event = rawEvent as VitePreloadErrorEvent;
    const version = currentEntryVersion();

    if (hasRetried(version)) return;

    event.preventDefault();
    rememberRetry(version);
    console.warn("A newer PerkUp release is available. Reloading current assets.", event.payload);

    void clearAppCaches().finally(() => {
      if ("serviceWorker" in navigator) {
        void navigator.serviceWorker.getRegistration("/").then((registration) => registration?.update());
      }
      window.location.reload();
    });
  });
}
