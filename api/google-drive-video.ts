const MAX_CHUNK_BYTES = 4 * 1024 * 1024;
const DRIVE_ID_PATTERN = /^[A-Za-z0-9_-]{10,200}$/;

const errorResponse = (status: number, message: string, extraHeaders: HeadersInit = {}) =>
  new Response(message, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      ...extraHeaders,
    },
  });

const boundedRange = (value: string | null) => {
  if (!value) return { start: 0, end: MAX_CHUNK_BYTES - 1 };
  const match = value.match(/^bytes=(\d+)-(\d*)$/i);
  if (!match) return null;

  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : start + MAX_CHUNK_BYTES - 1;
  if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(requestedEnd) || requestedEnd < start) {
    return null;
  }

  return { start, end: Math.min(requestedEnd, start + MAX_CHUNK_BYTES - 1) };
};

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const fileId = requestUrl.searchParams.get("id") || "";
  const resourceKey = requestUrl.searchParams.get("resourcekey");
  if (!DRIVE_ID_PATTERN.test(fileId)) return errorResponse(400, "A valid Google Drive file ID is required.");

  const range = boundedRange(request.headers.get("range"));
  if (!range) return errorResponse(416, "Only a single valid byte range is supported.", { "Accept-Ranges": "bytes" });

  const upstreamUrl = new URL("https://drive.usercontent.google.com/download");
  upstreamUrl.searchParams.set("export", "download");
  upstreamUrl.searchParams.set("id", fileId);
  upstreamUrl.searchParams.set("confirm", "t");
  if (resourceKey) upstreamUrl.searchParams.set("resourcekey", resourceKey);

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      headers: { Range: `bytes=${range.start}-${range.end}` },
      redirect: "follow",
    });
  } catch {
    return errorResponse(502, "The video source is temporarily unavailable.");
  }

  const contentType = upstream.headers.get("content-type") || "";
  const contentRange = upstream.headers.get("content-range");
  if (upstream.status !== 206 || !contentType.toLowerCase().startsWith("video/") || !contentRange) {
    await upstream.body?.cancel();
    return errorResponse(
      upstream.status === 403 || upstream.status === 404 ? 404 : 502,
      "Google Drive did not return a public streamable video.",
    );
  }

  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=3600, s-maxage=86400",
    "Content-Range": contentRange,
    "Content-Type": contentType,
  });
  const contentLength = upstream.headers.get("content-length");
  const lastModified = upstream.headers.get("last-modified");
  if (contentLength) headers.set("Content-Length", contentLength);
  if (lastModified) headers.set("Last-Modified", lastModified);

  return new Response(upstream.body, { status: 206, headers });
}

