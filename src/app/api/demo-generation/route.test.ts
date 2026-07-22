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

  it("returns a marked fallback case when live generation fails", async () => {
    vi.stubEnv("QWEN_API_KEY", "qwen-key");
    vi.stubEnv("DEEPSEEK_API_KEY", "deepseek-key");
    const { generateStatelessCase } = await import("@/server/generation/stateless");
    vi.mocked(generateStatelessCase)
      .mockRejectedValueOnce(new ProviderError("BAD_OUTPUT", "QWEN_OBSERVATION_SCHEMA_INVALID"))
      .mockResolvedValueOnce({
        case: {
          version: 2,
          title: "Fake fallback case",
          caseNumber: "CASE-FAKE",
          background: "fake",
          objective: "fake",
          interactionMode: "HOTSPOT",
          evidence: [],
          suspects: [],
          claims: [],
          wrongAnswerHint: "fake",
        },
        correctAnswerIndex: 0,
        truth: "fake",
      } as never);
    const { POST } = await import("./route");
    const form = new FormData();
    form.set("image", new File([new Uint8Array([1, 2, 3])], "room.jpg", { type: "image/jpeg" }));

    const response = await POST(new Request("http://test/api/demo-generation", { method: "POST", body: form }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.degraded).toBe(true);
    expect(body.data.degradationReason).toBe("QWEN_OBSERVATION_SCHEMA_INVALID");
    expect(generateStatelessCase).toHaveBeenCalledTimes(2);
  });
});
