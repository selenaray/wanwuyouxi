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

  it("varies the displayed correct-answer position even when the compiler returns the same liar", async () => {
    const traceIds = [
      "00000000-0000-4000-8000-000000000000",
      "01000000-0000-4000-8000-000000000000",
      "02000000-0000-4000-8000-000000000000",
    ];
    const results = await Promise.all(traceIds.map((traceId) =>
      generateStatelessCase({
        imageUrl: "data:image/jpeg;base64,AA==",
        imageWidth: 1200,
        imageHeight: 900,
        traceId,
      }, {
        vision: new FakeVisionObservationProvider(),
        compiler: new FakeCaseFactbookCompiler(),
        judge: new FakeCaseFactbookJudge(),
      })));

    expect(new Set(results.map((result) => result.correctAnswerIndex))).toEqual(new Set([0, 1, 2]));
    expect(results.map((result) => result.case.suspects[result.correctAnswerIndex].name))
      .toEqual(["江野", "江野", "江野"]);
  });

  it("falls back to an observation-grounded case when live factbook generation fails", async () => {
    let compileCalls = 0;
    const result = await generateStatelessCase({
      imageUrl: "data:image/jpeg;base64,AA==",
      imageWidth: 1200,
      imageHeight: 900,
      traceId: "trace-demo",
    }, {
      vision: new FakeVisionObservationProvider(),
      compiler: {
        async compileCase() {
          compileCalls += 1;
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

    expect(compileCalls).toBe(1);
    expect(result.degraded).toBe(true);
    expect(result.case.title).not.toBe("现场第三处破绽");
    expect(result.case.evidence.map((item) => item.objectName)).toEqual(["台灯", "书本", "杯子"]);
    expect(new Set(result.case.suspects.map((suspect) => suspect.name)).size).toBe(3);
    expect(["台灯", "书本", "杯子"].some((objectName) => result.truth.includes(objectName))).toBe(true);
  });

  it("retries live factbook generation before using the observation fallback", async () => {
    let compileCalls = 0;
    const compiler = new FakeCaseFactbookCompiler();
    const result = await generateStatelessCase({
      imageUrl: "data:image/jpeg;base64,AA==",
      imageWidth: 1200,
      imageHeight: 900,
      traceId: "trace-demo",
    }, {
      vision: new FakeVisionObservationProvider(),
      compiler: {
        async compileCase(input) {
          compileCalls += 1;
          if (compileCalls === 1) throw new ProviderError("BAD_OUTPUT", "DEEPSEEK_FACTBOOK_OUTPUT_INVALID");
          return compiler.compileCase(input);
        },
        async repairCase(input) {
          return compiler.repairCase(input);
        },
      },
      judge: new FakeCaseFactbookJudge(),
      fallbackCompiler: new ObservationFallbackFactbookCompiler(),
      fallbackJudge: new FakeCaseFactbookJudge(),
    });

    expect(compileCalls).toBe(2);
    expect(result.degraded).toBe(false);
    expect(result.truth).toContain("江野移动杯子");
  });

  it("does not always place the fallback correct answer in the third slot", async () => {
    const result = await generateStatelessCase({
      imageUrl: "data:image/jpeg;base64,AA==",
      imageWidth: 1200,
      imageHeight: 900,
      traceId: "trace-demo-alt",
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

    expect(result.correctAnswerIndex).not.toBe(2);
  });
});
