import { z } from "zod";

export type ProductionConfig = {
  appDomain: string;
  sessionSecret: string;
  qwenApiKey: string;
  factbookProvider: "deepseek" | "qwen";
  textApiKey: string;
  imageStorageDriver: "oss";
  ossRegion: string;
  ossBucket: string;
  ossAccessKeyId: string;
  ossAccessKeySecret: string;
  pgliteDataDir: string;
  dailyGenerationLimit: number;
  cleanupIntervalMs: number;
};

const RuntimeLimitsSchema = z.object({
  DAILY_CASE_LIMIT: z.coerce.number().int().min(1).max(20).default(3),
  CLEANUP_INTERVAL_MS: z.coerce.number().int().min(60_000).max(86_400_000).default(60_000),
});

const ProductionEnvSchema = RuntimeLimitsSchema.extend({
  APP_DOMAIN: z.string().trim().min(1),
  SESSION_SECRET: z.string().min(32),
  QWEN_API_KEY: z.string().min(1),
  FACTBOOK_PROVIDER: z.enum(["deepseek", "qwen"]).default("deepseek"),
  DEEPSEEK_API_KEY: z.string().min(1).optional(),
  QWEN_TEXT_API_KEY: z.string().min(1).optional(),
  IMAGE_STORAGE_DRIVER: z.literal("oss"),
  OSS_REGION: z.string().min(1),
  OSS_BUCKET: z.string().min(1),
  OSS_ACCESS_KEY_ID: z.string().min(1),
  OSS_ACCESS_KEY_SECRET: z.string().min(1),
  PGLITE_DATA_DIR: z.string().min(1),
}).superRefine((env, context) => {
  if (env.FACTBOOK_PROVIDER === "qwen" && !env.QWEN_TEXT_API_KEY && !env.QWEN_API_KEY) {
    context.addIssue({ code: "custom", path: ["QWEN_TEXT_API_KEY"], message: "Required for Qwen text" });
  }
  if (env.FACTBOOK_PROVIDER === "deepseek" && !env.DEEPSEEK_API_KEY) {
    context.addIssue({ code: "custom", path: ["DEEPSEEK_API_KEY"], message: "Required for DeepSeek" });
  }
});

function invalidFields(error: z.ZodError) {
  return [...new Set(error.issues.map((issue) => issue.path.join(".")))]
    .sort()
    .join(",");
}

export function readRuntimeLimits(env: Record<string, string | undefined>) {
  const parsed = RuntimeLimitsSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`INVALID_RUNTIME_ENV:${invalidFields(parsed.error)}`);
  }
  return {
    dailyGenerationLimit: parsed.data.DAILY_CASE_LIMIT,
    cleanupIntervalMs: parsed.data.CLEANUP_INTERVAL_MS,
  };
}

export function readProductionConfig(env: Record<string, string | undefined>): ProductionConfig {
  const parsed = ProductionEnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`INVALID_PRODUCTION_ENV:${invalidFields(parsed.error)}`);
  }
  return {
    appDomain: parsed.data.APP_DOMAIN,
    sessionSecret: parsed.data.SESSION_SECRET,
    qwenApiKey: parsed.data.QWEN_API_KEY,
    factbookProvider: parsed.data.FACTBOOK_PROVIDER,
    textApiKey: parsed.data.FACTBOOK_PROVIDER === "qwen"
      ? parsed.data.QWEN_TEXT_API_KEY ?? parsed.data.QWEN_API_KEY
      : parsed.data.DEEPSEEK_API_KEY!,
    imageStorageDriver: parsed.data.IMAGE_STORAGE_DRIVER,
    ossRegion: parsed.data.OSS_REGION,
    ossBucket: parsed.data.OSS_BUCKET,
    ossAccessKeyId: parsed.data.OSS_ACCESS_KEY_ID,
    ossAccessKeySecret: parsed.data.OSS_ACCESS_KEY_SECRET,
    pgliteDataDir: parsed.data.PGLITE_DATA_DIR,
    dailyGenerationLimit: parsed.data.DAILY_CASE_LIMIT,
    cleanupIntervalMs: parsed.data.CLEANUP_INTERVAL_MS,
  };
}
