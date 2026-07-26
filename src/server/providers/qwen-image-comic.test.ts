// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import {
  createQwenImageComicProviderFromEnv,
  QwenImageComicProvider,
  resolveDashScopeImageApiUrl,
  type QwenImageRequest,
  type QwenImageTransport,
} from "./qwen-image-comic";

class CapturingTransport implements QwenImageTransport {
  request: QwenImageRequest | null = null;

  async create(request: QwenImageRequest) {
    this.request = request;
    return {
      output: {
        choices: [{
          message: {
            content: [{ image: "https://example.com/comic.png" }],
          },
        }],
      },
      usage: { width: 2048, height: 2048, image_count: 1 },
    };
  }
}

describe("QwenImageComicProvider", () => {
  it("requests one square 2x2 comic image and parses the returned URL", async () => {
    const transport = new CapturingTransport();
    const provider = new QwenImageComicProvider({
      transport,
      model: "qwen-image-2.0-pro",
      size: "2048*2048",
      timeoutMs: 75_000,
    });

    const result = await provider.generate({ prompt: "生成四格漫画" });

    expect(result).toEqual({ imageUrl: "https://example.com/comic.png", width: 2048, height: 2048 });
    expect(transport.request).toMatchObject({
      model: "qwen-image-2.0-pro",
      input: {
        messages: [{ role: "user", content: [{ text: "生成四格漫画" }] }],
      },
      parameters: {
        n: 1,
        prompt_extend: false,
        size: "2048*2048",
        watermark: false,
      },
    });
  });

  it("sends reference character images before the text prompt", async () => {
    const transport = new CapturingTransport();
    const provider = new QwenImageComicProvider({
      transport,
      model: "qwen-image-2.0-pro",
      size: "2048*2048",
      timeoutMs: 75_000,
    });

    await provider.generate({
      prompt: "Create a four-panel comic using Image 1 as the culprit.",
      referenceImages: ["data:image/webp;base64,AAAA"],
    });

    expect(transport.request?.input.messages[0].content).toEqual([
      { image: "data:image/webp;base64,AAAA" },
      { text: "Create a four-panel comic using Image 1 as the culprit." },
    ]);
  });

  it("constructs the live provider from DashScope image environment", () => {
    vi.stubEnv("DASHSCOPE_API_KEY", "test-key");
    vi.stubEnv("DASHSCOPE_IMAGE_API_URL", "https://example.com/api");

    expect(createQwenImageComicProviderFromEnv()).toBeInstanceOf(QwenImageComicProvider);

    vi.unstubAllEnvs();
  });

  it("derives the workspace image endpoint from a new DashScope sk-ws key", () => {
    expect(resolveDashScopeImageApiUrl({
      apiKey: "sk-ws-H.ABC123.xyz.fake",
    })).toBe("https://abc123.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation");
  });
});
