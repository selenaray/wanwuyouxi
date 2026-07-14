import { and, eq } from "drizzle-orm";

import { toPlayerCase } from "@/server/cases/contracts";
import type { AppDatabase } from "@/server/db/client";
import { CaseRepository } from "@/server/db/repositories";
import { cases, gameSessions, imageAssets } from "@/server/db/schema";
import type { ImageStorage } from "@/server/storage";

export class CaseService {
  private readonly repository: CaseRepository;

  constructor(
    private readonly db: AppDatabase,
    private readonly storage: ImageStorage,
  ) {
    this.repository = new CaseRepository(db);
  }

  async getPlayerCase(caseId: string, sessionId: string) {
    const [row] = await this.db
      .select({
        privateCase: cases.privatePayload,
        openedClueIds: gameSessions.openedClueIds,
        attemptCount: gameSessions.attemptCount,
        completedAt: gameSessions.completedAt,
      })
      .from(cases)
      .innerJoin(
        gameSessions,
        and(eq(gameSessions.caseId, cases.id), eq(gameSessions.sessionId, sessionId)),
      )
      .where(and(eq(cases.id, caseId), eq(cases.sessionId, sessionId)))
      .limit(1);

    if (!row) throw new Error("CASE_NOT_FOUND");
    return {
      case: toPlayerCase(row.privateCase),
      progress: {
        openedClueIds: row.openedClueIds,
        attemptCount: row.attemptCount,
        completed: Boolean(row.completedAt),
      },
    };
  }

  submitAnswer(caseId: string, sessionId: string, answerIndex: number) {
    return this.repository.recordAnswer(caseId, sessionId, answerIndex);
  }

  async revealCase(caseId: string, sessionId: string) {
    const [row] = await this.db
      .select({
        privateCase: cases.privatePayload,
        completedAt: gameSessions.completedAt,
        firstAnswerCorrect: gameSessions.firstAnswerCorrect,
      })
      .from(cases)
      .innerJoin(
        gameSessions,
        and(eq(gameSessions.caseId, cases.id), eq(gameSessions.sessionId, sessionId)),
      )
      .where(and(eq(cases.id, caseId), eq(cases.sessionId, sessionId)))
      .limit(1);

    if (!row) throw new Error("CASE_NOT_FOUND");
    if (!row.completedAt) throw new Error("CASE_NOT_COMPLETED");
    return {
      truth: row.privateCase.truth,
      correctAnswerIndex: row.privateCase.correctAnswerIndex,
      firstAnswerCorrect: row.firstAnswerCorrect,
    };
  }

  async deleteImage(imageId: string, sessionId: string) {
    const [image] = await this.db
      .select()
      .from(imageAssets)
      .where(and(eq(imageAssets.id, imageId), eq(imageAssets.sessionId, sessionId)))
      .limit(1);
    if (!image) throw new Error("IMAGE_NOT_FOUND");
    if (image.deletedAt) return;

    const requestedAt = image.deletionRequestedAt ?? new Date();
    await this.db
      .update(imageAssets)
      .set({ deletionRequestedAt: requestedAt })
      .where(eq(imageAssets.id, image.id));
    await this.storage.delete(image.storageKey);
    await this.db
      .update(imageAssets)
      .set({ deletedAt: new Date() })
      .where(eq(imageAssets.id, image.id));
  }

  async isImageDeleted(imageId: string, sessionId: string) {
    const [image] = await this.db
      .select({ deletedAt: imageAssets.deletedAt })
      .from(imageAssets)
      .where(and(eq(imageAssets.id, imageId), eq(imageAssets.sessionId, sessionId)))
      .limit(1);
    if (!image) throw new Error("IMAGE_NOT_FOUND");
    return Boolean(image.deletedAt);
  }
}

