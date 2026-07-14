import { z } from "zod";

import type { PlayerCase } from "./types";

export class GameApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
    readonly traceId?: string,
  ) {
    super(message);
  }
}

const ClueSchema = z.object({
  id: z.string(),
  objectName: z.string(),
  clueText: z.string(),
  regionHint: z.string(),
  x: z.number(),
  y: z.number(),
  radius: z.number().optional(),
  confidence: z.number().optional(),
});

const PlayerCaseSchema: z.ZodType<PlayerCase> = z.object({
  title: z.string(),
  caseNumber: z.string(),
  background: z.string(),
  objective: z.string(),
  interactionMode: z.enum(["HOTSPOT", "CARD_FALLBACK"]).optional(),
  clues: z.tuple([ClueSchema, ClueSchema, ClueSchema]),
  question: z.string(),
  answerOptions: z.tuple([z.string(), z.string(), z.string()]),
  wrongAnswerHint: z.string(),
});

const FailureSchema = z.object({
  ok: z.literal(false),
  error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }),
  traceId: z.string().optional(),
});

async function request<T>(url: string, init: RequestInit, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(url, { ...init, credentials: "same-origin" });
  const body: unknown = await response.json();
  const failure = FailureSchema.safeParse(body);
  if (!response.ok || failure.success) {
    const error = failure.success ? failure.data : null;
    throw new GameApiError(
      error?.error.code ?? "REQUEST_FAILED",
      error?.error.message ?? "请求失败，请重试",
      error?.error.retryable ?? false,
      error?.traceId,
    );
  }
  const success = z.object({ ok: z.literal(true), data: schema, traceId: z.string() }).safeParse(body);
  if (!success.success) throw new GameApiError("INVALID_RESPONSE", "服务返回异常，请重试", true);
  return success.data.data;
}

export function createSession() {
  return request("/api/sessions", { method: "POST" }, z.object({ sessionPublicId: z.string(), expiresAt: z.string() }));
}

export function uploadImage(file: File) {
  const form = new FormData();
  form.set("image", file);
  return request<{ imageId: string; width: number; height: number; expiresAt: string }>(
    "/api/uploads",
    { method: "POST", body: form },
    z.object({ imageId: z.string(), width: z.number(), height: z.number(), expiresAt: z.string() }),
  );
}

export function createGenerationJob(imageId: string, idempotencyKey: string) {
  return request<{ jobId: string; status: string }>("/api/generation-jobs", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
    body: JSON.stringify({ imageId }),
  }, z.object({ jobId: z.string(), status: z.string() }));
}

export function getGenerationJob(jobId: string) {
  return request<{ jobId: string; status: string; caseId: string | null }>(
    `/api/generation-jobs/${encodeURIComponent(jobId)}`,
    { method: "GET" },
    z.object({ jobId: z.string(), status: z.enum(["PENDING", "PROCESSING", "VALIDATING", "SUCCEEDED", "REJECTED", "FAILED"]), caseId: z.string().nullable() }),
  );
}

export function getPlayerCase(caseId: string) {
  return request<{
    case: PlayerCase;
    progress: { openedClueIds: string[]; attemptCount: number; completed: boolean };
  }>(`/api/cases/${encodeURIComponent(caseId)}`, { method: "GET" }, z.object({
    case: PlayerCaseSchema,
    progress: z.object({ openedClueIds: z.array(z.string()), attemptCount: z.number(), completed: z.boolean() }),
  }));
}

export function submitAnswer(caseId: string, answerIndex: number) {
  return request<{
    correct: boolean;
    attemptCount: number;
    completed: boolean;
    hint?: string;
  }>(`/api/cases/${encodeURIComponent(caseId)}/answer`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ answerIndex }),
  }, z.object({ correct: z.boolean(), attemptCount: z.number(), completed: z.boolean(), hint: z.string().optional() }));
}

export function revealCase(caseId: string) {
  return request<{ truth: string; correctAnswerIndex: number; firstAnswerCorrect: boolean | null }>(
    `/api/cases/${encodeURIComponent(caseId)}/reveal`,
    { method: "GET" },
    z.object({ truth: z.string(), correctAnswerIndex: z.number(), firstAnswerCorrect: z.boolean().nullable() }),
  );
}

export function deleteImage(imageId: string) {
  return request<{ deleted: true }>(`/api/images/${encodeURIComponent(imageId)}`, { method: "DELETE" }, z.object({ deleted: z.literal(true) }));
}
