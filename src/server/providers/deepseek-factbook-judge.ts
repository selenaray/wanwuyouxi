import { z } from "zod";

import type { V2PrivateCase } from "@/server/cases/v2-contracts";

import type { DeepSeekRequest, DeepSeekTransport } from "./deepseek";
import {
  createDeepSeekFactbookTransportFromEnv,
  parseJsonObjectContent,
  resolveFactbookRuntimeConfig,
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
  provider?: "deepseek" | "qwen";
};

const DEFAULT_DEEPSEEK_FACTBOOK_TIMEOUT_MS = 60_000;

function readFactbookTimeoutMs(value: string | undefined) {
  const parsed = typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed >= 10_000
    ? parsed
    : DEFAULT_DEEPSEEK_FACTBOOK_TIMEOUT_MS;
}

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
    const provider = this.options.provider ?? "deepseek";
    const prefix = provider === "qwen" ? "QWEN_TEXT" : "DEEPSEEK";
    let output: unknown;
    try {
      output = parseJsonObjectContent(response.content);
    } catch {
      throw new ProviderError("BAD_OUTPUT", `${prefix}_FACTBOOK_JUDGE_OUTPUT_INVALID`, "json");
    }
    const normalized = provider === "qwen" ? normalizeSemanticValidation(output) : output;
    const parsed = SemanticValidationSchema.safeParse(normalized);
    if (!parsed.success) {
      const diagnostic = parsed.error.issues.slice(0, 8)
        .map((issue) => `${issue.path.join(".")}:${issue.code}`)
        .join("|")
        .slice(0, 300);
      console.warn("FACTBOOK_JUDGE_SCHEMA_INVALID", JSON.stringify({ provider, diagnostic }));
      throw new ProviderError("BAD_OUTPUT", `${prefix}_FACTBOOK_JUDGE_OUTPUT_INVALID`, diagnostic);
    }
    return parsed.data;
  }
}

const VALIDATION_CODES = new Set([
  "NON_UNIQUE", "CONTRADICTION", "OUTSIDE_EVIDENCE", "UNSAFE", "COPY_QUALITY",
]);

function normalizeSemanticValidation(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  const valid = record.valid === true;
  const confidenceValue = typeof record.confidence === "number" ? record.confidence : 0.5;
  const confidence = Math.min(1, Math.max(0, confidenceValue));
  const issues = Array.isArray(record.issues)
    ? record.issues.flatMap((issue) => {
      if (typeof issue !== "object" || issue === null || Array.isArray(issue)) return [];
      const item = issue as Record<string, unknown>;
      if (
        typeof item.code !== "string"
        || !VALIDATION_CODES.has(item.code)
        || typeof item.field !== "string"
        || typeof item.message !== "string"
      ) return [];
      return [{
        code: item.code,
        field: item.field.slice(0, 80),
        message: item.message.slice(0, 120),
      }];
    })
    : [];
  return { valid, confidence, issues: valid ? [] : issues };
}

export function createDeepSeekFactbookJudgeFromEnv() {
  const config = resolveFactbookRuntimeConfig();
  return new DeepSeekFactbookJudge({
    transport: createDeepSeekFactbookTransportFromEnv(),
    model: config.model,
    timeoutMs: readFactbookTimeoutMs(process.env.DEEPSEEK_FACTBOOK_TIMEOUT_MS),
    provider: config.provider,
  });
}
