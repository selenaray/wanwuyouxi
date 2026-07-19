import OpenAI from "openai";

import { GeneratedCaseSchema, type GeneratedCase } from "@/server/cases/contracts";

import { QWEN_CASE_SYSTEM_PROMPT } from "./prompts/qwen-system";
import { ProviderError, type VisionCaseProvider } from "./types";

export type QwenRequest = {
  model: string;
  enable_thinking: false;
  max_tokens: number;
  response_format: { type: "json_object" };
  messages: Array<{
    role: "system" | "user";
    content: string | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >;
  }>;
};

export interface QwenTransport {
  create(request: QwenRequest, signal: AbortSignal): Promise<{ content: string }>;
}

class OpenAIQwenTransport implements QwenTransport {
  private readonly client: OpenAI;

  constructor(apiKey: string, baseURL: string) {
    this.client = new OpenAI({ apiKey, baseURL });
  }

  async create(request: QwenRequest, signal: AbortSignal) {
    const completion = await this.client.chat.completions.create(
      request as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
      { signal },
    );
    return { content: completion.choices[0]?.message.content ?? "" };
  }
}

type QwenVisionProviderOptions = {
  transport: QwenTransport;
  model: string;
  timeoutMs: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function trimText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : value;
}

function normalizeNumber(value: unknown) {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) ? number : value;
}

function normalizeUnitInterval(value: unknown, fallback?: number) {
  if (value === undefined || value === null) return fallback ?? value;
  const number = normalizeNumber(value);
  if (typeof number !== "number") return value;
  const ratio = number > 1 && number <= 100 ? number / 100 : number;
  return Math.min(1, Math.max(0, ratio));
}

function normalizeRadius(value: unknown) {
  if (value === undefined || value === null) return 0.08;
  const number = normalizeNumber(value);
  if (typeof number !== "number") return value;
  const ratio = number > 1 && number <= 100 ? number / 100 : number;
  return Math.min(0.12, Math.max(0.04, ratio));
}

function normalizeStringArray(value: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(value)) return value;
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeGeneratedCase(value: unknown): unknown {
  if (!isRecord(value)) return value;

  const decision = typeof value.decision === "string" ? value.decision.toUpperCase() : value.decision;
  const riskLabels = normalizeStringArray(value.riskLabels, 5, 40);
  const candidateValues = Array.isArray(value.candidates)
    ? value.candidates.map((candidate) => {
        if (typeof candidate === "string" || !isRecord(candidate)) return candidate;
        return candidate.objectName ?? candidate.name ?? candidate.label;
      })
    : value.candidates;
  const candidates = normalizeStringArray(candidateValues, 8, 12);

  if (decision !== "PASS" || !isRecord(value.game)) {
    return {
      ...value,
      decision,
      reasonCode: typeof value.reasonCode === "string" ? value.reasonCode.toUpperCase() : value.reasonCode,
      riskLabels,
      candidates,
      ...(decision === "RETRY" || decision === "BLOCK" ? { game: null } : {}),
    };
  }

  const game = value.game;
  const clues = Array.isArray(game.clues)
    ? game.clues.slice(0, 3).map((clue, index) => {
        if (!isRecord(clue)) return clue;
        const validId = typeof clue.id === "string" && /^[a-z0-9-]{1,32}$/.test(clue.id);
        return {
          ...clue,
          id: validId ? clue.id : `clue-${index + 1}`,
          objectName: trimText(clue.objectName, 12),
          clueText: trimText(clue.clueText, 80),
          regionHint: trimText(clue.regionHint, 24),
          x: normalizeUnitInterval(clue.x),
          y: normalizeUnitInterval(clue.y),
          radius: normalizeRadius(clue.radius),
          confidence: normalizeUnitInterval(clue.confidence, 0.75),
        };
      })
    : game.clues;

  let answerOptions = Array.isArray(game.answerOptions)
    ? game.answerOptions.map((option) => trimText(option, 40))
    : game.answerOptions;
  let correctAnswerIndex = normalizeNumber(game.correctAnswerIndex);
  if (
    Array.isArray(answerOptions) &&
    answerOptions.length > 3 &&
    typeof correctAnswerIndex === "number" &&
    Number.isInteger(correctAnswerIndex) &&
    correctAnswerIndex >= 0 &&
    correctAnswerIndex < answerOptions.length
  ) {
    if (correctAnswerIndex < 3) {
      answerOptions = answerOptions.slice(0, 3);
    } else {
      answerOptions = [answerOptions[0], answerOptions[1], answerOptions[correctAnswerIndex]];
      correctAnswerIndex = 2;
    }
  }
  if (Array.isArray(answerOptions) && answerOptions.length === 3 && correctAnswerIndex === 3) {
    correctAnswerIndex = 2;
  }

  const interactionMode = game.interactionMode === "IMAGE_HOTSPOT"
    ? "HOTSPOT"
    : game.interactionMode;

  return {
    ...value,
    decision,
    logicalConfidence: normalizeUnitInterval(value.logicalConfidence),
    riskLabels,
    candidates,
    game: {
      ...game,
      title: trimText(game.title, 24),
      caseNumber: trimText(
        typeof game.caseNumber === "number" ? String(game.caseNumber) : game.caseNumber,
        24,
      ),
      background: trimText(game.background, 180),
      objective: trimText(game.objective, 80),
      interactionMode,
      clues,
      question: trimText(game.question, 80),
      answerOptions,
      correctAnswerIndex,
      wrongAnswerHint: trimText(game.wrongAnswerHint, 80),
      truth: trimText(game.truth, 240),
    },
  };
}

