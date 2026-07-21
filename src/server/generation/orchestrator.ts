import type { CaseRepository, GenerationJobRepository } from "@/server/db/repositories";
import type {
  CaseFactbookCompiler,
  CaseFactbookJudge,
  VisionObservationProvider,
} from "@/server/providers/types";
import type { ImageStorage } from "@/server/storage";
import { validateV2Case } from "@/server/cases/v2-validator";
import { ProviderError } from "@/server/providers/types";

type GenerationDependencies = {
  jobs: GenerationJobRepository;
  cases: CaseRepository;
  storage: ImageStorage;
  vision: VisionObservationProvider;
  compiler: CaseFactbookCompiler;
  judge: CaseFactbookJudge;
};

function generationErrorCode(error: unknown) {
  if (error instanceof ProviderError) {
    return /^[A-Z0-9_]{1,80}$/.test(error.message)
      ? error.message
      : `PROVIDER_${error.code}`;
  }
  return "GENERATION_FAILED";
}

export async function runGenerationJob(jobId: string, dependencies: GenerationDependencies) {
  const job = await dependencies.jobs.getJobWithImage(jobId);
  if (!job) throw new Error("JOB_NOT_FOUND");
  if (job.status === "SUCCEEDED" || job.status === "REJECTED" || job.status === "FAILED") return;
  if (job.status !== "PROCESSING") throw new Error("JOB_NOT_LEASED");

  try {
    const observation = await dependencies.vision.observeScene({
      imageUrl: await dependencies.storage.createReadUrl(job.storageKey, 300),
      imageWidth: job.imageWidth,
      imageHeight: job.imageHeight,
      locale: "zh-CN",
      traceId: job.traceId,
    });

    if (observation.decision !== "PASS") {
      await dependencies.jobs.transitionJob(job.id, "REJECTED", observation.reasonCode);
      return;
    }

    const compiled = await dependencies.compiler.compileCase({
      observation,
      traceId: job.traceId,
    });
    await dependencies.jobs.transitionJob(job.id, "VALIDATING");
    const deterministic = validateV2Case(
      compiled,
      observation,
      job.imageWidth / job.imageHeight,
    );
    if (!deterministic.publishable || !deterministic.game) {
      await dependencies.jobs.transitionJob(job.id, "FAILED");
      return;
    }
    let privateCase = deterministic.game;
    const semantic = await dependencies.judge.validateCase({
      game: privateCase,
      traceId: job.traceId,
    });
    if (!semantic.valid) {
      const repaired = await dependencies.compiler.repairCase({
        game: privateCase,
        issues: semantic.issues,
        traceId: job.traceId,
      });
      const repairedValidation = validateV2Case(
        repaired,
        observation,
        job.imageWidth / job.imageHeight,
      );
      if (!repairedValidation.publishable || !repairedValidation.game) {
        await dependencies.jobs.transitionJob(job.id, "FAILED");
        return;
      }
      privateCase = repairedValidation.game;
      const semanticRevalidation = await dependencies.judge.validateCase({
        game: privateCase,
        traceId: job.traceId,
      });
      if (!semanticRevalidation.valid) {
        await dependencies.jobs.transitionJob(job.id, "FAILED");
        return;
      }
    }

    await dependencies.cases.publishCase({
      jobId: job.id,
      sessionId: job.sessionId,
      privateCase: privateCase as unknown as Parameters<
        CaseRepository["publishCase"]
      >[0]["privateCase"],
      judgeDegraded: false,
    });
  } catch (error) {
    const latest = await dependencies.jobs.getJob(job.id);
    if (latest?.status === "PROCESSING" || latest?.status === "VALIDATING") {
      await dependencies.jobs.transitionJob(job.id, "RETRYABLE_FAILED", generationErrorCode(error));
      if (latest.attemptCount < 2) {
        await dependencies.jobs.transitionJob(job.id, "PENDING");
      }
    }
    throw error;
  }
}
