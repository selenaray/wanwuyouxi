// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

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

  it("normalizes common numeric, length and optional-field drift in a PASS result", async () => {
    const drifted = JSON.stringify({
      ...JSON.parse(validResponse),
      logicalConfidence: 96,
      riskLabels: ["a", "b", "c", "d", "e", "f"],
      candidates: ["特别特别长的桌面装饰物", "书本", "杯子", "椅子", "台灯", "花瓶", "电脑", "窗帘", "地毯"],
      game: {
        ...fakePrivateCase,
        title: `${fakePrivateCase.title}这是超出限制的补充标题`,
        caseNumber: 20260719,
        interactionMode: "IMAGE_HOTSPOT",
        clues: fakePrivateCase.clues.map((clue, index) => ({
          ...clue,
          id: index === 0 ? "线索一" : clue.id,
          objectName: `${clue.objectName}特别特别长的名字`,
          x: String((index + 2) * 20),
          y: (index + 3) * 20,
          radius: index === 0 ? undefined : 20,
          confidence: index === 1 ? undefined : 92,
        })),
      },
    });
    const provider = new QwenVisionProvider({
      transport: new CapturingTransport(drifted),
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
    expect(result.logicalConfidence).toBe(0.96);
    expect(result.riskLabels).toHaveLength(5);
    expect(result.candidates).toHaveLength(8);
    expect(result.candidates[0].length).toBeLessThanOrEqual(12);
    expect(result.game.caseNumber).toBe("20260719");
    expect(result.game.clues[0]).toMatchObject({ id: "clue-1", x: 0.4, y: 0.6, radius: 0.08, confidence: 0.92 });
    expect(result.game.clues[1]).toMatchObject({ radius: 0.12, confidence: 0.75 });
  });

  it("accepts a PASS result whose answer choices are single Chinese characters", async () => {
    const response = JSON.stringify({
      ...JSON.parse(validResponse),
      game: { ...fakePrivateCase, answerOptions: ["甲", "乙", "丙"] },
    });
    const provider = new QwenVisionProvider({
      transport: new CapturingTransport(response),
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
  });

  it("logs only schema paths when normalized output remains invalid", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const provider = new QwenVisionProvider({
      transport: new CapturingTransport(JSON.stringify({
        ...JSON.parse(validResponse),
        game: { ...fakePrivateCase, truth: "private-model-content", clues: [] },
      })),
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

    expect(JSON.stringify(log.mock.calls)).toContain("game.clues");
    expect(JSON.stringify(log.mock.calls)).not.toContain("private-model-content");
    log.mockRestore();
  });

  it("rejects unknown interaction modes instead of inventing hotspot confidence", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
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
    log.mockRestore();
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
