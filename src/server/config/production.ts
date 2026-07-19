import { z } from "zod";

export type ProductionConfig = {
  sessionSecret: string;
  qwenApiKey: string;
  deepseekApiKey: string;
  imageStorageDriver: "oss";
  ossRegion: string;
  ossBucket: string;
  ossAccessKeyId: string;
  ossAccessKeySecret: string;
  pgliteDataDir: string;
};

const ProductionEnvSchema = z.object({
  SESSION_SECRET: z.string().min(32),
  QWEN_API_KEY: z.string().min(1),
  DEEPSEEK_API_KEY: z.string().min(1),
  IMAGE_STORAGE_DRIVER: z.literal("oss"),
  OSS_REGION: z.string().min(1),
  OSS_BUCKET: z.string().min(1),
  OSS_ACCESS_KEY_ID: z.string().min(1),
  OSS_ACCESS_KEY_SECRET: z.string().min(1),
  PGLITE_DATA_DIR: z.string().min(1),
});

export function readProductionConfig(env: Record<string, string | undefined>): ProductionConfig {
  const parsed = ProductionEnvSchema.safeParse(env);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))]
      .sort()
      .join(",");
    throw new Error(`INVALID_PRODUCTION_ENV:${fields}`);
  }
  return {
    sessionSecret: parsed.data.SESSION_SECRET,
    qwenApiKey: parsed.data.QWEN_API_KEY,
    deepseekApiKey: parsed.data.DEEPSEEK_API_KEY,
    imageStorageDriver: parsed.data.IMAGE_STORAGE_DRIVER,
    ossRegion: parsed.data.OSS_REGION,
    ossBucket: parsed.data.OSS_BUCKET,
    ossAccessKeyId: parsed.data.OSS_ACCESS_KEY_ID,
    ossAccessKeySecret: parsed.data.OSS_ACCESS_KEY_SECRET,
    pgliteDataDir: parsed.data.PGLITE_DATA_DIR,
  };
}
