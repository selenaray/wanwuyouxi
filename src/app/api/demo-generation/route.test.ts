// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

import { ProviderError } from "@/server/providers/types";

vi.mock("@/server/generation/stateless", () => ({
  generateStatelessCase: vi.fn(),
}));

vi.mock("@/server/providers", () => ({
  createQwenObservationProviderFromEnv: vi.fn(() => ({ kind: "qwen" })),
  createDeepSeekFactbookCompilerFromEnv: vi.fn(() => ({ kind: "deepseek-compiler" })),
  createDeepSeekFactbookJudgeFromEnv: vi.fn(() => ({ kind: "deepseek-judge" })),
  FakeVisionObservationProvider: vi.fn(() => ({ kind: "fake-vision" })),
  FakeCaseFactbookCompiler: vi.fn(() => ({ kind: "fake-compiler" })),
  FakeCaseFactbookJudge: vi.fn(() => ({ kind: "fake-judge" })),
  ObservationFallbackFactbookCompiler: vi.fn(() => ({ kind: "observation-fallback-compiler" })),
}));

describe("POST /api/demo-generation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("retries live generation once before returning the case", async () => {
    vi.stubEnv("QWEN_API_KEY", "qwen-key");
    vi.stubEnv("DEEPSEEK_API_KEY", "deepseek-key");
    const { generateStatelessCase } = await import("@/server/generation/stateless");
    vi.mocked(generateStatelessCase)
      .mockRejectedValueOnce(new ProviderError("UNAVAILABLE", "QWEN_OBSERVATION_UNAVAILABLE"))
      .mockResolvedValueOnce({
        case: {
          version: 2,
          title: "Live case",
          caseNumber: "CASE-LIVE",
          background: "live",
          objective: "live",
          interactionMode: "HOTSPOT",
          evidence: [],
          suspects: [],
          claims: [],
          wrongAnswerHint: "live",
        },
        correctAnswerIndex: 0,
        truth: "live",
      } as never);
    const { POST } = await import("./route");
    const form = new FormData();
    form.set("image", new File([new Uint8Array([1, 2, 3])], "room.jpg", { type: "image/jpeg" }));

    const response = await POST(new Request("http://test/api/demo-generation", { method: "POST", body: form }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.degraded).toBeUndefined();
    expect(generateStatelessCase).toHaveBeenCalledTimes(2);
  });

  it("runs live scene reconstruction outside the unstable Hong Kong egress", async () => {
    const { preferredRegion } = await import("./route");

    expect(preferredRegion).toBe("sin1");
  });

  it("does not replace live generation failures with fake fallback cases", async () => {
    vi.stubEnv("QWEN_API_KEY", "qwen-key");
    vi.stubEnv("DEEPSEEK_API_KEY", "deepseek-key");
    const { generateStatelessCase } = await import("@/server/generation/stateless");
    vi.mocked(generateStatelessCase)
      .mockRejectedValue(new ProviderError("UNAVAILABLE", "QWEN_OBSERVATION_UNAVAILABLE"));
    const { POST } = await import("./route");
    const form = new FormData();
    form.set("image", new File([new Uint8Array([1, 2, 3])], "room.jpg", { type: "image/jpeg" }));

    const response = await POST(new Request("http://test/api/demo-generation", { method: "POST", body: form }));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("QWEN_OBSERVATION_UNAVAILABLE");
    expect(generateStatelessCase).toHaveBeenCalledTimes(2);
  });

  it("does not restart the full generation pipeline after an observation timeout", async () => {
    vi.stubEnv("QWEN_API_KEY", "qwen-key");
    vi.stubEnv("DEEPSEEK_API_KEY", "deepseek-key");
    const { generateStatelessCase } = await import("@/server/generation/stateless");
    vi.mocked(generateStatelessCase)
      .mockRejectedValue(new ProviderError("TIMEOUT", "QWEN_OBSERVATION_TIMEOUT"));
    const { POST } = await import("./route");
    const form = new FormData();
    form.set("image", new File([new Uint8Array([1, 2, 3])], "room.jpg", { type: "image/jpeg" }));

    const response = await POST(new Request("http://test/api/demo-generation", { method: "POST", body: form }));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.code).toBe("QWEN_OBSERVATION_TIMEOUT");
    expect(generateStatelessCase).toHaveBeenCalledTimes(1);
  });
});
