import "dotenv/config";

import { CaseRepository, GenerationJobRepository } from "../src/server/db/repositories";
import { getRuntimeDatabase } from "../src/server/db/runtime";
import { runGenerationJob } from "../src/server/generation/orchestrator";
import { startGenerationWorker } from "../src/server/generation/worker";
import { FakeCaseJudgeProvider, FakeVisionCaseProvider } from "../src/server/providers/fake";
import { getImageStorage } from "../src/server/storage";

const { db } = await getRuntimeDatabase();
const jobs = new GenerationJobRepository(db);
const dependencies = {
  jobs,
  cases: new CaseRepository(db),
  storage: getImageStorage(),
  vision: new FakeVisionCaseProvider(),
  judge: new FakeCaseJudgeProvider(),
};

await startGenerationWorker(`worker-${process.pid}`, {
  jobs,
  runJob: (jobId) => runGenerationJob(jobId, dependencies),
});

