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
      max_tokens: 4096,
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

  it("repairs known non-semantic contract drift before validation", async () => {
    const driftedResponse = JSON.stringify({
      decision: "PASS",
      logicalConfidence: 0.96,
      riskLabels: [],
      candidates: ["台灯", "书本", "杯子"],
      game: {
        ...fakePrivateCase,
        interactionMode: "IMAGE_HOTSPOT",
        clues: fakePrivateCase.clues.map((clue) =>
          Object.fromEntries(Object.entries(clue).filter(([key]) => key !== "id")),
        ),
        answerOptions: ["选项一", "选项二", "选项三", "正确选项"],
        correctAnswerIndex: 3,
      },
    });
    const provider = new QwenVisionProvider({
      transport: new CapturingTransport(driftedResponse),
      model: "qwen3-vl-plus",
      timeoutMs: 30_000,
    });

    const result = await provider.generateCase({
      imageUrl: "data:image/jpeg;base64,/9j/",
      imageWidth: 1200,
      imageHeight: 900,
      locale: "zh-CN",
      traceId: "trace",
    });

    expect(result.decision).toBe("PASS");
    if (result.decision !== "PASS") throw new Error("expected PASS result");
    expect(result.game.interactionMode).toBe("HOTSPOT");
    expect(result.game.clues.map((clue) => clue.id)).toEqual(["clue-1", "clue-2", "clue-3"]);
    expect(result.game.answerOptions).toEqual(["选项一", "选项二", "正确选项"]);
    expect(result.game.correctAnswerIndex).toBe(2);
  });

  it("extracts candidate names when the model returns candidate objects", async () => {
    const objectCandidates = JSON.stringify({
      ...JSON.parse(validResponse),
      candidates: [
        { objectName: "台灯", confidence: 0.95 },
        { name: "书本", confidence: 0.9 },
        { label: "杯子", confidence: 0.88 },
      ],
    });
    const provider = new QwenVisionProvider({
      transport: new CapturingTransport(objectCandidates),
      model: "qwen3-vl-plus",
      timeoutMs: 30_000,
    });

    const result = await provider.generateCase({
      imageUrl: "data:image/jpeg;base64,/9j/",
      imageWidth: 1200,
      imageHeight: 900,
      locale: "zh-CN",
      traceId: "trace",
    });

    expect(result.candidates).toEqual(["台灯", "书本", "杯子"]);
  });

  it("rejects unknown interaction modes instead of inventing hotspot confidence", async () => {
    const unknownMode = JSON.stringify({
      ...JSON.parse(validResponse),
      game: { ...fakePrivateCase, interactionMode: "UNKNOWN_MODE" },
    });
    const provider = new QwenVisionProvider({
      transport: new CapturingTransport(unknownMode),
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

  it("states machine-checkable enum, id and tuple constraints in the prompt", async () => {
    const transport = new CapturingTransport(validResponse);
    const provider = new QwenVisionProvider({ transport, model: "qwen3-vl-plus", timeoutMs: 30_000 });

    await provider.generateCase({
      imageUrl: "data:image/jpeg;base64,/9j/",
      imageWidth: 1200,
      imageHeight: 900,
      locale: "zh-CN",
      traceId: "trace",
    });

    const systemPrompt = String(transport.lastRequest?.messages[0]?.content ?? "");
    expect(systemPrompt).toContain("interactionMode 只能是 HOTSPOT 或 CARD_FALLBACK");
    expect(systemPrompt).toContain("clue.id 必须是字符串");
    expect(systemPrompt).toContain("answerOptions 必须恰好包含 3 项");
    expect(systemPrompt).toContain("candidates 必须是字符串数组");
  });
});
