import { afterEach, describe, expect, it, vi } from "vitest";

import { resetCleanupSchedulerForTests, startCleanupScheduler } from "./cleanup-scheduler";

afterEach(() => {
  resetCleanupSchedulerForTests();
  vi.useRealTimers();
});

describe("startCleanupScheduler", () => {
  it("runs immediately, repeats, and does not start twice", async () => {
    vi.useFakeTimers();
    const clean = vi.fn().mockResolvedValue(undefined);

    startCleanupScheduler({ clean, intervalMs: 60_000 });
    startCleanupScheduler({ clean, intervalMs: 60_000 });
    await vi.runAllTicks();
    expect(clean).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(clean).toHaveBeenCalledTimes(2);
  });
});
