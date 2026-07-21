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

  it("continues draining after one job fails", async () => {
    const runNext = vi
      .fn<() => Promise<boolean>>()
      .mockRejectedValueOnce(new Error("provider failed"))
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const trigger = createInlineGenerationTrigger(runNext);

    await expect(trigger()).resolves.toBeUndefined();
    expect(runNext).toHaveBeenCalledTimes(3);
  });

  it("runs another lease pass when triggered during the final lease attempt", async () => {
    let finishFinalLease: ((worked: boolean) => void) | undefined;
    const finalLease = new Promise<boolean>((resolve) => { finishFinalLease = resolve; });
    const runNext = vi
      .fn<() => Promise<boolean>>()
      .mockReturnValueOnce(finalLease)
      .mockResolvedValueOnce(false);
    const trigger = createInlineGenerationTrigger(runNext);

    const first = trigger();
    await vi.waitFor(() => expect(runNext).toHaveBeenCalledTimes(1));
    const second = trigger();
    finishFinalLease?.(false);

    expect(second).toBe(first);
    await first;
    expect(runNext).toHaveBeenCalledTimes(2);
  });
});
