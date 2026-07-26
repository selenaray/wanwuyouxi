import { ProviderError } from "./types";

export type QwenImageRequest = {
  model: string;
  input: {
    messages: [{
      role: "user";
      content: Array<{ image: string } | { text: string }>;
    }];
  };
  parameters: {
    negative_prompt: string;
    n: 1;
    prompt_extend: false;
    size: string;
    watermark: false;
  };
};

export type QwenImageResponse = {
  output?: {
    choices?: Array<{
      message?: {
        content?: Array<{ image?: string }>;
      };
    }>;
  };
  usage?: {
    width?: number;
    height?: number;
    image_count?: number;
  };
  code?: string;
  message?: string;
};

export interface QwenImageTransport {
  create(request: QwenImageRequest, signal: AbortSignal): Promise<QwenImageResponse>;
}

type QwenImageComicProviderOptions = {
  transport: QwenImageTransport;
  model: string;
  size: string;
  timeoutMs: number;
};

const DEFAULT_QWEN_IMAGE_MODEL = "qwen-image-2.0-pro";
const DEFAULT_QWEN_IMAGE_SIZE = "2048*2048";
const DEFAULT_QWEN_IMAGE_TIMEOUT_MS = 120_000;
const DEFAULT_QWEN_IMAGE_API_URL = "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
const QWEN_IMAGE_API_PATH = "/api/v1/services/aigc/multimodal-generation/generation";
const NEGATIVE_PROMPT = "文字，字幕，对白气泡，水印，logo，低清晰度，低画质，肢体畸形，手指畸形，脸部崩坏，构图混乱，过度明亮，过度饱和";

class DashScopeQwenImageTransport implements QwenImageTransport {
  constructor(
    private readonly apiKey: string,
    private readonly apiUrl: string,
  ) {}

  async create(request: QwenImageRequest, signal: AbortSignal) {
    const response = await fetch(this.apiUrl, {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(request),
    });
    const body = await response.json() as QwenImageResponse;
    if (!response.ok || body.code) {
      const error = new Error(body.message || "QWEN_IMAGE_UNAVAILABLE") as Error & { status?: number };
      error.status = response.status;
      throw error;
    }
    return body;
  }
}

function readTimeoutMs(value: string | undefined) {
  const parsed = typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed >= 10_000 ? parsed : DEFAULT_QWEN_IMAGE_TIMEOUT_MS;
}

function imageUrlFromResponse(response: QwenImageResponse) {
  return response.output?.choices?.[0]?.message?.content?.find((item) => item.image)?.image;
}

function workspaceIdFromSkWsKey(apiKey: string) {
  const match = apiKey.match(/^sk-ws-[A-Z]\.([A-Za-z0-9-]+)\./);
  return match?.[1]?.toLowerCase() ?? null;
}

export function resolveDashScopeImageApiUrl(input: {
  explicitUrl?: string;
  apiKey: string;
  workspaceId?: string;
  region?: string;
}) {
  if (input.explicitUrl && input.explicitUrl.trim() !== "") return input.explicitUrl;
  const workspaceId = input.workspaceId?.trim().toLowerCase() || workspaceIdFromSkWsKey(input.apiKey);
  if (!workspaceId) return DEFAULT_QWEN_IMAGE_API_URL;
  const region = input.region?.trim() || "cn-beijing";
  return `https://${workspaceId}.${region}.maas.aliyuncs.com${QWEN_IMAGE_API_PATH}`;
}

export class QwenImageComicProvider {
  constructor(private readonly options: QwenImageComicProviderOptions) {}

  async generate(input: { prompt: string; referenceImages?: string[] }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
    const content = [
      ...(input.referenceImages ?? []).slice(0, 3).map((image) => ({ image })),
      { text: input.prompt },
    ];
    try {
      const response = await this.options.transport.create({
        model: this.options.model,
        input: {
          messages: [{ role: "user", content }],
        },
        parameters: {
          negative_prompt: NEGATIVE_PROMPT,
          n: 1,
          prompt_extend: false,
          size: this.options.size,
          watermark: false,
        },
      }, controller.signal);
      const imageUrl = imageUrlFromResponse(response);
      if (!imageUrl) throw new ProviderError("BAD_OUTPUT", "QWEN_IMAGE_OUTPUT_INVALID");
      return {
        imageUrl,
        width: response.usage?.width ?? null,
        height: response.usage?.height ?? null,
      };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (controller.signal.aborted) throw new ProviderError("TIMEOUT", "QWEN_IMAGE_TIMEOUT");
      const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 0;
      if (status === 401 || status === 403) throw new ProviderError("AUTH_FAILED", "QWEN_IMAGE_AUTH_FAILED");
      if (status === 429) throw new ProviderError("RATE_LIMITED", "QWEN_IMAGE_RATE_LIMITED");
      throw new ProviderError("UNAVAILABLE", "QWEN_IMAGE_UNAVAILABLE");
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createQwenImageComicProviderFromEnv() {
  const apiKey = process.env.DASHSCOPE_API_KEY ?? process.env.QWEN_IMAGE_API_KEY ?? process.env.QWEN_API_KEY;
  if (!apiKey) throw new Error("DASHSCOPE_API_KEY_MISSING");
  return new QwenImageComicProvider({
    transport: new DashScopeQwenImageTransport(
      apiKey,
      resolveDashScopeImageApiUrl({
        explicitUrl: process.env.DASHSCOPE_IMAGE_API_URL,
        apiKey,
        workspaceId: process.env.DASHSCOPE_WORKSPACE_ID,
        region: process.env.DASHSCOPE_REGION,
      }),
    ),
    model: process.env.QWEN_IMAGE_MODEL ?? DEFAULT_QWEN_IMAGE_MODEL,
    size: process.env.QWEN_IMAGE_SIZE ?? DEFAULT_QWEN_IMAGE_SIZE,
    timeoutMs: readTimeoutMs(process.env.QWEN_IMAGE_TIMEOUT_MS),
  });
}
