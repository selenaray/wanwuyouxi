// @vitest-environment node

import { readFile } from "node:fs/promises";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { createQwenVisionProviderFromEnv } from "./qwen";

const live = process.env.RUN_LIVE_AI_TESTS === "1" && Boolean(process.env.QWEN_API_KEY);

describe.skipIf(!live)("live Qwen contract", () => {
  it("returns a schema-valid decision without printing content", async () => {
    const svg = await readFile("public/sample-room.svg");
    const jpeg = await sharp(svg).jpeg({ quality: 80 }).toBuffer();
    const result = await createQwenVisionProviderFromEnv().generateCase({
      imageUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
      imageWidth: 1200,
      imageHeight: 900,
      locale: "zh-CN",
      traceId: crypto.randomUUID(),
    });
    expect(["PASS", "RETRY", "BLOCK"]).toContain(result.decision);
  }, 45_000);
});

