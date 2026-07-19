import { describe, expect, it } from "vitest";

import { readProductionConfig } from "./production";

const valid = {
  NODE_ENV: "production",
  SESSION_SECRET: "a-secure-session-secret-with-more-than-32-characters",
  QWEN_API_KEY: "qwen-secret",
  DEEPSEEK_API_KEY: "deepseek-secret",
  IMAGE_STORAGE_DRIVER: "oss",
  OSS_REGION: "oss-cn-hongkong",
  OSS_BUCKET: "private-bucket",
  OSS_ACCESS_KEY_ID: "ram-user",
  OSS_ACCESS_KEY_SECRET: "ram-secret",
  PGLITE_DATA_DIR: "/app/.data/pglite",
};

describe("readProductionConfig", () => {
  it("accepts the complete production configuration", () => {
    expect(readProductionConfig(valid)).toMatchObject({
      imageStorageDriver: "oss",
      pgliteDataDir: "/app/.data/pglite",
    });
  });

  it("reports missing field names without printing secret values", () => {
    expect(() => readProductionConfig({ ...valid, SESSION_SECRET: "short" }))
      .toThrow("INVALID_PRODUCTION_ENV:SESSION_SECRET");
  });
});
