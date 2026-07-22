import { describe, expect, it } from "vitest";

import {
  FakeCaseFactbookCompiler,
  FakeCaseFactbookJudge,
  FakeVisionObservationProvider,
  ObservationFallbackFactbookCompiler,
} from "@/server/providers";
import { ProviderError } from "@/server/providers/types";

import { generateStatelessCase } from "./stateless";

describe("generateStatelessCase", () => {
  it("returns a playable public case and a local solution without a database", async () => {
    const result = await generateStatelessCase({
      imageUrl: "data:image/jpeg;base64,AA==",
      imageWidth: 1200,
      imageHeight: 900,
      traceId: "trace-demo",
    }, {
      vision: new FakeVisionObservationProvider(),
      compiler: new FakeCaseFactbookCompiler(),
      judge: new FakeCaseFactbookJudge(),
    });

    expect(result.case.suspects).toHaveLength(3);
    expect(result.correctAnswerIndex).toBe(2);
    expect(result.truth).toContain("江野移动杯子");
    expect(JSON.stringify(result.case)).not.toContain("privateAction");
    expect(JSON.stringify(result.case)).not.toContain("liarSuspectId");
  });

  it("falls back to an observation-grounded case when live factbook generation fails", async () => {
    const result = await generateStatelessCase({
      imageUrl: "data:image/jpeg;base64,AA==",
      imageWidth: 1200,
      imageHeight: 900,
      traceId: "trace-demo",
    }, {
      vision: new FakeVisionObservationProvider(),
      compiler: {
        async compileCase() {
          throw new ProviderError("TIMEOUT", "DEEPSEEK_FACTBOOK_TIMEOUT");
        },
        async repairCase() {
          throw new ProviderError("TIMEOUT", "DEEPSEEK_FACTBOOK_TIMEOUT");
        },
      },
      judge: new FakeCaseFactbookJudge(),
      fallbackCompiler: new ObservationFallbackFactbookCompiler(),
      fallbackJudge: new FakeCaseFactbookJudge(),
    });

    expect(result.degraded).toBe(true);
    expect(result.case.evidence.map((item) => item.objectName)).toEqual(["台灯", "书本", "杯子"]);
    expect(result.truth).toContain("杯子");
  });
});
