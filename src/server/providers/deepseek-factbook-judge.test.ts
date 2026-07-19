// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

import { V2PrivateCaseSchema } from "@/server/cases/v2-contracts";
import { validV2Case } from "@/server/cases/v2-contracts.fixture";

import type { DeepSeekRequest, DeepSeekTransport } from "./deepseek";
import { semanticV2Case } from "./deepseek-compiler";
import {
  DeepSeekFactbookJudge,
  createDeepSeekFactbookJudgeFromEnv,
} from "./deepseek-factbook-judge";
import { ProviderError } from "./types";

class CapturingTransport implements DeepSeekTransport {
  requests: DeepSeekRequest[] = [];

  constructor(private readonly responses: string[]) {}

  async create(request: DeepSeekRequest) {
    this.requests.push(request);
    return { content: this.responses.shift() ?? "{}" };
  }
}

function createJudge(transport: DeepSeekTransport) {
  return new DeepSeekFactbookJudge({
    transport,
    model: "deepseek-v4-flash",
    timeoutMs: 30_000,
  });
}

const validGame = V2PrivateCaseSchema.parse(validV2Case);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("DeepSeekFactbookJudge", () => {
  it("preserves an invalid uniqueness verdict and sends only the semantic case", async () => {
    const verdict = {
      valid: false,
      confidence: 0.96,
      issues: [{
        code: "NON_UNIQUE",
        field: "contradiction",
        message: "两组人物与物证都能成立",
      }],
    };
    const transport = new CapturingTransport([JSON.stringify(verdict)]);
    const judge = createJudge(transport);

    const result = await judge.validateCase({
      game: validGame,
      traceId: "traceId-sessionId-signed://photo",
    });

    const userMessage = transport.requests[0]?.messages[1]?.content;
    const payload = JSON.parse(userMessage ?? "null");
    expect(result).toEqual(verdict);
    expect(payload).toEqual({ case: semanticV2Case(validGame) });
    expect(JSON.stringify(payload)).not.toMatch(/"(?:x|y|radius)":/);
    expect(JSON.stringify(payload)).not.toContain("imageUrl");
    expect(JSON.stringify(payload)).not.toContain("storageKey");
    expect(JSON.stringify(payload)).not.toContain("sessionId");
    expect(JSON.stringify(payload)).not.toContain("traceId");
  });

  it.each([
    ["malformed JSON", "not-json"],
    ["out-of-range confidence", JSON.stringify({ valid: true, confidence: 1.01, issues: [] })],
  ])("maps %s to a judge output error", async (_description, response) => {
    const judge = createJudge(new CapturingTransport([response]));

    await expect(judge.validateCase({
      game: validGame,
      traceId: "trace",
    })).rejects.toEqual(
      new ProviderError("BAD_OUTPUT", "DEEPSEEK_FACTBOOK_JUDGE_OUTPUT_INVALID"),
    );
  });

  it("constructs the live judge from the DeepSeek environment", () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");

    expect(createDeepSeekFactbookJudgeFromEnv()).toBeInstanceOf(
      DeepSeekFactbookJudge,
    );
  });
});
