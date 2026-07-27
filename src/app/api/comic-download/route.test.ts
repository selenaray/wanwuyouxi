// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

describe("POST /api/comic-download", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns an OSS comic as a downloadable attachment", async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), {
      headers: { "content-type": "image/png" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(new Request("http://test/api/comic-download", {
      method: "POST",
      body: JSON.stringify({
        imageUrl: "https://dashscope-7c2c.oss-accelerate.aliyuncs.com/comic.png?Signature=test#comic-render",
      }),
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="wanwuyouxi-comic.png"');
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://dashscope-7c2c.oss-accelerate.aliyuncs.com/comic.png?Signature=test"),
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("rejects URLs outside the DashScope OSS hosts", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(new Request("http://test/api/comic-download", {
      method: "POST",
      body: JSON.stringify({ imageUrl: "https://example.com/comic.png" }),
    }));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
