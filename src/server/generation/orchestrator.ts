import type { CaseRepository, GenerationJobRepository } from "@/server/db/repositories";
import type { CaseJudgeProvider, VisionCaseProvider } from "@/server/providers/types";
import type { ImageStorage } from "@/server/storage";

type GenerationDependencies = {
  jobs: GenerationJobRepository;
  cases: CaseRepository;
  storage: ImageStorage;
  vision: VisionCaseProvider;
  judge: CaseJudgeProvider;
};

export async function runGenerationJob(jobId: string, dependencies: GenerationDependencies) {
  const job = await dependencies.jobs.getJobWithImage(jobId);
  if (!job) throw new Error("JOB_NOT_FOUND");
  if (job.status === "SUCCEEDED" || job.status === "REJECTED" || job.status === "FAILED") return;
  if (job.status !== "PROCESSING") throw new Error("JOB_NOT_LEASED");

  try {
    const imageUrl = await dependencies.storage.createReadUrl(job.storageKey, 300);
    const generated = await dependencies.vision.generateCase({
      imageUrl,
      imageWidth: job.imageWidth,
      imageHeight: job.imageHeight,
      locale: "zh-CN",
      traceId: job.traceId,
    });

    if (generated.decision !== "PASS") {
      await dependencies.jobs.transitionJob(job.id, "REJECTED");
      return;
    }

    await dependencies.jobs.transitionJob(job.id, "VALIDATING");
    const validation = await dependencies.judge.validateCase({
      game: generated.game,
      visibleObjectNames: generated.candidates,
      traceId: job.traceId,
    });
    if (!validation.valid) {
      await dependencies.jobs.transitionJob(job.id, "FAILED");
      return;
    }

    await dependencies.cases.publishCase({
      jobId: job.id,
      sessionId: job.sessionId,
      privateCase: generated.game,
      judgeDegraded: false,
    });
  } catch (error) {
    const latest = await dependencies.jobs.getJob(job.id);
    if (latest?.status === "PROCESSING" || latest?.status === "VALIDATING") {
      await dependencies.jobs.transitionJob(job.id, "RETRYABLE_FAILED");
    }
    throw error;
  }
}

