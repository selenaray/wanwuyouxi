import type { CaseRepository, GenerationJobRepository } from "@/server/db/repositories";
import type { CaseJudgeProvider, VisionCaseProvider } from "@/server/providers/types";
import type { ImageStorage } from "@/server/storage";
import { validateGeneratedCase } from "@/server/cases/validator";
import { ProviderError } from "@/server/providers/types";

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
    const deterministic = validateGeneratedCase(generated, job.imageWidth / job.imageHeight);
    if (!deterministic.publishable || !deterministic.game) {
      await dependencies.jobs.transitionJob(job.id, "FAILED");
      return;
    }
    let privateCase = deterministic.game;
    let judgeDegraded = false;
    try {
      const validation = await dependencies.judge.validateCase({
        game: privateCase,
        visibleObjectNames: generated.candidates,
        traceId: job.traceId,
      });
      if (!validation.valid) {
        if (validation.issues.some((issue) => issue.code === "UNSAFE")) {
          await dependencies.jobs.transitionJob(job.id, "FAILED");
          return;
        }
        const repaired = await dependencies.judge.repairCase({
          game: privateCase,
          issues: validation.issues,
          traceId: job.traceId,
        });
        const repairedValidation = validateGeneratedCase(
          { ...generated, game: repaired },
          job.imageWidth / job.imageHeight,
        );
        if (!repairedValidation.publishable || !repairedValidation.game) {
          await dependencies.jobs.transitionJob(job.id, "FAILED");
          return;
        }
        privateCase = repairedValidation.game;
      }
    } catch (error) {
      if (
        error instanceof ProviderError &&
        error.retryable &&
        generated.logicalConfidence >= 0.9
      ) {
        judgeDegraded = true;
      } else {
        throw error;
      }
    }

    await dependencies.cases.publishCase({
      jobId: job.id,
      sessionId: job.sessionId,
      privateCase,
      judgeDegraded,
    });
  } catch (error) {
    const latest = await dependencies.jobs.getJob(job.id);
    if (latest?.status === "PROCESSING" || latest?.status === "VALIDATING") {
      await dependencies.jobs.transitionJob(job.id, "RETRYABLE_FAILED");
      if (latest.attemptCount < 2) {
        await dependencies.jobs.transitionJob(job.id, "PENDING");
      }
    }
    throw error;
  }
}
