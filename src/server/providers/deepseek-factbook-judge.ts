import { z } from "zod";

import type { V2PrivateCase } from "@/server/cases/v2-contracts";

import type { DeepSeekRequest, DeepSeekTransport } from "./deepseek";
import {
  createDeepSeekFactbookTransportFromEnv,
  semanticV2Case,
} from "./deepseek-compiler";
import { DEEPSEEK_FACTBOOK_JUDGE_SYSTEM_PROMPT } from "./prompts/deepseek-factbook-judge-system";
import {
  ProviderError,
  type CaseFactbookJudge,
  type SemanticValidation,
} from "./types";

const ValidationIssueSchema = z.object({
  code: z.enum(["NON_UNIQUE", "CONTRADICTION", "OUTSIDE_EVIDENCE", "UNSAFE", "COPY_QUALITY"]),
  field: z.string().trim().min(1).max(80),
  message: z.string().trim().min(1).max(120),
}).strict();

const SemanticValidationSchema = z.discriminatedUnion("valid", [
  z.object({
    valid: z.literal(true),
    confidence: z.number().min(0).max(1),
    issues: z.array(ValidationIssueSchema).length(0),
  }).strict(),
  z.object({
    valid: z.literal(false),
    confidence: z.number().min(0).max(1),
    issues: z.array(ValidationIssueSchema).min(1).max(8),
  }).strict(),
]);

type JudgeOptions = {
  transport: DeepSeekTransport;
  model: string;
  timeoutMs: number;
};

export function publicSemanticV2Case(game: V2PrivateCase) {
  const semanticCase = semanticV2Case(game);
  return {
    ...semanticCase,
    suspects: game.suspects.map((suspect) => ({
      id: suspect.id,
      name: suspect.name,
      identity: suspect.identity,
      relation: suspect.relation,
      personalityTags: suspect.personalityTags,
      portraitKey: suspect.portraitKey,
      initialTestimony: suspect.initialTestimony,
    })),
  };
}

export class DeepSeekFactbookJudge implements CaseFactbookJudge {
  constructor(private readonly options: JudgeOptions) {}

  private async request(request: DeepSeekRequest) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      return await this.options.transport.create(request, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) {
        throw new ProviderError("TIMEOUT", "DEEPSEEK_FACTBOOK_JUDGE_TIMEOUT");
      }
      const status = typeof error === "object" && error && "status" in error
        ? Number(error.status)
        : 0;
      if (status === 401 || status === 403) {
        throw new ProviderError("AUTH_FAILED", "DEEPSEEK_FACTBOOK_JUDGE_AUTH_FAILED");
      }
      if (status === 429) {
        throw new ProviderError("RATE_LIMITED", "DEEPSEEK_FACTBOOK_JUDGE_RATE_LIMITED");
      }
      throw new ProviderError("UNAVAILABLE", "DEEPSEEK_FACTBOOK_JUDGE_UNAVAILABLE");
    } finally {
      clearTimeout(timeout);
    }
  }

  async validateCase(input: {
    game: V2PrivateCase;
    traceId: string;
  }): Promise<SemanticValidation> {
    const response = await this.request({
      model: this.options.model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: DEEPSEEK_FACTBOOK_JUDGE_SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify({ case: publicSemanticV2Case(input.game) }) },
      ],
    });
    try {
      return SemanticValidationSchema.parse(JSON.parse(response.content));
    } catch {
      throw new ProviderError("BAD_OUTPUT", "DEEPSEEK_FACTBOOK_JUDGE_OUTPUT_INVALID");
    }
  }
}

export function createDeepSeekFactbookJudgeFromEnv() {
  return new DeepSeekFactbookJudge({
    transport: createDeepSeekFactbookTransportFromEnv(),
    model: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash",
    timeoutMs: Number(process.env.GENERATION_TIMEOUT_MS ?? 30_000),
  });
}
