import { afterEach, describe, expect, test, vi } from "vitest";
import { GET } from "../../api/google-drive-video";

const fileId = "1JPznGJaz11iudbag3giopLMejTN2pBX_";

const mockDriveResponse = () => new Response(new Uint8Array([0, 1, 2]), {
  status: 206,
  headers: {
    "Content-Length": "3",
    "Content-Range": "bytes 0-2/3",
    "Content-Type": "video/mp4",
  },
});

afterEach(() => vi.unstubAllGlobals());

describe("Google Drive video range proxy", () => {
  test("forces a bounded initial range when Chrome omits one", async () => {
    const upstreamFetch = vi.fn().mockResolvedValue(mockDriveResponse());
    vi.stubGlobal("fetch", upstreamFetch);

    const response = await GET(new Request(`https://perktoday.com/api/google-drive-video?id=${fileId}`));

    expect(response.status).toBe(206);
    expect(upstreamFetch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ headers: { Range: "bytes=0-4194303" } }),
    );
  });

  test("caps an open-ended browser range to four MiB", async () => {
    const upstreamFetch = vi.fn().mockResolvedValue(mockDriveResponse());
    vi.stubGlobal("fetch", upstreamFetch);
    const request = new Request(`https://perktoday.com/api/google-drive-video?id=${fileId}`, {
      headers: { Range: "bytes=4194304-" },
    });

    await GET(request);

    expect(upstreamFetch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ headers: { Range: "bytes=4194304-8388607" } }),
    );
  });

  test("rejects multiple ranges instead of forwarding them", async () => {
    const upstreamFetch = vi.fn();
    vi.stubGlobal("fetch", upstreamFetch);
    const request = new Request(`https://perktoday.com/api/google-drive-video?id=${fileId}`, {
      headers: { Range: "bytes=0-1,4-5" },
    });

    const response = await GET(request);

    expect(response.status).toBe(416);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  test("rejects Google's HTML confirmation page", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("confirm", {
      status: 200,
      headers: { "Content-Type": "text/html" },
    })));

    const response = await GET(new Request(`https://perktoday.com/api/google-drive-video?id=${fileId}`));

    expect(response.status).toBe(502);
    expect(await response.text()).toContain("did not return a public streamable video");
  });
});
