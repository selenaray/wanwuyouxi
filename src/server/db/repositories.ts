import { and, asc, eq, isNull, lt, or } from "drizzle-orm";

import { toPlayerCase, type JobStatus, type PrivateCase } from "@/server/cases/contracts";

import type { AppDatabase } from "./client";
import { answerAttempts, cases, gameSessions, generationJobs, imageAssets } from "./schema";

const allowedTransitions: Record<JobStatus, readonly JobStatus[]> = {
  PENDING: ["PROCESSING"],
  PROCESSING: ["VALIDATING", "RETRYABLE_FAILED", "REJECTED", "FAILED"],
  VALIDATING: ["SUCCEEDED", "RETRYABLE_FAILED", "REJECTED", "FAILED"],
  SUCCEEDED: [],
  RETRYABLE_FAILED: ["PENDING"],
  REJECTED: [],
  FAILED: [],
};

type CreateGenerationJobInput = {
  sessionId: string;
  imageAssetId: string;
  imageSha256: string;
  idempotencyKey: string;
};

export class GenerationJobRepository {
  constructor(private readonly db: AppDatabase) {}

  async createGenerationJob(input: CreateGenerationJobInput) {
    const [created] = await this.db
      .insert(generationJobs)
      .values(input)
      .onConflictDoNothing({
        target: [
          generationJobs.sessionId,
          generationJobs.imageSha256,
          generationJobs.idempotencyKey,
        ],
      })
      .returning();

    if (created) return created;

    const [existing] = await this.db
      .select()
      .from(generationJobs)
      .where(
        and(
          eq(generationJobs.sessionId, input.sessionId),
          eq(generationJobs.imageSha256, input.imageSha256),
          eq(generationJobs.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);

    if (!existing) throw new Error("JOB_DEDUPLICATION_FAILED");
    return existing;
  }

  async transitionJob(id: string, nextStatus: JobStatus, errorCode?: string | null) {
    const [current] = await this.db
      .select({ status: generationJobs.status })
      .from(generationJobs)
      .where(eq(generationJobs.id, id))
      .limit(1);

    if (!current) throw new Error("JOB_NOT_FOUND");
    if (!allowedTransitions[current.status].includes(nextStatus)) {
      throw new Error("INVALID_JOB_TRANSITION");
    }

    const [updated] = await this.db
      .update(generationJobs)
      .set({
        status: nextStatus,
        updatedAt: new Date(),
        ...(errorCode !== undefined ? { errorCode } : {}),
      })
      .where(and(eq(generationJobs.id, id), eq(generationJobs.status, current.status)))
      .returning();

    if (!updated) throw new Error("JOB_TRANSITION_CONFLICT");
    return updated;
  }

  async getJob(id: string) {
    const [job] = await this.db
      .select()
      .from(generationJobs)
      .where(eq(generationJobs.id, id))
      .limit(1);
    return job ?? null;
  }

  async getJobWithImage(id: string) {
    const [job] = await this.db
      .select({
        id: generationJobs.id,
        sessionId: generationJobs.sessionId,
        status: generationJobs.status,
        traceId: generationJobs.traceId,
        storageKey: imageAssets.storageKey,
        imageWidth: imageAssets.width,
        imageHeight: imageAssets.height,
      })
      .from(generationJobs)
      .innerJoin(imageAssets, eq(generationJobs.imageAssetId, imageAssets.id))
      .where(eq(generationJobs.id, id))
      .limit(1);
    return job ?? null;
  }

  async leaseNextJob(workerId: string, now: Date, leaseSeconds: number) {
    return this.db.transaction(async (transaction) => {
      const [candidate] = await transaction
        .select()
        .from(generationJobs)
        .where(
          or(
            eq(generationJobs.status, "PENDING"),
            and(
              eq(generationJobs.status, "PROCESSING"),
              or(isNull(generationJobs.leaseExpiresAt), lt(generationJobs.leaseExpiresAt, now)),
            ),
          ),
        )
        .orderBy(asc(generationJobs.createdAt))
        .limit(1)
        .for("update", { skipLocked: true });

      if (!candidate) return null;

      const leaseExpiresAt = new Date(now.getTime() + leaseSeconds * 1000);
      const [leased] = await transaction
        .update(generationJobs)
        .set({
          status: "PROCESSING",
          leaseOwner: workerId,
          leaseExpiresAt,
          attemptCount: candidate.attemptCount + 1,
          errorCode: null,
          updatedAt: now,
        })
        .where(eq(generationJobs.id, candidate.id))
        .returning();

      return leased ?? null;
    });
  }
}

type PublishCaseInput = {
  jobId: string;
  sessionId: string;
  privateCase: PrivateCase;
  judgeDegraded: boolean;
};

export type AnswerResult =
  | { correct: true; attemptCount: number; completed: true }
  | { correct: false; attemptCount: 1; completed: false; hint: string }
  | { correct: false; attemptCount: 2; completed: true };

export class CaseRepository {
  constructor(private readonly db: AppDatabase) {}

  async publishCase(input: PublishCaseInput) {
    return this.db.transaction(async (transaction) => {
      const [created] = await transaction
        .insert(cases)
        .values({
          jobId: input.jobId,
          sessionId: input.sessionId,
          privatePayload: input.privateCase,
          judgeDegraded: input.judgeDegraded,
        })
        .onConflictDoNothing({ target: cases.jobId })
        .returning();

      const published = created ?? (
        await transaction.select().from(cases).where(eq(cases.jobId, input.jobId)).limit(1)
      )[0];
      if (!published) throw new Error("CASE_PUBLICATION_FAILED");

      await transaction
        .insert(gameSessions)
        .values({ caseId: published.id, sessionId: input.sessionId })
        .onConflictDoNothing({ target: [gameSessions.caseId, gameSessions.sessionId] });

      const [job] = await transaction
        .update(generationJobs)
        .set({ status: "SUCCEEDED", updatedAt: new Date() })
        .where(
          and(
            eq(generationJobs.id, input.jobId),
            eq(generationJobs.status, "VALIDATING"),
          ),
        )
        .returning({ id: generationJobs.id });

      if (!job) {
        const [existingJob] = await transaction
          .select({ status: generationJobs.status })
          .from(generationJobs)
          .where(eq(generationJobs.id, input.jobId))
          .limit(1);
        if (existingJob?.status !== "SUCCEEDED") throw new Error("CASE_PUBLICATION_CONFLICT");
      }

      return published;
    });
  }

  async getPlayerCase(caseId: string, sessionId: string) {
    const [row] = await this.db
      .select({ payload: cases.privatePayload })
      .from(cases)
      .where(and(eq(cases.id, caseId), eq(cases.sessionId, sessionId)))
      .limit(1);

    return row ? toPlayerCase(row.payload) : null;
  }

  async recordAnswer(
    caseId: string,
    sessionId: string,
    selectedAnswerIndex: number,
  ): Promise<AnswerResult> {
    if (![0, 1, 2].includes(selectedAnswerIndex)) throw new Error("INVALID_ANSWER_INDEX");

    return this.db.transaction(async (transaction) => {
      const [game] = await transaction
        .select({
          id: gameSessions.id,
          attemptCount: gameSessions.attemptCount,
          completedAt: gameSessions.completedAt,
          firstAnswerCorrect: gameSessions.firstAnswerCorrect,
          privateCase: cases.privatePayload,
        })
        .from(gameSessions)
        .innerJoin(cases, eq(gameSessions.caseId, cases.id))
        .where(
          and(
            eq(gameSessions.caseId, caseId),
            eq(gameSessions.sessionId, sessionId),
            eq(cases.sessionId, sessionId),
          ),
        )
        .limit(1)
        .for("update");

      if (!game) throw new Error("CASE_NOT_FOUND");
      if (game.completedAt || game.attemptCount >= 2) throw new Error("ANSWER_LIMIT_REACHED");

      const attemptCount = game.attemptCount + 1;
      const correct = selectedAnswerIndex === game.privateCase.correctAnswerIndex;
      const completed = correct || attemptCount === 2;
      const completedAt = completed ? new Date() : null;
      const firstAnswerCorrect = attemptCount === 1 ? correct : game.firstAnswerCorrect;

      await transaction.insert(answerAttempts).values({
        gameSessionId: game.id,
        selectedAnswerIndex,
        correct,
        attemptNumber: attemptCount,
      });
      await transaction
        .update(gameSessions)
        .set({ attemptCount, completedAt, firstAnswerCorrect })
        .where(eq(gameSessions.id, game.id));

      if (correct) return { correct: true, attemptCount, completed: true };
      if (attemptCount === 1) {
        return {
          correct: false,
          attemptCount: 1,
          completed: false,
          hint: game.privateCase.wrongAnswerHint,
        };
      }
      return { correct: false, attemptCount: 2, completed: true };
    });
  }
}
