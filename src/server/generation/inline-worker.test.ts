// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { createInlineGenerationTrigger } from "./inline-worker";

describe("inline generation worker", () => {
  it("drains pending jobs and coalesces concurrent triggers", async () => {
    const runNext = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const trigger = createInlineGenerationTrigger(runNext);

    const first = trigger();
    const second = trigger();

    expect(second).toBe(first);
    await first;
    expect(runNext).toHaveBeenCalledTimes(3);
  });
});
