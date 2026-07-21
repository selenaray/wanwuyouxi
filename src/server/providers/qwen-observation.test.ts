// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { validObservation } from "@/server/cases/v2-contracts.fixture";

import {
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
