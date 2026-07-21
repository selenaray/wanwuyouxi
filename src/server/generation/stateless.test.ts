import { describe, expect, it } from "vitest";

import {
  FakeCaseFactbookCompiler,
  FakeCaseFactbookJudge,
  FakeVisionObservationProvider,
} from "@/server/providers";

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
    expect(result.truth).toContain("乔野移动杯子");
    expect(JSON.stringify(result.case)).not.toContain("privateAction");
    expect(JSON.stringify(result.case)).not.toContain("liarSuspectId");
  });
});
