import { generateStatelessCase } from "@/server/generation/stateless";
import {
  FakeCaseFactbookCompiler,
  FakeCaseFactbookJudge,
  FakeVisionObservationProvider,
  ObservationFallbackFactbookCompiler,
  createDeepSeekFactbookCompilerFromEnv,
  createDeepSeekFactbookJudgeFromEnv,
  createQwenObservationProviderFromEnv,
} from "@/server/providers";
import { ProviderError } from "@/server/providers/types";

export const maxDuration = 180;

function errorCode(error: unknown) {
  if (error instanceof ProviderError) return error.message;
  if (error instanceof Error && /^[A-Z0-9_]{1,80}$/.test(error.message)) return error.message;
  return "GENERATION_FAILED";
}

function isRetryableGenerationError(error: unknown) {
  if (!(error instanceof ProviderError)) return false;
  return ["TIMEOUT", "RATE_LIMITED", "UNAVAILABLE", "BAD_OUTPUT"].includes(error.code);
}

async function generateWithRetry(
  input: Parameters<typeof generateStatelessCase>[0],
  dependencies: Parameters<typeof generateStatelessCase>[1],
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await generateStatelessCase(input, dependencies);
    } catch (error) {
      lastError = error;
      if (!isRetryableGenerationError(error) || attempt === 2) throw error;
      console.warn("LIVE_GENERATION_RETRY", JSON.stringify({ attempt, code: errorCode(error) }));
    }
  }
  throw lastError;
}

export async function POST(request: Request) {
  const traceId = crypto.randomUUID();
  try {
    const form = await request.formData();
    const image = form.get("image");
    if (!(image instanceof File) || image.size === 0 || image.size > 5 * 1024 * 1024) {
      return Response.json({ ok: false, error: { code: "INVALID_IMAGE", message: "请选择 5 MB 以内的现场照片", retryable: false }, traceId }, { status: 400 });
    }

    const bytes = Buffer.from(await image.arrayBuffer());
    const width = Number(form.get("width")) || 1200;
    const height = Number(form.get("height")) || 900;
    if (width < 1 || height < 1 || width > 10000 || height > 10000) throw new Error("INVALID_IMAGE");
    const imageUrl = `data:${image.type || "image/jpeg"};base64,${bytes.toString("base64")}`;
    const hasLiveModels = Boolean(process.env.QWEN_API_KEY && process.env.DEEPSEEK_API_KEY);
    const input = { imageUrl, imageWidth: width, imageHeight: height, traceId };
    const result = hasLiveModels
      ? await generateWithRetry(input, {
        vision: createQwenObservationProviderFromEnv(),
        compiler: createDeepSeekFactbookCompilerFromEnv(),
        judge: createDeepSeekFactbookJudgeFromEnv(),
        fallbackCompiler: new ObservationFallbackFactbookCompiler(),
        fallbackJudge: new FakeCaseFactbookJudge(),
      })
      : await generateStatelessCase(input, {
        vision: new FakeVisionObservationProvider(),
        compiler: new FakeCaseFactbookCompiler(),
        judge: new FakeCaseFactbookJudge(),
      });

    return Response.json({ ok: true, data: result, traceId });
  } catch (error) {
    const code = errorCode(error);
    return Response.json({ ok: false, error: { code, message: "现场重建未完成，请重试", retryable: true }, traceId }, { status: 503 });
  }
}
