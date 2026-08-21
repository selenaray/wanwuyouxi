import { setDefaultResultOrder } from "node:dns";

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
    setDefaultResultOrder("ipv4first");
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

function transportErrorDetails(error: unknown) {
  const cause = error instanceof Error && error.cause && typeof error.cause === "object"
    ? error.cause as { code?: unknown }
    : null;
  return {
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message.slice(0, 300) : null,
    status: typeof error === "object" && error && "status" in error ? Number(error.status) : null,
    causeCode: typeof cause?.code === "string" ? cause.code : null,
  };
}

type QwenObservationProviderOptions = {
  transport: QwenObservationTransport;
  model: string;
  timeoutMs: number;
};

const DEFAULT_QWEN_OBSERVATION_TIMEOUT_MS = 120_000;

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
  if (number >= 0 && number <= 1) return number;
  if (number > 1 && number <= 100) return number / 100;
  return value;
}

function normalizeRadius(value: unknown) {
  const number = normalizeNumber(value);
  if (typeof number !== "number") return value;
  if (number > 0 && number <= 1) return Math.min(0.12, Math.max(0.04, number));
  if (number > 1 && number <= 100) return Math.min(0.12, Math.max(0.04, number / 100));
  return value;
}

function normalizeVisualFactId(index: number) {
  return `vf-${index + 1}`;
}

const REJECTION_REASON_CODES = [
  "TOO_DARK",
  "BLURRY",
  "NOT_A_SPACE",
  "TOO_FEW_OBJECTS",
  "UNSAFE",
] as const;

function isRejectionReasonCode(value: unknown): value is typeof REJECTION_REASON_CODES[number] {
  return typeof value === "string"
    && REJECTION_REASON_CODES.includes(value as typeof REJECTION_REASON_CODES[number]);
}

function normalizeObservation(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const rawDecision = typeof value.decision === "string" ? value.decision.toUpperCase() : value.decision;
  const directReasonCode = isRejectionReasonCode(rawDecision) ? rawDecision : null;

  return {
    ...value,
    decision: directReasonCode
      ? directReasonCode === "UNSAFE" ? "BLOCK" : "RETRY"
      : rawDecision,
    ...(directReasonCode
      ? { reasonCode: directReasonCode }
      : typeof value.reasonCode === "string"
      ? { reasonCode: value.reasonCode.toUpperCase() }
      : {}),
    visualFacts: Array.isArray(value.visualFacts)
      ? value.visualFacts.map((fact, index) => {
        if (!isRecord(fact)) return fact;
        return {
          ...fact,
          id: normalizeVisualFactId(index),
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
      // Log only the upstream status/message/cause. Never include credentials or
      // request payloads, but preserve enough detail to distinguish an invalid
      // key from a workspace/model permission failure in production.
      console.error("QWEN_OBSERVATION_TRANSPORT_FAILED", JSON.stringify(transportErrorDetails(error)));
      if (status === 401 || status === 403) throw new ProviderError("AUTH_FAILED", "QWEN_OBSERVATION_AUTH_FAILED");
      if (status === 429) throw new ProviderError("RATE_LIMITED", "QWEN_OBSERVATION_RATE_LIMITED");
      throw new ProviderError("UNAVAILABLE", "QWEN_OBSERVATION_UNAVAILABLE");
    } finally {
      clearTimeout(timeout);
    }
  }
}

function readGenerationTimeoutMs(value: string | undefined) {
  const parsed = typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed >= 10_000
    ? parsed
    : DEFAULT_QWEN_OBSERVATION_TIMEOUT_MS;
}

export function createQwenObservationProviderFromEnv() {
  const apiKey = process.env.QWEN_API_KEY?.trim();
  if (!apiKey) throw new Error("QWEN_API_KEY_MISSING");
  const baseURL = (
    process.env.QWEN_OBSERVATION_BASE_URL
      ?? process.env.QWEN_BASE_URL
      ?? "https://dashscope.aliyuncs.com/compatible-mode/v1"
  ).trim().replace(/\/+$/, "");
  return new QwenObservationProvider({
    transport: new OpenAIQwenObservationTransport(
      apiKey,
      baseURL,
    ),
    model: process.env.QWEN_VISION_MODEL?.trim() || "qwen3-vl-plus",
    timeoutMs: readGenerationTimeoutMs(process.env.QWEN_OBSERVATION_TIMEOUT_MS),
  });
}
