import OpenAI from "openai";
import { z } from "zod";

import { PrivateCaseSchema, type PrivateCase } from "@/server/cases/contracts";

import {
  DEEPSEEK_JUDGE_SYSTEM_PROMPT,
  DEEPSEEK_REPAIR_SYSTEM_PROMPT,
} from "./prompts/deepseek-system";
import {
  ProviderError,
  type CaseJudgeProvider,
  type SemanticValidation,
  type ValidationIssue,
} from "./types";

export type DeepSeekRequest = {
  model: string;
  response_format: { type: "json_object" };
  messages: Array<{ role: "system" | "user"; content: string }>;
};

export interface DeepSeekTransport {
  create(request: DeepSeekRequest, signal: AbortSignal): Promise<{ content: string }>;
}

class OpenAIDeepSeekTransport implements DeepSeekTransport {
  private readonly client: OpenAI;

  constructor(apiKey: string, baseURL: string) {
    this.client = new OpenAI({ apiKey, baseURL });
  }

  async create(request: DeepSeekRequest, signal: AbortSignal) {
    const completion = await this.client.chat.completions.create(request, { signal });
    return { content: completion.choices[0]?.message.content ?? "" };
  }
}

const SemanticValidationSchema = z.object({
  valid: z.boolean(),
  confidence: z.number().min(0).max(1),
  issues: z.array(z.object({
    code: z.enum(["NON_UNIQUE", "CONTRADICTION", "OUTSIDE_EVIDENCE", "UNSAFE", "COPY_QUALITY"]),
    field: z.string().max(80),
    message: z.string().max(120),
  })).max(8),
});

const RepairChangesSchema = z.object({
  changes: z.object({
    background: z.string().min(12).max(180).optional(),
    objective: z.string().min(6).max(80).optional(),
    question: z.string().min(6).max(80).optional(),
    answerOptions: z.tuple([
      z.string().trim().min(1).max(40),
      z.string().trim().min(1).max(40),
      z.string().trim().min(1).max(40),
    ]).optional(),
    wrongAnswerHint: z.string().min(4).max(80).optional(),
    truth: z.string().min(12).max(240).optional(),
    clueTexts: z.tuple([
      z.string().min(4).max(80),
      z.string().min(4).max(80),
      z.string().min(4).max(80),
    ]).optional(),
  }).strict(),
});

function semanticCase(game: PrivateCase) {
  return {
    title: game.title,
    background: game.background,
    objective: game.objective,
    clues: game.clues.map((clue) => ({ objectName: clue.objectName, clueText: clue.clueText })),
    question: game.question,
    answerOptions: game.answerOptions,
    claimedCorrectAnswer: game.answerOptions[game.correctAnswerIndex],
    wrongAnswerHint: game.wrongAnswerHint,
    truth: game.truth,
  };
}

type Options = { transport: DeepSeekTransport; model: string; timeoutMs: number };

export class DeepSeekCaseJudge implements CaseJudgeProvider {
  constructor(private readonly options: Options) {}

  private async request(request: DeepSeekRequest) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      return await this.options.transport.create(request, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) throw new ProviderError("TIMEOUT", "DEEPSEEK_TIMEOUT");
      const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 0;
      if (status === 401 || status === 403) throw new ProviderError("AUTH_FAILED", "DEEPSEEK_AUTH_FAILED");
      if (status === 429) throw new ProviderError("RATE_LIMITED", "DEEPSEEK_RATE_LIMITED");
      throw new ProviderError("UNAVAILABLE", "DEEPSEEK_UNAVAILABLE");
    } finally {
      clearTimeout(timeout);
    }
  }

  async validateCase(input: {
    game: PrivateCase;
    visibleObjectNames: string[];
    traceId: string;
  }): Promise<SemanticValidation> {
    const response = await this.request({
      model: this.options.model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: DEEPSEEK_JUDGE_SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            visibleObjectNames: input.visibleObjectNames,
            case: semanticCase(input.game),
          }),
        },
      ],
    });
    try {
      return SemanticValidationSchema.parse(JSON.parse(response.content));
    } catch {
      throw new ProviderError("BAD_OUTPUT", "DEEPSEEK_JUDGE_OUTPUT_INVALID");
    }
  }

  async repairCase(input: {
    game: PrivateCase;
    issues: ValidationIssue[];
    traceId: string;
  }): Promise<PrivateCase> {
    const response = await this.request({
      model: this.options.model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: DEEPSEEK_REPAIR_SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({ case: semanticCase(input.game), issues: input.issues }),
        },
      ],
    });

    try {
      const { changes } = RepairChangesSchema.parse(JSON.parse(response.content));
      const clues = changes.clueTexts
        ? input.game.clues.map((clue, index) => ({ ...clue, clueText: changes.clueTexts![index] }))
        : input.game.clues;
      return PrivateCaseSchema.parse({ ...input.game, ...changes, clues, clueTexts: undefined });
    } catch {
      throw new ProviderError("BAD_OUTPUT", "DEEPSEEK_REPAIR_OUTPUT_INVALID");
    }
  }
}

export function createDeepSeekCaseJudgeFromEnv() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY_MISSING");
  return new DeepSeekCaseJudge({
    transport: new OpenAIDeepSeekTransport(
      apiKey,
      process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
    ),
    model: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash",
    timeoutMs: Number(process.env.GENERATION_TIMEOUT_MS ?? 30_000),
  });
}
