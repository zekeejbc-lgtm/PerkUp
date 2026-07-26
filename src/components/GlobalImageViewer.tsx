import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type ViewedImage = {
  src: string;
  alt: string;
};

const INTERACTIVE_PARENT_SELECTOR = "a, button, input, select, textarea, [role='button'], [role='link']";
const IMAGE_VIEWER_EXCLUDED_SELECTOR = ".leaflet-container, [data-image-viewer-scope='ignore']";

function getViewedImage(target: EventTarget | null): ViewedImage | null {
  if (!(target instanceof Element)) return null;

  const image = target.closest("img");
  if (
    !(image instanceof HTMLImageElement)
    || image.dataset.imageViewerIgnore === "true"
    || image.closest(INTERACTIVE_PARENT_SELECTOR)
    || image.closest(IMAGE_VIEWER_EXCLUDED_SELECTOR)
  ) {
    return null;
  }

  const src = image.currentSrc || image.src;
  if (!src) return null;

  return {
    src,
    alt: image.alt.trim(),
  };
}

/**
 * Gives every HTML image in the application the same full-size preview behavior.
 * Event delegation also covers images rendered later by lazy-loaded routes.
 */
export function GlobalImageViewer() {
  const [viewedImage, setViewedImage] = useState<ViewedImage | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  const closeViewer = useCallback(() => setViewedImage(null), []);

  useEffect(() => {
    const makeStandaloneImagesKeyboardAccessible = (root: ParentNode) => {
      root.querySelectorAll("img:not([data-image-viewer-ignore='true'])").forEach((node) => {
        if (
          !(node instanceof HTMLImageElement)
          || node.closest(INTERACTIVE_PARENT_SELECTOR)
          || node.closest(IMAGE_VIEWER_EXCLUDED_SELECTOR)
        ) return;
        if (!node.hasAttribute("tabindex")) node.tabIndex = 0;
        if (!node.hasAttribute("role")) node.setAttribute("role", "button");
        if (!node.hasAttribute("aria-label")) {
          node.setAttribute("aria-label", node.alt.trim() ? `View ${node.alt.trim()}` : "View image");
        }
      });
    };

    const openFromEvent = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key !== "Enter" && event.key !== " ") return;

      const image = getViewedImage(event.target);
      if (!image) return;

      event.preventDefault();
      event.stopPropagation();
      previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
      setViewedImage(image);
    };

    makeStandaloneImagesKeyboardAccessible(document);
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLImageElement) {
            makeStandaloneImagesKeyboardAccessible(node.parentNode ?? document);
          } else if (node instanceof HTMLElement) {
            makeStandaloneImagesKeyboardAccessible(node);
          }
        });
      });
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener("click", openFromEvent, true);
    document.addEventListener("keydown", openFromEvent, true);

    return () => {
      observer.disconnect();
      document.removeEventListener("click", openFromEvent, true);
      document.removeEventListener("keydown", openFromEvent, true);
    };
  }, []);

  useEffect(() => {
    if (!viewedImage) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeViewer();
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocusedRef.current?.focus();
    };
  }, [closeViewer, viewedImage]);

  if (!viewedImage || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={viewedImage.alt ? `Image preview: ${viewedImage.alt}` : "Image preview"}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeViewer();
      }}
    >
      <div className="relative flex h-fit w-fit max-h-full max-w-full items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-white p-1.5 shadow-2xl dark:bg-gray-950 sm:rounded-3xl sm:p-2">
        <img
          src={viewedImage.src}
          alt={viewedImage.alt}
          data-image-viewer-ignore="true"
          className="block h-auto max-h-[calc(100dvh-2.75rem)] w-auto max-w-[calc(100vw-2.25rem)] rounded-xl object-contain sm:max-h-[calc(100dvh-4rem)] sm:max-w-[calc(100vw-4rem)] sm:rounded-2xl"
          decoding="async"
        />
        <button
          ref={closeButtonRef}
          type="button"
          onClick={closeViewer}
          aria-label="Close image preview"
          className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-black/65 text-white shadow-lg backdrop-blur-md transition hover:scale-105 hover:bg-black focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-black/50"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>,
    document.body,
  );
}
