import { z } from "zod";

import type { PlayerCase, V2PlayerCase } from "./types";

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

type ClientRandomSource = {
  randomUUID?: () => string;
  getRandomValues(bytes: Uint8Array): Uint8Array;
};

export function createClientRequestId(source: ClientRandomSource = crypto) {
  if (typeof source.randomUUID === "function") return source.randomUUID();

  const bytes = source.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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
}).strict();

const V1PlayerCaseSchema = z.object({
  title: z.string(),
  caseNumber: z.string(),
  background: z.string(),
  objective: z.string(),
  interactionMode: z.enum(["HOTSPOT", "CARD_FALLBACK"]).optional(),
  clues: z.tuple([ClueSchema, ClueSchema, ClueSchema]),
  question: z.string(),
  answerOptions: z.tuple([z.string(), z.string(), z.string()]),
  wrongAnswerHint: z.string(),
}).strict();

const PortraitKeySchema = z.enum([
  "noir-01", "noir-02", "noir-03", "noir-04", "noir-05", "noir-06",
  "noir-07", "noir-08", "noir-09", "noir-10", "noir-11", "noir-12",
]);

const EvidenceSchema = z.object({
  id: z.string(),
  visualFactId: z.string(),
  suspectId: z.string(),
  objectName: z.string(),
  publicDescription: z.string(),
  regionHint: z.string(),
  x: z.number(),
  y: z.number(),
  radius: z.number(),
  confidence: z.number(),
}).strict();

const SuspectSchema = z.object({
  id: z.string(),
  name: z.string(),
  identity: z.string(),
  relation: z.string(),
  personalityTags: z.tuple([z.string(), z.string()]),
  portraitKey: PortraitKeySchema,
  initialTestimony: z.string(),
}).strict();

const ClaimSchema = z.object({
  id: z.string(),
  suspectId: z.string(),
  text: z.string(),
}).strict();

const V2PlayerCaseSchema = z.object({
  version: z.literal(2),
  title: z.string(),
  caseNumber: z.string(),
  background: z.string(),
  objective: z.string(),
  interactionMode: z.enum(["HOTSPOT", "CARD_FALLBACK"]),
  evidence: z.tuple([EvidenceSchema, EvidenceSchema, EvidenceSchema]),
  suspects: z.tuple([SuspectSchema, SuspectSchema, SuspectSchema]),
  claims: z.tuple([ClaimSchema, ClaimSchema, ClaimSchema]),
  wrongAnswerHint: z.string(),
}).strict();

const PlayerCaseSchema: z.ZodType<PlayerCase> = z.union([
  V2PlayerCaseSchema,
  V1PlayerCaseSchema,
]);

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

export function generateStatelessCase(file: File) {
  const form = new FormData();
  form.set("image", file);
  return request<{
    case: V2PlayerCase;
    correctAnswerIndex: number;
    truth: string;
  }>("/api/demo-generation", { method: "POST", body: form }, z.object({
    case: V2PlayerCaseSchema,
    correctAnswerIndex: z.number().int().min(0).max(2),
    truth: z.string().min(1),
  }));
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
  return request<{ jobId: string; status: string; caseId: string | null; errorCode: string | null }>(
    `/api/generation-jobs/${encodeURIComponent(jobId)}`,
    { method: "GET" },
    z.object({
      jobId: z.string(),
      status: z.enum(["PENDING", "PROCESSING", "VALIDATING", "RETRYABLE_FAILED", "SUCCEEDED", "REJECTED", "FAILED"]),
      caseId: z.string().nullable(),
      errorCode: z.string().nullable().default(null),
    }),
  );
}

type GenerationJobResult = Awaited<ReturnType<typeof getGenerationJob>>;

export async function waitForGenerationJob(
  jobId: string,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<GenerationJobResult> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const intervalMs = options.intervalMs ?? 1_000;
  const deadline = Date.now() + timeoutMs;

  while (true) {
    const job = await getGenerationJob(jobId);
    if (["SUCCEEDED", "REJECTED", "FAILED", "RETRYABLE_FAILED"].includes(job.status)) {
      return job;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new GameApiError("GENERATION_TIMEOUT", "现场重建仍在进行，请稍后重试", true);
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(intervalMs, remaining)));
  }
}

export function getPlayerCase(caseId: string) {
  return request<{
    case: PlayerCase;
    progress: { openedClueIds: string[]; attemptCount: number; completed: boolean };
  }>(`/api/cases/${encodeURIComponent(caseId)}`, { method: "GET" }, z.object({
    case: PlayerCaseSchema,
    progress: z.object({ openedClueIds: z.array(z.string()), attemptCount: z.number(), completed: z.boolean() }).strict(),
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