export class QwenVisionProvider implements VisionCaseProvider {
  constructor(private readonly options: QwenVisionProviderOptions) {}

  async generateCase(input: Parameters<VisionCaseProvider["generateCase"]>[0]): Promise<GeneratedCase> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);

    const request: QwenRequest = {
      model: this.options.model,
      enable_thinking: false,
      max_tokens: 4096,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: QWEN_CASE_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: input.imageUrl } },
            {
              type: "text",
              text: `图片尺寸为 ${input.imageWidth}×${input.imageHeight}。请按要求分析并返回 JSON。`,
            },
          ],
        },
      ],
    };

    try {
      const response = await this.options.transport.create(request, controller.signal);
      const json: unknown = normalizeGeneratedCase(JSON.parse(response.content));
      const parsed = GeneratedCaseSchema.safeParse(json);
      if (!parsed.success) {
        const issuePaths = parsed.error.issues
          .slice(0, 12)
          .map((issue) => `${issue.path.join(".") || "root"}:${issue.code}`);
        console.error("QWEN_SCHEMA_INVALID", issuePaths.join(","));
        throw new ProviderError("BAD_OUTPUT", "QWEN_SCHEMA_INVALID");
      }
      return parsed.data;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (controller.signal.aborted) throw new ProviderError("TIMEOUT", "QWEN_TIMEOUT");
      if (error instanceof SyntaxError) throw new ProviderError("BAD_OUTPUT", "QWEN_JSON_INVALID");
      const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 0;
      if (status === 401 || status === 403) throw new ProviderError("AUTH_FAILED", "QWEN_AUTH_FAILED");
      if (status === 429) throw new ProviderError("RATE_LIMITED", "QWEN_RATE_LIMITED");
      throw new ProviderError("UNAVAILABLE", "QWEN_UNAVAILABLE");
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createQwenVisionProviderFromEnv() {
  const apiKey = process.env.QWEN_API_KEY;
  if (!apiKey) throw new Error("QWEN_API_KEY_MISSING");
  return new QwenVisionProvider({
    transport: new OpenAIQwenTransport(
      apiKey,
      process.env.QWEN_BASE_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1",
    ),
    model: process.env.QWEN_VISION_MODEL ?? "qwen3-vl-plus",
    timeoutMs: Number(process.env.GENERATION_TIMEOUT_MS ?? 30_000),
  });
}
