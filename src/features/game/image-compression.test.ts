import { describe, expect, it } from "vitest";

import { calculateResizeDimensions, shouldUseServerHeicFallback } from "./image-compression";

describe("image upload preparation", () => {
  it("caps the longest edge at 1600 while preserving aspect ratio", () => {
    expect(calculateResizeDimensions(2400, 1800)).toEqual({ width: 1600, height: 1200 });
    expect(calculateResizeDimensions(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("allows only small HEIC files to fall back to server conversion", () => {
    expect(shouldUseServerHeicFallback(new File([new Uint8Array(100)], "room.heic", { type: "image/heic" }))).toBe(true);
    expect(shouldUseServerHeicFallback(new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.heic", { type: "image/heic" }))).toBe(false);
  });
});

