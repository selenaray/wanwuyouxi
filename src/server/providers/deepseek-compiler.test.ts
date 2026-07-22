// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

import { V2PrivateCaseSchema } from "@/server/cases/v2-contracts";
import { validObservation, validV2Case } from "@/server/cases/v2-contracts.fixture";
import { SUSPECT_ROSTER } from "@/features/game/suspect-roster";

import {
  DeepSeekFactbookCompiler,
  createDeepSeekFactbookCompilerFromEnv,
  semanticV2Case,
} from "./deepseek-compiler";
import type { DeepSeekRequest, DeepSeekTransport } from "./deepseek";
import {
  DEEPSEEK_COMPILER_SYSTEM_PROMPT,
  DEEPSEEK_FACTBOOK_REPAIR_SYSTEM_PROMPT,
} from "./prompts/deepseek-compiler-system";
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
    expect(payload).toEqual({ observation: validObservation, suspectRoster: SUSPECT_ROSTER });
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
    expect(JSON.stringify(payload)).not.toContain("privateAction");
    expect(JSON.stringify(payload)).not.toContain("allowedFactIds");
    expect(repaired.wrongAnswerHint).toBe(repairedResponse.wrongAnswerHint);
  });

  it("documents the complete V2 output shape in compiler and repair prompts", () => {
    const requiredKeys = [
      "version", "title", "caseNumber", "background", "objective", "interactionMode",
      "visualFacts", "evidence", "suspects", "timelineFacts", "claims", "liarSuspectId",
      "contradiction", "wrongAnswerHint", "truth", "id", "objectName",
      "visibleDescription", "regionHint", "x", "y", "radius", "confidence",
      "visualFactId", "suspectId", "publicDescription", "name", "identity", "relation",
      "gender", "age", "personalityTags", "portraitKey", "initialTestimony", "privateAction",
      "allowedFactIds", "timeLabel", "text", "factRefs", "evidenceRefs", "claimId",
      "evidenceId", "explanation", "summary", "motive", "evidenceChain",
    ];

    for (const key of requiredKeys) {
      expect(DEEPSEEK_COMPILER_SYSTEM_PROMPT).toContain(`"${key}"`);
      expect(DEEPSEEK_FACTBOOK_REPAIR_SYSTEM_PROMPT).toContain(`"${key}"`);
    }
    expect(DEEPSEEK_COMPILER_SYSTEM_PROMPT).toContain('"interactionMode": "HOTSPOT" | "CARD_FALLBACK"');
    expect(DEEPSEEK_COMPILER_SYSTEM_PROMPT).toContain("suspectRoster");
    expect(DEEPSEEK_COMPILER_SYSTEM_PROMPT).toContain("恰好 3 项");
    expect(DEEPSEEK_COMPILER_SYSTEM_PROMPT).toContain("number(0..1)");
    expect(DEEPSEEK_COMPILER_SYSTEM_PROMPT).toContain("number(0.04..0.12)");
    expect(DEEPSEEK_COMPILER_SYSTEM_PROMPT).not.toContain("坐标之外的定位数据");
    expect(DEEPSEEK_FACTBOOK_REPAIR_SYSTEM_PROMPT).toContain("timelineFacts/claims 的 id");
  });

  it.each([
    ["duplicate timeline ids", {
      ...validV2Case,
      timelineFacts: [
        validV2Case.timelineFacts[0],
        { ...validV2Case.timelineFacts[1], id: validV2Case.timelineFacts[0].id },
        validV2Case.timelineFacts[2],
      ],
      claims: [
        validV2Case.claims[0],
        { ...validV2Case.claims[1], factRefs: [validV2Case.timelineFacts[0].id] },
        validV2Case.claims[2],
      ],
      suspects: [
        validV2Case.suspects[0],
        {
          ...validV2Case.suspects[1],
          allowedFactIds: [validV2Case.timelineFacts[0].id, validV2Case.claims[1].id],
        },
        validV2Case.suspects[2],
      ],
    }],
    ["dangling allowed fact ids", {
      ...validV2Case,
      suspects: [
        { ...validV2Case.suspects[0], allowedFactIds: ["tf-missing"] },
        ...validV2Case.suspects.slice(1),
      ],
    }],
  ])("rejects compiler output with %s", async (_description, response) => {
    const compiler = createCompiler(
      new CapturingTransport([JSON.stringify(response)]),
    );

    await expect(compiler.compileCase({
      observation: validObservation,
      traceId: "trace",
    })).rejects.toEqual(
      new ProviderError("BAD_OUTPUT", "DEEPSEEK_FACTBOOK_OUTPUT_INVALID"),
    );
  });

  it.each([
    ["timeline id", {
      ...validV2Case,
      timelineFacts: [
        { ...validV2Case.timelineFacts[0], id: "tf-new" },
        ...validV2Case.timelineFacts.slice(1),
      ],
      claims: [
        { ...validV2Case.claims[0], factRefs: ["tf-new"] },
        ...validV2Case.claims.slice(1),
      ],
      suspects: [
        { ...validV2Case.suspects[0], allowedFactIds: ["tf-new", "cl-lin"] },
        ...validV2Case.suspects.slice(1),
      ],
    }],
    ["claim id", {
      ...validV2Case,
      claims: [
        { ...validV2Case.claims[0], id: "cl-new" },
        ...validV2Case.claims.slice(1),
      ],
    }],
    ["stale allowed fact reference", {
      ...validV2Case,
      timelineFacts: [
        { ...validV2Case.timelineFacts[0], id: "tf-new" },
        ...validV2Case.timelineFacts.slice(1),
      ],
      claims: [
        { ...validV2Case.claims[0], factRefs: ["tf-new"] },
        ...validV2Case.claims.slice(1),
      ],
    }],
  ])("rejects repair drift in immutable %s", async (_description, response) => {
    const compiler = createCompiler(
      new CapturingTransport([JSON.stringify(response)]),
    );

    await expect(compiler.repairCase({
      game: validGame,
      issues: [{ code: "COPY_QUALITY", field: "claims", message: "文案需修复" }],
      traceId: "trace",
    })).rejects.toEqual(
      new ProviderError("BAD_OUTPUT", "DEEPSEEK_FACTBOOK_OUTPUT_INVALID"),
    );
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
        { ...validV2Case.evidence[0], suspectId: "su-lin" },
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

  it("uses a longer default timeout when the live timeout env is missing or empty", () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    vi.stubEnv("GENERATION_TIMEOUT_MS", "");

    const compiler = createDeepSeekFactbookCompilerFromEnv();

    expect((compiler as unknown as { options: { timeoutMs: number } }).options.timeoutMs).toBe(75_000);
  });
});
