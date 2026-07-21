// @vitest-environment node

import { describe, expect, it } from "vitest";

import { fakePrivateCase } from "./fake";
import { DeepSeekCaseJudge, type DeepSeekRequest, type DeepSeekTransport } from "./deepseek";

class CapturingTransport implements DeepSeekTransport {
  requests: DeepSeekRequest[] = [];

  constructor(private readonly responses: string[]) {}

  async create(request: DeepSeekRequest) {
    this.requests.push(request);
    return { content: this.responses.shift() ?? "{}" };
  }
}

describe("DeepSeekCaseJudge", () => {
  it("sends only semantic case content without image or internal metadata", async () => {
    const transport = new CapturingTransport([
      JSON.stringify({ valid: true, confidence: 0.96, issues: [] }),
    ]);
    const judge = new DeepSeekCaseJudge({ transport, model: "deepseek-v4-flash", timeoutMs: 30_000 });

    const result = await judge.validateCase({
      game: fakePrivateCase,
      visibleObjectNames: ["台灯", "书本", "杯子"],
      traceId: "internal-trace-id",
    });

    const payload = JSON.stringify(transport.requests[0]);
    expect(result.valid).toBe(true);
    expect(payload).toContain(fakePrivateCase.title);
    expect(payload).not.toMatch(/https?:\/\//);
    expect(payload).not.toContain("storageKey");
    expect(payload).not.toContain("internal-trace-id");
    expect(payload).not.toContain('"x"');
    expect(payload).not.toContain('"correctAnswerIndex"');
  });

  it("returns one schema-valid targeted repair", async () => {
    const repaired = { ...fakePrivateCase, wrongAnswerHint: "比较三处痕迹覆盖灰尘的先后顺序。" };
    const transport = new CapturingTransport([
      JSON.stringify({ changes: { wrongAnswerHint: repaired.wrongAnswerHint } }),
    ]);
    const judge = new DeepSeekCaseJudge({ transport, model: "deepseek-v4-flash", timeoutMs: 30_000 });

    const result = await judge.repairCase({
      game: fakePrivateCase,
      issues: [{ code: "COPY_QUALITY", field: "wrongAnswerHint", message: "提示不够具体" }],
      traceId: "trace",
    });

    expect(result.wrongAnswerHint).toBe(repaired.wrongAnswerHint);
  });

  it("accepts a targeted repair with single-character answer choices", async () => {
    const judge = new DeepSeekCaseJudge({
      transport: new CapturingTransport([
        JSON.stringify({ changes: { answerOptions: ["甲", "乙", "丙"] } }),
      ]),
      model: "deepseek-v4-flash",
      timeoutMs: 30_000,
    });

    const repaired = await judge.repairCase({
      game: fakePrivateCase,
      issues: [{ code: "COPY_QUALITY", field: "answerOptions", message: "short choices" }],
      traceId: "trace",
    });

    expect(repaired.answerOptions).toEqual(["甲", "乙", "丙"]);
  });
});
