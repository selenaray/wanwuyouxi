// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

import { toV2PlayerCase, V2PrivateCaseSchema } from "@/server/cases/v2-contracts";
import { validV2Case } from "@/server/cases/v2-contracts.fixture";
import { ProviderError } from "@/server/providers/types";

const generateMock = vi.fn(async () => ({
  imageUrl: "https://example.com/case-comic.png",
  width: 2048,
  height: 2048,
}));

vi.mock("@/server/providers", () => ({
  createQwenImageComicProviderFromEnv: vi.fn(() => ({
    generate: generateMock,
  })),
}));

const playerCase = toV2PlayerCase(V2PrivateCaseSchema.parse(validV2Case));

describe("POST /api/comic-generation", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("generates a 2x2 comic from a solved case", async () => {
    const { POST } = await import("./route");

    const response = await POST(new Request("http://test/api/comic-generation", {
      method: "POST",
      body: JSON.stringify({
        game: playerCase,
        truth: "江野移动杯子取走钥匙后又将其放回。",
        correctAnswerIndex: 2,
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.traceId).toEqual(expect.any(String));
    expect(body.data.imageUrl).toMatch(/^https:\/\/example\.com\/case-comic\.png#comic-/);
    expect(body.data.width).toBe(2048);
    expect(body.data.height).toBe(2048);
    expect(body.data.panels.map((panel: { title: string }) => panel.title)).toEqual([
      "案发前",
      "关键动作",
      "伪装现场",
      "真相揭晓",
    ]);
    expect(generateMock.mock.calls[0]?.[0].prompt).toContain("生成变体种子：");
    expect(generateMock.mock.calls[0]?.[0].prompt).toContain("分镜构图：");
    expect(generateMock.mock.calls[0]?.[0].prompt).toContain("Image 1 是本案嫌疑人的唯一角色参考");
    expect(generateMock.mock.calls[0]?.[0].prompt).toContain("本案真正发生变化的物证：杯子");
    expect(generateMock.mock.calls[0]?.[0].prompt).toContain("严禁画钥匙、钥匙串、金属钥匙");
    expect(generateMock.mock.calls[0]?.[0].prompt).not.toContain("key object");
    expect(generateMock.mock.calls[0]?.[0].referenceImages[0]).toBe("http://test/portraits/noir-09.webp");
    expect(body.data.debugPrompt).toContain("本案真正发生变化的物证：杯子");
    expect(body.data.referencePortraitKey).toBe("noir-09");
  });

  it("rejects invalid payloads before calling image generation", async () => {
    const { createQwenImageComicProviderFromEnv } = await import("@/server/providers");
    const { POST } = await import("./route");

    const response = await POST(new Request("http://test/api/comic-generation", {
      method: "POST",
      body: JSON.stringify({ truth: "" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("INVALID_COMIC_INPUT");
    expect(createQwenImageComicProviderFromEnv).not.toHaveBeenCalled();
  });

  it("degrades to the bundled comic image when Qwen image auth is unavailable", async () => {
    generateMock.mockRejectedValueOnce(new ProviderError("AUTH_FAILED", "QWEN_IMAGE_AUTH_FAILED"));
    const { POST } = await import("./route");

    const response = await POST(new Request("http://test/api/comic-generation", {
      method: "POST",
      body: JSON.stringify({
        game: playerCase,
        truth: "江野移动杯子取走钥匙后又将其放回。",
        correctAnswerIndex: 2,
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.degraded).toBe(true);
    expect(body.data.imageUrl).toMatch(/^\/intro-assets\/comic-recap\.png#comic-/);
  });
});
