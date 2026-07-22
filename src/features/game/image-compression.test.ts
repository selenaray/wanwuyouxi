import { afterEach, describe, expect, it, vi } from "vitest";

import { calculateResizeDimensions, prepareImageForUpload, shouldUseServerHeicFallback } from "./image-compression";

describe("image upload preparation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("caps the longest edge at 1600 while preserving aspect ratio", () => {
    expect(calculateResizeDimensions(2400, 1800)).toEqual({ width: 1600, height: 1200 });
    expect(calculateResizeDimensions(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("allows only small HEIC files to fall back to server conversion", () => {
    expect(shouldUseServerHeicFallback(new File([new Uint8Array(100)], "room.heic", { type: "image/heic" }))).toBe(true);
    expect(shouldUseServerHeicFallback(new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.heic", { type: "image/heic" }))).toBe(false);
  });

  it("compresses large browser-decodable photos before enforcing the upload byte limit", async () => {
    const bitmap = { width: 4032, height: 3024, close: vi.fn() } as unknown as ImageBitmap;
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
    const toBlob = vi.fn((callback: BlobCallback) => {
      callback(new Blob([new Uint8Array(420_000)], { type: "image/jpeg" }));
    });
    vi.spyOn(document, "createElement").mockReturnValue({
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: vi.fn() }),
      toBlob,
    } as unknown as HTMLCanvasElement);

    const result = await prepareImageForUpload(new File(
      [new Uint8Array(8 * 1024 * 1024)],
      "room.png",
      { type: "image/png" },
    ));

    expect(result).toMatchObject({ name: "room.jpg", type: "image/jpeg" });
    expect(result.size).toBeLessThan(5 * 1024 * 1024);
    expect(bitmap.close).toHaveBeenCalled();
  });
});
