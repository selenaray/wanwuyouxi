type Options = {
  clean(): Promise<void>;
  intervalMs: number;
};

let stopCurrent: (() => void) | undefined;
let running = false;

export function startCleanupScheduler(options: Options) {
  if (stopCurrent) return stopCurrent;

  async function run() {
    if (running) return;
    running = true;
    try {
      await options.clean();
    } catch {
      console.error("image cleanup failed");
    } finally {
      running = false;
    }
  }

  void run();
  const timer = setInterval(() => void run(), options.intervalMs);
  stopCurrent = () => {
    clearInterval(timer);
    stopCurrent = undefined;
    running = false;
  };
  return stopCurrent;
}

export function resetCleanupSchedulerForTests() {
  stopCurrent?.();
  stopCurrent = undefined;
  running = false;
}
