// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "../../../tests/helpers/database";

import type { PrivateCase } from "@/server/cases/contracts";

import { CaseRepository, GenerationJobRepository } from "./repositories";

const privateCase: PrivateCase = {
  title: "消失的借阅卡",
  caseNumber: "WY-001",
  background: "闭馆前，一张借阅卡从桌面消失。",
  objective: "找出最后移动借阅卡的人。",
  interactionMode: "HOTSPOT",
  clues: [
    { id: "lamp", objectName: "台灯", clueText: "灯罩仍有余温。", regionHint: "桌面左侧", x: 0.2, y: 0.3, radius: 0.08, confidence: 0.95 },
    { id: "book", objectName: "书", clueText: "书页夹着一张新折痕。", regionHint: "桌面中央", x: 0.5, y: 0.5, radius: 0.08, confidence: 0.94 },
    { id: "cup", objectName: "杯子", clueText: "杯底压着半圈水印。", regionHint: "桌面右侧", x: 0.8, y: 0.6, radius: 0.08, confidence: 0.93 },
  ],
  question: "谁最后移动了借阅卡？",
  answerOptions: ["整理书本的人", "关闭台灯的人", "拿走杯子的人"],
  correctAnswerIndex: 2,
  wrongAnswerHint: "把三件物品留下的时间顺序连起来。",
  truth: "杯底的新水印覆盖了卡片原来的灰尘轮廓。",
};

describe("GenerationJobRepository", () => {
  let testDatabase: TestDatabase;
  let repository: GenerationJobRepository;
  let sessionId: string;
  let imageAssetId: string;

  beforeEach(async () => {
    testDatabase = await createTestDatabase();
    repository = new GenerationJobRepository(testDatabase.db);
    sessionId = await testDatabase.seedSession();
    imageAssetId = await testDatabase.seedImageAsset(sessionId, "photo-hash");
  });

  afterEach(async () => {
    await testDatabase.close();
  });

  it("deduplicates an active job by session, image hash, and idempotency key", async () => {
    const input = {
      sessionId,
      imageAssetId,
      imageSha256: "photo-hash",
      idempotencyKey: "capture-1",
    };

    const first = await repository.createGenerationJob(input);
    const second = await repository.createGenerationJob(input);

    expect(second.id).toBe(first.id);
  });

  it("does not move a terminal job backwards", async () => {
    const job = await repository.createGenerationJob({
      sessionId,
      imageAssetId,
      imageSha256: "photo-hash",
      idempotencyKey: "capture-2",
    });
    await repository.transitionJob(job.id, "PROCESSING");
    await repository.transitionJob(job.id, "VALIDATING");
    await repository.transitionJob(job.id, "SUCCEEDED");

    await expect(repository.transitionJob(job.id, "PROCESSING")).rejects.toThrow(
      "INVALID_JOB_TRANSITION",
    );
  });

  it("lets another worker reclaim an expired lease", async () => {
    const job = await repository.createGenerationJob({
      sessionId,
      imageAssetId,
      imageSha256: "photo-hash",
      idempotencyKey: "capture-3",
    });

    const first = await repository.leaseNextJob(
      "worker-a",
      new Date("2026-07-13T00:00:00.000Z"),
      60,
    );
    const second = await repository.leaseNextJob(
      "worker-b",
      new Date("2026-07-13T00:02:00.000Z"),
      60,
    );

    expect(first?.id).toBe(job.id);
    expect(second?.id).toBe(job.id);
    expect(second?.leaseOwner).toBe("worker-b");
  });
});

describe("CaseRepository", () => {
  let testDatabase: TestDatabase;
  let jobs: GenerationJobRepository;
  let cases: CaseRepository;
  let sessionId: string;
  let jobId: string;

  beforeEach(async () => {
    testDatabase = await createTestDatabase();
    jobs = new GenerationJobRepository(testDatabase.db);
    cases = new CaseRepository(testDatabase.db);
    sessionId = await testDatabase.seedSession();
    const imageAssetId = await testDatabase.seedImageAsset(sessionId, "case-photo-hash");
    const job = await jobs.createGenerationJob({
      sessionId,
      imageAssetId,
      imageSha256: "case-photo-hash",
      idempotencyKey: "case-capture",
    });
    await jobs.transitionJob(job.id, "PROCESSING");
    await jobs.transitionJob(job.id, "VALIDATING");
    jobId = job.id;
  });

  afterEach(async () => {
    await testDatabase.close();
  });

  it("publishes a player view without the answer or truth", async () => {
    const published = await cases.publishCase({ jobId, sessionId, privateCase, judgeDegraded: false });
    const player = await cases.getPlayerCase(published.id, sessionId);

    expect(player).not.toHaveProperty("correctAnswerIndex");
    expect(player).not.toHaveProperty("truth");
    expect(player?.title).toBe(privateCase.title);
  });

  it("allows at most two server-authoritative answer attempts", async () => {
    const published = await cases.publishCase({ jobId, sessionId, privateCase, judgeDegraded: false });

    const first = await cases.recordAnswer(published.id, sessionId, 0);
    const second = await cases.recordAnswer(published.id, sessionId, 1);

    expect(first).toEqual({ correct: false, attemptCount: 1, completed: false, hint: privateCase.wrongAnswerHint });
    expect(second).toEqual({ correct: false, attemptCount: 2, completed: true });
    await expect(cases.recordAnswer(published.id, sessionId, 2)).rejects.toThrow("ANSWER_LIMIT_REACHED");
  });
});
