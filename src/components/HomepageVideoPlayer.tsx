import { ExternalLink, PlayCircle } from "lucide-react";
import { resolveVideoSource } from "../lib/homepageVideos";

type HomepageVideoPlayerProps = {
  url: string;
  title: string;
  compact?: boolean;
};

export function HomepageVideoPlayer({ url, title, compact = false }: HomepageVideoPlayerProps) {
  const source = resolveVideoSource(url);

  if (!source) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-2xl bg-gray-100 px-6 text-center text-sm text-gray-500 dark:bg-gray-900 dark:text-gray-400">
        Add a valid video link to show the preview.
      </div>
    );
  }

  // Google blocks its Drive and account pages from being framed outside Drive.
  // Public Drive files are therefore played through the native video element.
  if (source.kind === "direct" || source.kind === "drive") {
    return (
      <div className="relative aspect-video w-full min-w-0 overflow-hidden rounded-2xl bg-black">
        <video
          className="block h-full w-full object-contain"
          controls
          preload="metadata"
          playsInline
          src={source.embedUrl}
          aria-label={title}
        >
          <a href={url} target="_blank" rel="noopener noreferrer">Open video</a>
        </video>
      </div>
    );
  }

  return (
    <div className="group relative aspect-video w-full min-w-0 overflow-hidden rounded-2xl bg-black">
      <iframe
        src={source.embedUrl}
        title={title}
        className="h-full w-full border-0"
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
      />
      {source.kind === "generic" && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={`absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-black/80 text-white shadow-lg backdrop-blur-sm transition hover:bg-black ${compact ? "px-2.5 py-1.5 text-[10px]" : "px-3 py-2 text-xs"}`}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open source
        </a>
      )}
      <PlayCircle className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-white/0 transition group-hover:text-white/60" />
    </div>
  );
}
