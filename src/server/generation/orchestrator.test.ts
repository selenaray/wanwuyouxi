// @vitest-environment node

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDatabase, type TestDatabase } from "../../../tests/helpers/database";
import { V2PrivateCaseSchema } from "@/server/cases/v2-contracts";
import { validObservation, validV2Case } from "@/server/cases/v2-contracts.fixture";
import { CaseRepository, GenerationJobRepository } from "@/server/db/repositories";
import { cases as casesTable } from "@/server/db/schema";
import {
  FakeCaseFactbookCompiler,
  FakeCaseFactbookJudge,
  FakeVisionObservationProvider,
} from "@/server/providers/fake";
import { ProviderError } from "@/server/providers/types";
import type {
  CaseFactbookCompiler,
  CaseFactbookJudge,
  VisionObservationProvider,
} from "@/server/providers/types";

import { runGenerationJob } from "./orchestrator";

const signedImageUrl = "signed://private-photo?storageKey=secret&sessionId=private";
const validGame = V2PrivateCaseSchema.parse(validV2Case);

describe("runGenerationJob", () => {
  let database: TestDatabase;

  beforeEach(async () => {
    database = await createTestDatabase();
  });

  afterEach(async () => {
    await database.close();
  });

  async function createLeasedJob(key: string) {
    const sessionId = await database.seedSession();
    const imageAssetId = await database.seedImageAsset(sessionId, `${key}-photo-hash`);
    const jobs = new GenerationJobRepository(database.db);
    const job = await jobs.createGenerationJob({
      sessionId,
      imageAssetId,
      imageSha256: `${key}-photo-hash`,
      idempotencyKey: `${key}-capture`,
    });
    await jobs.leaseNextJob(`worker-${key}`, new Date(), 60);
    return { job, jobs };
  }

  function dependencies(
    jobs: GenerationJobRepository,
    overrides: Partial<{
      vision: VisionObservationProvider;
      compiler: CaseFactbookCompiler;
      judge: CaseFactbookJudge;
    }> = {},
  ) {
    return {
      jobs,
      cases: new CaseRepository(database.db),
      storage: {
        createReadUrl: vi.fn().mockResolvedValue(signedImageUrl),
        put: vi.fn(),
        delete: vi.fn(),
      },
      vision: overrides.vision ?? {
        observeScene: vi.fn().mockResolvedValue(structuredClone(validObservation)),
      },
      compiler: overrides.compiler ?? {
        compileCase: vi.fn().mockResolvedValue(structuredClone(validGame)),
        repairCase: vi.fn().mockResolvedValue(structuredClone(validGame)),
      },
      judge: overrides.judge ?? {
        validateCase: vi.fn().mockResolvedValue({ valid: true, confidence: 0.99, issues: [] }),
      },
    };
  }

  it("observes, compiles, validates, and publishes once without leaking the signed URL", async () => {
    const { job, jobs } = await createLeasedJob("success");
    const vision = new FakeVisionObservationProvider();
    const compiler = new FakeCaseFactbookCompiler();
    const judge = new FakeCaseFactbookJudge();
    const observe = vi.spyOn(vision, "observeScene");
    const compile = vi.spyOn(compiler, "compileCase");
    const semanticJudge = vi.spyOn(judge, "validateCase");
    const deps = dependencies(jobs, { vision, compiler, judge });

    await runGenerationJob(job.id, deps);
    await runGenerationJob(job.id, deps);

    expect(observe).toHaveBeenCalledOnce();
    expect(observe).toHaveBeenCalledWith(expect.objectContaining({
      imageUrl: signedImageUrl,
      traceId: expect.any(String),
    }));
    expect(compile).toHaveBeenCalledWith({
      observation: validObservation,
      traceId: expect.any(String),
    });
    expect(semanticJudge).toHaveBeenCalledOnce();
    expect(semanticJudge).toHaveBeenCalledWith({
      game: validV2Case,
      traceId: expect.any(String),
    });
    expect(observe.mock.invocationCallOrder[0]).toBeLessThan(compile.mock.invocationCallOrder[0]);
    expect(compile.mock.invocationCallOrder[0]).toBeLessThan(
      semanticJudge.mock.invocationCallOrder[0],
    );
    expect(JSON.stringify(compile.mock.calls)).not.toContain("signed://");
    expect(JSON.stringify(semanticJudge.mock.calls)).not.toContain("signed://");
    expect(await jobs.getJob(job.id)).toMatchObject({ status: "SUCCEEDED" });

    const published = await database.db.select().from(casesTable).where(eq(casesTable.jobId, job.id));
    expect(published).toHaveLength(1);
    expect(published[0]?.privatePayload).toEqual(validV2Case);
    expect(published[0]?.judgeDegraded).toBe(false);
  });

  it("rejects an observation before compiling", async () => {
    const { job, jobs } = await createLeasedJob("reject");
    const vision: VisionObservationProvider = {
      observeScene: vi.fn().mockResolvedValue({
        decision: "BLOCK",
        reasonCode: "UNSAFE",
        sceneSummary: "检测到不适合生成的场景",
        riskLabels: ["unsafe"],
        visualFacts: [],
      }),
    };
    const deps = dependencies(jobs, { vision });

    await runGenerationJob(job.id, deps);

    expect(deps.compiler.compileCase).not.toHaveBeenCalled();
    expect(deps.judge.validateCase).not.toHaveBeenCalled();
    expect(await jobs.getJob(job.id)).toMatchObject({ status: "REJECTED", errorCode: "UNSAFE" });
  });

  it("fails a deterministically invalid factbook before semantic judging", async () => {
    const { job, jobs } = await createLeasedJob("invalid");
    const invalidGame = structuredClone(validGame);
    invalidGame.evidence[1].id = invalidGame.evidence[0].id;
    const compiler: CaseFactbookCompiler = {
      compileCase: vi.fn().mockResolvedValue(invalidGame),
      repairCase: vi.fn(),
    };
    const deps = dependencies(jobs, { compiler });

    await runGenerationJob(job.id, deps);

    expect(deps.judge.validateCase).not.toHaveBeenCalled();
    expect(await jobs.getJob(job.id)).toMatchObject({ status: "FAILED" });
    await expect(database.db.select().from(casesTable).where(eq(casesTable.jobId, job.id)))
      .resolves.toHaveLength(0);
  });

  it("repairs at most once and publishes after deterministic and semantic revalidation", async () => {
    const { job, jobs } = await createLeasedJob("repair");
    const issue = { code: "COPY_QUALITY" as const, field: "wrongAnswerHint", message: "提示不具体" };
    const repairedGame = { ...structuredClone(validGame), wrongAnswerHint: "先对照杯底水印与乔野的绝对说法。" };
    const compiler: CaseFactbookCompiler = {
      compileCase: vi.fn().mockResolvedValue(structuredClone(validGame)),
      repairCase: vi.fn().mockResolvedValue(repairedGame),
    };
    const judge: CaseFactbookJudge = {
      validateCase: vi
        .fn()
        .mockResolvedValueOnce({ valid: false, confidence: 0.7, issues: [issue] })
        .mockResolvedValueOnce({ valid: true, confidence: 0.98, issues: [] }),
    };
    const deps = dependencies(jobs, { compiler, judge });

    await runGenerationJob(job.id, deps);

    expect(compiler.repairCase).toHaveBeenCalledOnce();
    expect(compiler.repairCase).toHaveBeenCalledWith({
      game: validV2Case,
      issues: [issue],
      traceId: expect.any(String),
    });
    expect(judge.validateCase).toHaveBeenCalledTimes(2);
    expect(judge.validateCase).toHaveBeenLastCalledWith({
      game: repairedGame,
      traceId: expect.any(String),
    });
    expect(await jobs.getJob(job.id)).toMatchObject({ status: "SUCCEEDED" });
  });

  it("fails instead of repairing twice when semantic revalidation still fails", async () => {
    const { job, jobs } = await createLeasedJob("second-failure");
    const issue = { code: "NON_UNIQUE" as const, field: "truth", message: "推理不唯一" };
    const compiler: CaseFactbookCompiler = {
      compileCase: vi.fn().mockResolvedValue(structuredClone(validGame)),
      repairCase: vi.fn().mockResolvedValue(structuredClone(validGame)),
    };
    const judge: CaseFactbookJudge = {
      validateCase: vi.fn().mockResolvedValue({ valid: false, confidence: 0.4, issues: [issue] }),
    };
    const deps = dependencies(jobs, { compiler, judge });

    await runGenerationJob(job.id, deps);

    expect(compiler.repairCase).toHaveBeenCalledOnce();
    expect(judge.validateCase).toHaveBeenCalledTimes(2);
    expect(await jobs.getJob(job.id)).toMatchObject({ status: "FAILED" });
    await expect(database.db.select().from(casesTable).where(eq(casesTable.jobId, job.id)))
      .resolves.toHaveLength(0);
  });

  it("never publishes a V2 case when semantic judging is unavailable", async () => {
    const { job, jobs } = await createLeasedJob("judge-outage");
    const judge: CaseFactbookJudge = {
      validateCase: vi.fn().mockRejectedValue(new ProviderError("UNAVAILABLE", "temporary")),
    };
    const deps = dependencies(jobs, { judge });

    await expect(runGenerationJob(job.id, deps)).rejects.toMatchObject({ code: "UNAVAILABLE" });

    expect(await jobs.getJob(job.id)).toMatchObject({ status: "PENDING" });
    await expect(database.db.select().from(casesTable).where(eq(casesTable.jobId, job.id)))
      .resolves.toHaveLength(0);
  });
});
