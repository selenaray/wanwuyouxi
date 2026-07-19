import { describe, expect, it } from "vitest";

import { readProductionConfig, readRuntimeLimits } from "./production";

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
  APP_DOMAIN: "example.test",
  DAILY_CASE_LIMIT: "3",
  CLEANUP_INTERVAL_MS: "60000",
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

  it("rejects malformed production limits instead of producing NaN", () => {
    expect(() => readProductionConfig({
      ...valid,
      DAILY_CASE_LIMIT: "three",
      CLEANUP_INTERVAL_MS: "fast",
    })).toThrow("INVALID_PRODUCTION_ENV:CLEANUP_INTERVAL_MS,DAILY_CASE_LIMIT");
  });
});

describe("readRuntimeLimits", () => {
  it("provides safe local defaults", () => {
    expect(readRuntimeLimits({})).toEqual({
      dailyGenerationLimit: 3,
      cleanupIntervalMs: 60_000,
    });
  });

  it("rejects values outside the supported ranges", () => {
    expect(() => readRuntimeLimits({
      DAILY_CASE_LIMIT: "0",
      CLEANUP_INTERVAL_MS: "1000",
    })).toThrow("INVALID_RUNTIME_ENV:CLEANUP_INTERVAL_MS,DAILY_CASE_LIMIT");
  });
});
