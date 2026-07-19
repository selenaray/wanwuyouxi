// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

import { V2PrivateCaseSchema } from "@/server/cases/v2-contracts";
import { validObservation, validV2Case } from "@/server/cases/v2-contracts.fixture";

import {
  DeepSeekFactbookCompiler,
  createDeepSeekFactbookCompilerFromEnv,
  semanticV2Case,
} from "./deepseek-compiler";
import type { DeepSeekRequest, DeepSeekTransport } from "./deepseek";
import { ProviderError, type ValidationIssue } from "./types";

class CapturingTransport implements DeepSeekTransport {
  requests: DeepSeekRequest[] = [];

  constructor(private readonly responses: string[]) {}

  async create(request: DeepSeekRequest) {
    this.requests.push(request);
    return { content: this.responses.shift() ?? "{}" };
  }
}

function createCompiler(transport: DeepSeekTransport) {
  return new DeepSeekFactbookCompiler({
    transport,
    model: "deepseek-v4-flash",
    timeoutMs: 30_000,
  });
}

const validGame = V2PrivateCaseSchema.parse(validV2Case);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("DeepSeekFactbookCompiler", () => {
  it("sends only the grounded observation and returns a valid contradiction", async () => {
    const transport = new CapturingTransport([JSON.stringify(validV2Case)]);
    const compiler = createCompiler(transport);

    const compiled = await compiler.compileCase({
      observation: validObservation,
      traceId: "traceId-sessionId-signed://photo",
    });

    const userMessage = transport.requests[0]?.messages[1]?.content;
    const payload = JSON.parse(userMessage ?? "null");
    expect(payload).toEqual({ observation: validObservation });
    expect(JSON.stringify(payload)).not.toContain("signed://");
    expect(JSON.stringify(payload)).not.toContain("sessionId");
    expect(JSON.stringify(payload)).not.toContain("traceId");
    expect(compiled.contradiction).toEqual({
      claimId: "cl-qiao",
      evidenceId: "ev-cup",
      explanation: expect.any(String),
    });
  });

  it("rejects duplicate portrait keys", async () => {
    const duplicatePortraits = {
      ...validV2Case,
      suspects: [
        validV2Case.suspects[0],
        { ...validV2Case.suspects[1], portraitKey: validV2Case.suspects[0].portraitKey },
        validV2Case.suspects[2],
      ],
    };
    const compiler = createCompiler(
      new CapturingTransport([JSON.stringify(duplicatePortraits)]),
    );

    await expect(compiler.compileCase({
      observation: validObservation,
      traceId: "trace",
    })).rejects.toEqual(
      new ProviderError("BAD_OUTPUT", "DEEPSEEK_FACTBOOK_OUTPUT_INVALID"),
    );
  });

  it("sends only the semantic case and issues when repairing mutable copy", async () => {
    const issues: ValidationIssue[] = [{
      code: "COPY_QUALITY",
      field: "wrongAnswerHint",
      message: "提示不够具体",
    }];
    const repairedResponse = {
      ...validGame,
      wrongAnswerHint: "先逐一对照三人的证词，再检查物证痕迹的新旧顺序。",
    };
    const transport = new CapturingTransport([
      JSON.stringify(semanticV2Case(repairedResponse)),
    ]);
    const compiler = createCompiler(transport);

    const repaired = await compiler.repairCase({
      game: validGame,
      issues,
      traceId: "traceId-sessionId-signed://photo",
    });

    const userMessage = transport.requests[0]?.messages[1]?.content;
    const payload = JSON.parse(userMessage ?? "null");
    expect(payload).toEqual({ case: semanticV2Case(validGame), issues });
    expect(JSON.stringify(payload)).not.toMatch(/"(?:x|y|radius)":/);
    expect(JSON.stringify(payload)).not.toContain("imageUrl");
    expect(JSON.stringify(payload)).not.toContain("storageKey");
    expect(JSON.stringify(payload)).not.toContain("sessionId");
    expect(JSON.stringify(payload)).not.toContain("traceId");
    expect(repaired.wrongAnswerHint).toBe(repairedResponse.wrongAnswerHint);
  });

  it.each([
    ["visualFacts", {
      ...validV2Case,
      visualFacts: [
        { ...validV2Case.visualFacts[0], visibleDescription: "灯罩明显朝向另一侧墙面" },
        ...validV2Case.visualFacts.slice(1),
      ],
    }],
    ["evidence id", {
      ...validV2Case,
      evidence: [
        { ...validV2Case.evidence[0], id: "ev-renamed" },
        ...validV2Case.evidence.slice(1),
      ],
    }],
    ["evidence visualFactId", {
      ...validV2Case,
      evidence: [
        { ...validV2Case.evidence[0], visualFactId: "vf-book" },
        ...validV2Case.evidence.slice(1),
      ],
    }],
    ["evidence objectName", {
      ...validV2Case,
      evidence: [
        { ...validV2Case.evidence[0], objectName: "落地灯" },
        ...validV2Case.evidence.slice(1),
      ],
    }],
    ["evidence coordinates", {
      ...validV2Case,
      evidence: [
        { ...validV2Case.evidence[0], x: 0.25 },
        ...validV2Case.evidence.slice(1),
      ],
    }],
    ["evidence suspect mapping", {
      ...validV2Case,
      evidence: [
        { ...validV2Case.evidence[0], suspectId: "su-zhou" },
        ...validV2Case.evidence.slice(1),
      ],
    }],
    ["suspect id", {
      ...validV2Case,
      suspects: [
        { ...validV2Case.suspects[0], id: "su-renamed" },
        ...validV2Case.suspects.slice(1),
      ],
    }],
    ["portrait key", {
      ...validV2Case,
      suspects: [
        { ...validV2Case.suspects[0], portraitKey: "noir-04" },
        ...validV2Case.suspects.slice(1),
      ],
    }],
  ])("rejects repair drift in immutable %s", async (_field, response) => {
    const compiler = createCompiler(
      new CapturingTransport([JSON.stringify(response)]),
    );

    await expect(compiler.repairCase({
      game: validGame,
      issues: [{ code: "NON_UNIQUE", field: "contradiction", message: "不唯一" }],
      traceId: "trace",
    })).rejects.toEqual(
      new ProviderError("BAD_OUTPUT", "DEEPSEEK_FACTBOOK_OUTPUT_INVALID"),
    );
  });

  it("maps malformed JSON to a factbook output error", async () => {
    const compiler = createCompiler(new CapturingTransport(["not-json"]));

    await expect(compiler.compileCase({
      observation: validObservation,
      traceId: "trace",
    })).rejects.toEqual(
      new ProviderError("BAD_OUTPUT", "DEEPSEEK_FACTBOOK_OUTPUT_INVALID"),
    );
  });

  it("constructs the live compiler from the DeepSeek environment", () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");

    expect(createDeepSeekFactbookCompilerFromEnv()).toBeInstanceOf(
      DeepSeekFactbookCompiler,
    );
  });
});
