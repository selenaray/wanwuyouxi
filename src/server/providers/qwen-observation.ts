import OpenAI from "openai";

import {
  VisionObservationSchema,
  type VisionObservation,
} from "@/server/cases/v2-contracts";

import { QWEN_OBSERVATION_SYSTEM_PROMPT } from "./prompts/qwen-observation-system";
import { ProviderError, type VisionObservationProvider } from "./types";

export type QwenObservationRequest = {
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

export interface QwenObservationTransport {
  create(request: QwenObservationRequest, signal: AbortSignal): Promise<{ content: string }>;
}

class OpenAIQwenObservationTransport implements QwenObservationTransport {
  private readonly client: OpenAI;

  constructor(apiKey: string, baseURL: string) {
    this.client = new OpenAI({ apiKey, baseURL });
  }

  async create(request: QwenObservationRequest, signal: AbortSignal) {
    const completion = await this.client.chat.completions.create(
      request as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
      { signal },
    );
    return { content: completion.choices[0]?.message.content ?? "" };
  }
}

type QwenObservationProviderOptions = {
  transport: QwenObservationTransport;
  model: string;
  timeoutMs: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeNumber(value: unknown) {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) ? number : value;
}

function normalizeUnitInterval(value: unknown) {
  const number = normalizeNumber(value);
  if (typeof number !== "number") return value;
  const ratio = number > 1 && number <= 100 ? number / 100 : number;
  return Math.min(1, Math.max(0, ratio));
}

function normalizeRadius(value: unknown) {
  const number = normalizeNumber(value);
  if (typeof number !== "number") return value;
  const ratio = number > 1 && number <= 100 ? number / 100 : number;
  return Math.min(0.12, Math.max(0.04, ratio));
}

function normalizeObservation(value: unknown): unknown {
  if (!isRecord(value)) return value;

  return {
    ...value,
    decision: typeof value.decision === "string" ? value.decision.toUpperCase() : value.decision,
    ...(typeof value.reasonCode === "string"
      ? { reasonCode: value.reasonCode.toUpperCase() }
      : {}),
    visualFacts: Array.isArray(value.visualFacts)
      ? value.visualFacts.map((fact) => {
        if (!isRecord(fact)) return fact;
        return {
          ...fact,
          x: normalizeUnitInterval(fact.x),
          y: normalizeUnitInterval(fact.y),
          radius: normalizeRadius(fact.radius),
          confidence: normalizeUnitInterval(fact.confidence),
        };
      })
      : value.visualFacts,
  };
}

export class QwenObservationProvider implements VisionObservationProvider {
  constructor(private readonly options: QwenObservationProviderOptions) {}

  async observeScene(
    input: Parameters<VisionObservationProvider["observeScene"]>[0],
  ): Promise<VisionObservation> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
    const request: QwenObservationRequest = {
      model: this.options.model,
      enable_thinking: false,
      max_tokens: 2048,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: QWEN_OBSERVATION_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: input.imageUrl } },
            { type: "text", text: `图片尺寸为 ${input.imageWidth}×${input.imageHeight}。请只返回观察 JSON。` },
          ],
        },
      ],
    };

    try {
      const response = await this.options.transport.create(request, controller.signal);
      const parsed = VisionObservationSchema.safeParse(normalizeObservation(JSON.parse(response.content)));
      if (!parsed.success) {
        const issuePaths = parsed.error.issues
          .slice(0, 12)
          .map((issue) => `${issue.path.join(".") || "root"}:${issue.code}`);
        console.error("QWEN_OBSERVATION_SCHEMA_INVALID", issuePaths.join(","));
        throw new ProviderError("BAD_OUTPUT", "QWEN_OBSERVATION_SCHEMA_INVALID");
      }
      return parsed.data;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (controller.signal.aborted) throw new ProviderError("TIMEOUT", "QWEN_OBSERVATION_TIMEOUT");
      if (error instanceof SyntaxError) throw new ProviderError("BAD_OUTPUT", "QWEN_OBSERVATION_JSON_INVALID");
      const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 0;
      if (status === 401 || status === 403) throw new ProviderError("AUTH_FAILED", "QWEN_OBSERVATION_AUTH_FAILED");
      if (status === 429) throw new ProviderError("RATE_LIMITED", "QWEN_OBSERVATION_RATE_LIMITED");
      throw new ProviderError("UNAVAILABLE", "QWEN_OBSERVATION_UNAVAILABLE");
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createQwenObservationProviderFromEnv() {
  const apiKey = process.env.QWEN_API_KEY;
  if (!apiKey) throw new Error("QWEN_API_KEY_MISSING");
  return new QwenObservationProvider({
    transport: new OpenAIQwenObservationTransport(
      apiKey,
      process.env.QWEN_BASE_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1",
    ),
    model: process.env.QWEN_VISION_MODEL ?? "qwen3-vl-plus",
    timeoutMs: Number(process.env.GENERATION_TIMEOUT_MS ?? 30_000),
  });
}
