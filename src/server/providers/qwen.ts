import OpenAI from "openai";

import { GeneratedCaseSchema, type GeneratedCase } from "@/server/cases/contracts";

import { QWEN_CASE_SYSTEM_PROMPT } from "./prompts/qwen-system";
import { ProviderError, type VisionCaseProvider } from "./types";

export type QwenRequest = {
  model: string;
  enable_thinking: false;
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

function normalizeGeneratedCase(value: unknown): unknown {
  if (!isRecord(value) || value.decision !== "PASS" || !isRecord(value.game)) return value;

  const game = value.game;
  const clues = Array.isArray(game.clues)
    ? game.clues.map((clue, index) => {
        if (!isRecord(clue)) return clue;
        const validId = typeof clue.id === "string" && /^[a-z0-9-]{1,32}$/.test(clue.id);
        return validId ? clue : { ...clue, id: `clue-${index + 1}` };
      })
    : game.clues;

  let answerOptions = game.answerOptions;
  let correctAnswerIndex = game.correctAnswerIndex;
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

  const interactionMode = game.interactionMode === "CARD_FALLBACK"
    ? "CARD_FALLBACK"
    : "HOTSPOT";
  const candidates = Array.isArray(value.candidates)
    ? value.candidates.map((candidate) => {
        if (typeof candidate === "string" || !isRecord(candidate)) return candidate;
        return candidate.objectName ?? candidate.name ?? candidate.label ?? candidate;
      })
    : value.candidates;

  return {
    ...value,
    candidates,
    game: { ...game, interactionMode, clues, answerOptions, correctAnswerIndex },
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
      if (!parsed.success) throw new ProviderError("BAD_OUTPUT", "QWEN_SCHEMA_INVALID");
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
