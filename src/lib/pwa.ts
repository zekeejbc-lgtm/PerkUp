/// <reference types="vite/client" />

const UPDATE_EVENT = "perkup:pwa-update-ready";

let waitingWorker: ServiceWorker | null = null;
let applyingUpdate = false;

const announce = (eventName: string) => window.dispatchEvent(new Event(eventName));

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;

  window.addEventListener("load", () => {
    // Precache installation is intentionally delayed so it cannot compete
    // with the hero image and other critical first-render resources.
    window.setTimeout(() => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((registration) => {
          if (registration.waiting && navigator.serviceWorker.controller) {
            waitingWorker = registration.waiting;
            announce(UPDATE_EVENT);
          }

          registration.addEventListener("updatefound", () => {
            const worker = registration.installing;
            if (!worker) return;
            worker.addEventListener("statechange", () => {
              if (worker.state === "installed" && navigator.serviceWorker.controller) {
                waitingWorker = worker;
                announce(UPDATE_EVENT);
              }
            });
          });

          window.setInterval(() => registration.update().catch(() => undefined), 60 * 60 * 1000);
        })
        .catch((error) => console.warn("Service worker registration failed.", error));
    }, 8_000);
  });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!applyingUpdate) return;
    window.location.reload();
  });
}

export const pwaEvents = { update: UPDATE_EVENT } as const;

export const hasPwaUpdate = () => Boolean(waitingWorker);

export function applyPwaUpdate() {
  if (!waitingWorker) return;
  applyingUpdate = true;
  waitingWorker.postMessage({ type: "SKIP_WAITING" });
}
