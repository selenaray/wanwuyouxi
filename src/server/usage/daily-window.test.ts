import { describe, expect, it } from "vitest";

import { startOfShanghaiDay } from "./daily-window";

describe("startOfShanghaiDay", () => {
  it("returns midnight in Asia/Shanghai as a UTC instant", () => {
    expect(startOfShanghaiDay(new Date("2026-07-19T08:30:00.000Z")).toISOString())
      .toBe("2026-07-18T16:00:00.000Z");
  });

  it("moves to the next bucket at Shanghai midnight", () => {
    expect(startOfShanghaiDay(new Date("2026-07-19T16:00:00.000Z")).toISOString())
      .toBe("2026-07-19T16:00:00.000Z");
  });
});
