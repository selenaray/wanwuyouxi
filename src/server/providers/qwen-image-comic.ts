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

type QwenImageKeySource = "QWEN_API_KEY" | "QWEN_IMAGE_API_KEY" | "DASHSCOPE_API_KEY";

const DEFAULT_QWEN_IMAGE_MODEL = "qwen-image-2.0-pro";
const DEFAULT_QWEN_IMAGE_SIZE = "2048*2048";
const DEFAULT_QWEN_IMAGE_TIMEOUT_MS = 150_000;
const DEFAULT_QWEN_IMAGE_API_URL = "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
const QWEN_IMAGE_API_PATH = "/api/v1/services/aigc/multimodal-generation/generation";
const NEGATIVE_PROMPT = "文字，字幕，对白气泡，水印，logo，低清晰度，低画质，肢体畸形，手指畸形，脸部崩坏，构图混乱，过度明亮，过度饱和";

class DashScopeQwenImageTransport implements QwenImageTransport {
  constructor(
    private readonly apiKey: string,
    private readonly apiUrl: string,
    private readonly workspaceId?: string,
  ) {}

  async create(request: QwenImageRequest, signal: AbortSignal) {
    const response = await fetch(this.apiUrl, {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
        ...(this.workspaceId ? { "X-DashScope-WorkSpace": this.workspaceId } : {}),
      },
      body: JSON.stringify(request),
    });
    const responseText = await response.text();
    let body: QwenImageResponse = {};
    try {
      body = responseText ? JSON.parse(responseText) as QwenImageResponse : {};
    } catch {
      console.error("QWEN_IMAGE_PROVIDER_ERROR", JSON.stringify({
        status: response.status,
        code: "NON_JSON_RESPONSE",
        message: responseText.slice(0, 500),
        apiHost: new URL(this.apiUrl).host,
        model: request.model,
        referenceImageCount: request.input.messages[0].content.filter((item) => "image" in item).length,
        workspaceConfigured: Boolean(this.workspaceId),
      }));
      const error = new Error("QWEN_IMAGE_NON_JSON_RESPONSE") as Error & { status?: number };
      error.status = response.status;
      throw error;
    }
    if (!response.ok || body.code) {
      console.error("QWEN_IMAGE_PROVIDER_ERROR", JSON.stringify({
        status: response.status,
        code: body.code ?? null,
        message: body.message ?? null,
        apiHost: new URL(this.apiUrl).host,
        model: request.model,
        referenceImageCount: request.input.messages[0].content.filter((item) => "image" in item).length,
        workspaceConfigured: Boolean(this.workspaceId),
      }));
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

function transportErrorDetails(error: unknown) {
  const cause = error instanceof Error && error.cause && typeof error.cause === "object"
    ? error.cause as { code?: unknown }
    : null;
  return {
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message.slice(0, 300) : null,
    causeCode: typeof cause?.code === "string" ? cause.code : null,
  };
}

export function resolveDashScopeImageApiUrl(input: {
  explicitUrl?: string;
  workspaceId?: string;
  region?: string;
}) {
  if (input.explicitUrl && input.explicitUrl.trim() !== "") return input.explicitUrl;
  const workspaceId = input.workspaceId?.trim().toLowerCase();
  if (!workspaceId) return DEFAULT_QWEN_IMAGE_API_URL;
  const region = input.region?.trim() || "cn-beijing";
  return `https://${workspaceId}.${region}.maas.aliyuncs.com${QWEN_IMAGE_API_PATH}`;
}

export function resolveQwenImageApiKey(env: NodeJS.ProcessEnv = process.env): {
  apiKey: string;
  source: QwenImageKeySource;
} | null {
  if (env.QWEN_IMAGE_API_KEY) return { apiKey: env.QWEN_IMAGE_API_KEY, source: "QWEN_IMAGE_API_KEY" };
  if (env.DASHSCOPE_API_KEY) return { apiKey: env.DASHSCOPE_API_KEY, source: "DASHSCOPE_API_KEY" };
  if (env.QWEN_API_KEY) return { apiKey: env.QWEN_API_KEY, source: "QWEN_API_KEY" };
  return null;
}

export function resolveQwenImageRuntimeConfig(env: NodeJS.ProcessEnv = process.env) {
  const key = resolveQwenImageApiKey(env);
  if (!key) return null;
  const shouldUseWorkspace = key.source !== "QWEN_API_KEY";
  const workspaceId = shouldUseWorkspace ? env.DASHSCOPE_WORKSPACE_ID?.trim() || undefined : undefined;
  const explicitUrl = shouldUseWorkspace
    ? env.QWEN_IMAGE_API_URL ?? env.DASHSCOPE_IMAGE_API_URL
    : undefined;

  return {
    ...key,
    workspaceId,
    apiUrl: resolveDashScopeImageApiUrl({
      explicitUrl,
      workspaceId,
      region: env.DASHSCOPE_REGION,
    }),
  };
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
      const request: QwenImageRequest = {
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
      };
      let response: QwenImageResponse | null = null;
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          response = await this.options.transport.create(request, controller.signal);
          break;
        } catch (error) {
          const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 0;
          const canRetry = attempt === 1 && !controller.signal.aborted && status === 0;
          if (!canRetry) throw error;
          console.warn("QWEN_IMAGE_TRANSPORT_RETRY", JSON.stringify({
            attempt,
            ...transportErrorDetails(error),
          }));
        }
      }
      if (!response) throw new Error("QWEN_IMAGE_TRANSPORT_EMPTY");
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
      console.error("QWEN_IMAGE_TRANSPORT_FAILED", JSON.stringify(transportErrorDetails(error)));
      throw new ProviderError("UNAVAILABLE", "QWEN_IMAGE_UNAVAILABLE");
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createQwenImageComicProviderFromEnv() {
  const config = resolveQwenImageRuntimeConfig();
  if (!config) throw new Error("QWEN_IMAGE_API_KEY_MISSING");
  console.info("QWEN_IMAGE_KEY_SOURCE", JSON.stringify({
    source: config.source,
    prefix: `${config.apiKey.slice(0, 6)}***`,
    apiHost: new URL(config.apiUrl).host,
    workspaceConfigured: Boolean(config.workspaceId),
  }));
  return new QwenImageComicProvider({
    transport: new DashScopeQwenImageTransport(
      config.apiKey,
      config.apiUrl,
      config.workspaceId,
    ),
    model: process.env.QWEN_IMAGE_MODEL ?? DEFAULT_QWEN_IMAGE_MODEL,
    size: process.env.QWEN_IMAGE_SIZE ?? DEFAULT_QWEN_IMAGE_SIZE,
    timeoutMs: readTimeoutMs(process.env.QWEN_IMAGE_TIMEOUT_MS),
  });
}
