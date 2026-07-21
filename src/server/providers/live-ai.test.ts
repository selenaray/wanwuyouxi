// @vitest-environment node

import { readFile } from "node:fs/promises";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { fakePrivateCase } from "./fake";
import { createDeepSeekCaseJudgeFromEnv } from "./deepseek";
import { createQwenVisionProviderFromEnv } from "./qwen";

const liveQwen = process.env.RUN_LIVE_AI_TESTS === "1" && Boolean(process.env.QWEN_API_KEY);
const liveDeepSeek = process.env.RUN_LIVE_AI_TESTS === "1" && Boolean(process.env.DEEPSEEK_API_KEY);

describe.skipIf(!liveQwen)("live Qwen contract", () => {
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

describe.skipIf(!liveDeepSeek)("live DeepSeek contract", () => {
  it("returns a schema-valid semantic judgment without receiving an image", async () => {
    const result = await createDeepSeekCaseJudgeFromEnv().validateCase({
      game: fakePrivateCase,
      visibleObjectNames: fakePrivateCase.clues.map((clue) => clue.objectName),
      traceId: crypto.randomUUID(),
    });

    expect(typeof result.valid).toBe("boolean");
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  }, 45_000);
});
