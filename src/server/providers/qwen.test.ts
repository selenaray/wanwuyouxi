// @vitest-environment node

import { describe, expect, it } from "vitest";

import { fakePrivateCase } from "./fake";
import { ProviderError } from "./types";
import { QwenVisionProvider, type QwenRequest, type QwenTransport } from "./qwen";

class CapturingTransport implements QwenTransport {
  lastRequest: QwenRequest | null = null;

  constructor(private readonly content: string) {}

  async create(request: QwenRequest) {
    this.lastRequest = request;
    return { content: this.content };
  }
}

const validResponse = JSON.stringify({
  decision: "PASS",
  logicalConfidence: 0.96,
  riskLabels: [],
  candidates: ["台灯", "书本", "杯子"],
  game: fakePrivateCase,
});

describe("QwenVisionProvider", () => {
  it("requests non-thinking structured output from qwen3-vl-plus", async () => {
    const transport = new CapturingTransport(validResponse);
    const provider = new QwenVisionProvider({ transport, model: "qwen3-vl-plus", timeoutMs: 30_000 });

    const result = await provider.generateCase({
      imageUrl: "data:image/jpeg;base64,/9j/",
      imageWidth: 1200,
      imageHeight: 900,
      locale: "zh-CN",
      traceId: "internal-trace",
    });

    expect(result.decision).toBe("PASS");
    expect(transport.lastRequest).toMatchObject({
      model: "qwen3-vl-plus",
      enable_thinking: false,
      response_format: { type: "json_object" },
    });
    const serialized = JSON.stringify(transport.lastRequest);
    expect(serialized).toContain("data:image/jpeg;base64,/9j/");
    expect(serialized).not.toContain("internal-trace");
    expect(serialized).not.toContain("IMG_1234.jpg");
  });

  it("maps malformed model output to a sanitized provider error", async () => {
    const provider = new QwenVisionProvider({
      transport: new CapturingTransport("not-json"),
      model: "qwen3-vl-plus",
      timeoutMs: 30_000,
    });

    await expect(provider.generateCase({
      imageUrl: "data:image/jpeg;base64,/9j/",
      imageWidth: 1200,
      imageHeight: 900,
      locale: "zh-CN",
      traceId: "trace",
    })).rejects.toMatchObject<Partial<ProviderError>>({ code: "BAD_OUTPUT" });
  });
});

