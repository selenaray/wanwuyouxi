import "dotenv/config";

import { CaseRepository, GenerationJobRepository } from "../src/server/db/repositories";
import { getRuntimeDatabase } from "../src/server/db/runtime";
import { runGenerationJob } from "../src/server/generation/orchestrator";
import { startGenerationWorker } from "../src/server/generation/worker";
import {
  FakeCaseFactbookCompiler,
  FakeCaseFactbookJudge,
  FakeVisionObservationProvider,
} from "../src/server/providers/fake";
import { createDeepSeekFactbookCompilerFromEnv } from "../src/server/providers/deepseek-compiler";
import { createDeepSeekFactbookJudgeFromEnv } from "../src/server/providers/deepseek-factbook-judge";
import { createQwenObservationProviderFromEnv } from "../src/server/providers/qwen-observation";
import { getImageStorage } from "../src/server/storage";

async function main() {
  const { db } = await getRuntimeDatabase();
  const jobs = new GenerationJobRepository(db);
  const dependencies = {
    jobs,
    cases: new CaseRepository(db),
    storage: getImageStorage(),
    vision: process.env.QWEN_API_KEY
      ? createQwenObservationProviderFromEnv()
      : new FakeVisionObservationProvider(),
    compiler: process.env.DEEPSEEK_API_KEY
      ? createDeepSeekFactbookCompilerFromEnv()
      : new FakeCaseFactbookCompiler(),
    judge: process.env.DEEPSEEK_API_KEY
      ? createDeepSeekFactbookJudgeFromEnv()
      : new FakeCaseFactbookJudge(),
  };

  await startGenerationWorker(`worker-${process.pid}`, {
    jobs,
    runJob: (jobId) => runGenerationJob(jobId, dependencies),
  });
}

void main().catch(() => {
  console.error("generation worker failed to start");
  process.exitCode = 1;
});
