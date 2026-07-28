// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { validObservation } from "@/server/cases/v2-contracts.fixture";

import {
  createQwenObservationProviderFromEnv,
  QwenObservationProvider,
  type QwenObservationRequest,
  type QwenObservationTransport,
} from "./qwen-observation";
import { ProviderError } from "./types";

class CapturingTransport implements QwenObservationTransport {
  lastRequest: QwenObservationRequest | null = null;

  constructor(private readonly content: string) {}

  async create(request: QwenObservationRequest) {
    this.lastRequest = request;
    return { content: this.content };
  }
}

const input = {
  imageUrl: "signed://photo",
  imageWidth: 1200,
  imageHeight: 1600,
  locale: "zh-CN" as const,
  traceId: "trace",
};

describe("QwenObservationProvider", () => {
  it("returns grounded visual facts without story fields", async () => {
    const transport = new CapturingTransport(JSON.stringify(validObservation));
    const provider = new QwenObservationProvider({
      transport,
      model: "qwen3-vl-plus",
      timeoutMs: 30_000,
    });

    const observation = await provider.observeScene(input);

    expect(observation.decision).toBe("PASS");
    expect(observation.visualFacts).toHaveLength(3);
    expect(transport.lastRequest?.messages[0]?.content).toContain("不得生成嫌疑人");
    expect(JSON.stringify(observation)).not.toContain("liarSuspectId");
    expect(transport.lastRequest).toMatchObject({
      enable_thinking: false,
      max_tokens: 2048,
      response_format: { type: "json_object" },
    });
    expect(JSON.stringify(transport.lastRequest)).not.toContain("trace");
  });

  it("normalizes percentage coordinates and confidence", async () => {
    const response = {
      ...validObservation,
      visualFacts: validObservation.visualFacts.map((fact, index) => index === 1
        ? { ...fact, x: "51", y: "55", confidence: "94" }
        : fact),
    };
    const provider = new QwenObservationProvider({
      transport: new CapturingTransport(JSON.stringify(response)),
      model: "qwen3-vl-plus",
      timeoutMs: 30_000,
    });

    const observation = await provider.observeScene(input);

    expect(observation.decision).toBe("PASS");
    expect(observation.visualFacts[1]).toMatchObject({ confidence: 0.94, x: 0.51, y: 0.55 });
  });

  it("clamps plausible model hotspot radii into the playable range", async () => {
    const response = {
      ...validObservation,
      visualFacts: validObservation.visualFacts.map((fact, index) => index === 0
        ? { ...fact, radius: 0.15 }
        : fact),
    };
    const provider = new QwenObservationProvider({
      transport: new CapturingTransport(JSON.stringify(response)),
      model: "qwen3-vl-plus",
      timeoutMs: 30_000,
    });

    const observation = await provider.observeScene(input);

    expect(observation.decision).toBe("PASS");
    expect(observation.visualFacts[0].radius).toBe(0.12);
  });

  it("rewrites model-generated visual fact ids into stable ids", async () => {
    const response = {
      ...validObservation,
      visualFacts: validObservation.visualFacts.map((fact, index) => ({
        ...fact,
        id: ["台灯", "book 2", "杯子#3"][index],
      })),
    };
    const provider = new QwenObservationProvider({
      transport: new CapturingTransport(JSON.stringify(response)),
      model: "qwen3-vl-plus",
      timeoutMs: 30_000,
    });

    const observation = await provider.observeScene(input);

    expect(observation.decision).toBe("PASS");
    expect(observation.visualFacts.map((fact) => fact.id)).toEqual(["vf-1", "vf-2", "vf-3"]);
  });

  it("normalizes a rejection reason returned directly as the decision", async () => {
    const provider = new QwenObservationProvider({
      transport: new CapturingTransport(JSON.stringify({
        decision: "TOO_FEW_OBJECTS",
        sceneSummary: "画面中没有足够的清晰物品",
        riskLabels: [],
        visualFacts: [],
      })),
      model: "qwen3-vl-plus",
      timeoutMs: 30_000,
    });

    await expect(provider.observeScene(input)).resolves.toMatchObject({
      decision: "RETRY",
      reasonCode: "TOO_FEW_OBJECTS",
    });
  });

  it("normalizes a direct unsafe decision into a block result", async () => {
    const provider = new QwenObservationProvider({
      transport: new CapturingTransport(JSON.stringify({
        decision: "UNSAFE",
        sceneSummary: "画面包含敏感内容",
        riskLabels: ["sensitive"],
        visualFacts: [],
      })),
      model: "qwen3-vl-plus",
      timeoutMs: 30_000,
    });

    await expect(provider.observeScene(input)).resolves.toMatchObject({
      decision: "BLOCK",
      reasonCode: "UNSAFE",
    });
  });

  it("uses a longer default timeout when the live timeout env is missing or empty", () => {
    vi.stubEnv("QWEN_API_KEY", "test-key");
    vi.stubEnv("GENERATION_TIMEOUT_MS", "");

    const provider = createQwenObservationProviderFromEnv();

    expect((provider as unknown as { options: { timeoutMs: number } }).options.timeoutMs).toBe(120_000);
    vi.unstubAllEnvs();
  });

  it("uses a dedicated observation timeout instead of the shared generation timeout", () => {
    vi.stubEnv("QWEN_API_KEY", "test-key");
    vi.stubEnv("GENERATION_TIMEOUT_MS", "30000");
    vi.stubEnv("QWEN_OBSERVATION_TIMEOUT_MS", "75000");

    const provider = createQwenObservationProviderFromEnv();

    expect((provider as unknown as { options: { timeoutMs: number } }).options.timeoutMs).toBe(75_000);
    vi.unstubAllEnvs();
  });

  it("uses a dedicated observation endpoint without changing the shared Qwen endpoint", () => {
    vi.stubEnv("QWEN_API_KEY", "test-key");
    vi.stubEnv("QWEN_BASE_URL", "https://shared.example/v1");
    vi.stubEnv("QWEN_OBSERVATION_BASE_URL", "https://vision.example/v1");

    const provider = createQwenObservationProviderFromEnv();
    const transport = (provider as unknown as {
      options: { transport: { client: { baseURL: string } } };
    }).options.transport;

    expect(transport.client.baseURL).toBe("https://vision.example/v1");
    vi.unstubAllEnvs();
  });

  it.each([
    ["x", -1],
    ["x", 101],
    ["y", -1],
    ["y", 101],
    ["confidence", -1],
    ["confidence", 101],
    ["radius", 0],
    ["radius", 101],
  ] as const)("rejects an out-of-range visual fact %s value of %s", async (field, value) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = {
      ...validObservation,
      visualFacts: [{ ...validObservation.visualFacts[0], [field]: value }, ...validObservation.visualFacts.slice(1)],
    };
    const provider = new QwenObservationProvider({
      transport: new CapturingTransport(JSON.stringify(response)),
      model: "qwen3-vl-plus",
      timeoutMs: 30_000,
    });

    await expect(provider.observeScene(input)).rejects.toEqual(
      new ProviderError("BAD_OUTPUT", "QWEN_OBSERVATION_SCHEMA_INVALID"),
    );
    expect(JSON.stringify(log.mock.calls)).toContain(`visualFacts.0.${field}`);
    log.mockRestore();
  });

  it("maps malformed observation output to a schema-invalid provider error", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const provider = new QwenObservationProvider({
      transport: new CapturingTransport(JSON.stringify({ ...validObservation, visualFacts: [] })),
      model: "qwen3-vl-plus",
      timeoutMs: 30_000,
    });

    await expect(provider.observeScene(input)).rejects.toEqual(
      new ProviderError("BAD_OUTPUT", "QWEN_OBSERVATION_SCHEMA_INVALID"),
    );
    expect(JSON.stringify(log.mock.calls)).toContain("QWEN_OBSERVATION_SCHEMA_INVALID");
    expect(JSON.stringify(log.mock.calls)).not.toContain(validObservation.sceneSummary);
    log.mockRestore();
  });
});
