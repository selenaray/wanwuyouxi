import type { AppDatabase } from "@/server/db/client";
import { CaseRepository, GenerationJobRepository } from "@/server/db/repositories";
import { runGenerationJob } from "@/server/generation/orchestrator";
import { runWorkerOnce } from "@/server/generation/worker";
import {
  FakeCaseJudgeProvider,
  FakeVisionCaseProvider,
  createDeepSeekCaseJudgeFromEnv,
  createQwenVisionProviderFromEnv,
} from "@/server/providers";
import { getImageStorage } from "@/server/storage";

type RunNextJob = () => Promise<boolean>;

export function createInlineGenerationTrigger(runNextJob: RunNextJob) {
  let running: Promise<void> | undefined;
  let requestedVersion = 0;

  return function trigger() {
    requestedVersion += 1;
    if (running) return running;

    running = (async () => {
      await Promise.resolve();
      let consecutiveFailures = 0;
      let observedVersion: number;
      do {
        observedVersion = requestedVersion;
        while (true) {
          try {
            const worked = await runNextJob();
            consecutiveFailures = 0;
            if (!worked) break;
          } catch {
            consecutiveFailures += 1;
            if (consecutiveFailures >= 3) return;
          }
        }
      } while (observedVersion !== requestedVersion);
    })().finally(() => {
      running = undefined;
    });

    return running;
  };
}

export function createLocalGenerationTrigger(db: AppDatabase) {
  const jobs = new GenerationJobRepository(db);
  const generationDependencies = {
    jobs,
    cases: new CaseRepository(db),
    storage: getImageStorage(),
    vision: process.env.QWEN_API_KEY
      ? createQwenVisionProviderFromEnv()
      : new FakeVisionCaseProvider(),
    judge: process.env.DEEPSEEK_API_KEY
      ? createDeepSeekCaseJudgeFromEnv()
      : new FakeCaseJudgeProvider(),
  };

  return createInlineGenerationTrigger(() =>
    runWorkerOnce(`inline-${process.pid}`, {
      jobs,
      runJob: (jobId) => runGenerationJob(jobId, generationDependencies),
    }),
  );
}
