import { useEffect, useState } from "react";
import { ExternalLink, PlayCircle } from "lucide-react";
import { resolveVideoSource } from "../lib/homepageVideos";

type HomepageVideoPlayerProps = {
  url: string;
  title: string;
  compact?: boolean;
  edgeToEdge?: boolean;
};

export function HomepageVideoPlayer({ url, title, compact = false, edgeToEdge = false }: HomepageVideoPlayerProps) {
  const source = resolveVideoSource(url);
  const [youtubeActive, setYoutubeActive] = useState(false);
  const frameClassName = `relative aspect-video w-full min-w-0 overflow-hidden bg-black ${edgeToEdge ? "rounded-none" : "rounded-2xl"}`;

  useEffect(() => {
    setYoutubeActive(false);
  }, [source?.embedUrl]);

  if (!source) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-2xl bg-gray-100 px-6 text-center text-sm text-gray-500 dark:bg-gray-900 dark:text-gray-400">
        Add a valid video link to show the preview.
      </div>
    );
  }

  if (source.kind === "direct") {
    return (
      <div className={frameClassName}>
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

  if (source.kind === "youtube" && !youtubeActive) {
    return (
      <div className={`group ${frameClassName}`}>
        <button
          type="button"
          onClick={() => setYoutubeActive(true)}
          className="absolute inset-0 block h-full w-full cursor-pointer overflow-hidden bg-black focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/90 focus-visible:ring-inset"
          aria-label={`Play ${title}`}
        >
          <img
            src={source.posterUrl}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            fetchPriority="low"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.015] group-hover:opacity-90 motion-reduce:transition-none"
          />
          <span className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-black/10" aria-hidden="true" />
          <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/80 text-white shadow-xl backdrop-blur-sm transition group-hover:scale-105 group-hover:bg-black motion-reduce:transition-none">
              <PlayCircle className="h-10 w-10" strokeWidth={1.8} />
            </span>
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className={`group ${frameClassName}`}>
      <iframe
        src={source.kind === "youtube" ? `${source.embedUrl}&autoplay=1` : source.embedUrl}
        title={title}
        className="h-full w-full border-0"
        loading={source.kind === "youtube" ? "eager" : "lazy"}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox={source.kind === "drive" ? undefined : "allow-scripts allow-same-origin allow-presentation allow-popups"}
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
