const isAssetLikePath = (pathname: string) =>
  /\.(avif|webp|png|jpe?g|gif|svg|ico)$/i.test(pathname) ||
  pathname.startsWith("/images/") ||
  pathname.startsWith("/icons/");

export function installLazyImageDefaults() {
  if (typeof window === "undefined" || typeof MutationObserver === "undefined") return;

  const applyDefaults = (root: ParentNode) => {
    root.querySelectorAll("img").forEach((image) => {
      const img = image as HTMLImageElement;
      if (!img.hasAttribute("decoding")) img.decoding = "async";
      if (!img.hasAttribute("loading") && img.dataset.eager !== "true") img.loading = "lazy";
      if (img.src) {
        try {
          const url = new URL(img.src, window.location.origin);
          if (url.origin === window.location.origin && isAssetLikePath(url.pathname)) {
            img.referrerPolicy = img.referrerPolicy || "no-referrer";
          }
        } catch {
          // Ignore invalid or data URLs.
        }
      }
    });
  };

  applyDefaults(document);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLImageElement) {
          applyDefaults(node.parentNode ?? document);
        } else if (node instanceof HTMLElement) {
          applyDefaults(node);
        }
      }
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
}
