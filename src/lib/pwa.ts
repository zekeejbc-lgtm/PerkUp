/// <reference types="vite/client" />

const UPDATE_EVENT = "perkup:pwa-update-ready";
const INSTALL_EVENT = "perkup:pwa-install-ready";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

let waitingWorker: ServiceWorker | null = null;
let installPrompt: BeforeInstallPromptEvent | null = null;
let applyingUpdate = false;

const announce = (eventName: string) => window.dispatchEvent(new Event(eventName));

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event as BeforeInstallPromptEvent;
    announce(INSTALL_EVENT);
  });

  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    announce(INSTALL_EVENT);
  });

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

export const pwaEvents = { update: UPDATE_EVENT, install: INSTALL_EVENT } as const;

export const hasPwaUpdate = () => Boolean(waitingWorker);
export const canInstallPwa = () => Boolean(installPrompt);

export function applyPwaUpdate() {
  if (!waitingWorker) return;
  applyingUpdate = true;
  waitingWorker.postMessage({ type: "SKIP_WAITING" });
}

export async function showPwaInstallPrompt() {
  if (!installPrompt) return "unavailable" as const;
  const prompt = installPrompt;
  await prompt.prompt();
  const { outcome } = await prompt.userChoice;
  installPrompt = null;
  announce(INSTALL_EVENT);
  return outcome;
}
