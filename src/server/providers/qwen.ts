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
      const json: unknown = JSON.parse(response.content);
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

