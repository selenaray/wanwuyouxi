import { z } from "zod";

import type { AppDatabase } from "@/server/db/client";
import { cases, generationJobs, modelCalls } from "@/server/db/schema";

const ModelCallSchema = z.object({
  jobId: z.string().uuid(),
  provider: z.enum(["qwen", "deepseek", "fake"]),
  model: z.string().min(1).max(80),
  purpose: z.enum(["VISION", "VALIDATION", "REPAIR"]),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  latencyMs: z.number().int().nonnegative(),
  estimatedCostCny: z.number().nonnegative().optional(),
  success: z.boolean(),
  errorCode: z.string().max(80).optional(),
}).strict();

export type ModelCallMetric = z.infer<typeof ModelCallSchema>;

export async function recordModelCall(db: AppDatabase, value: unknown) {
  const parsed = ModelCallSchema.safeParse(value);
  if (!parsed.success) throw new Error("FORBIDDEN_METRIC_FIELD");
  const [created] = await db.insert(modelCalls).values(parsed.data).returning({ id: modelCalls.id });
  return created;
}

function percentile(values: number[], ratio: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)];
}

function ratio(numerator: number, denominator: number) {
  return denominator === 0 ? 0 : numerator / denominator;
}

export async function getEvaluationSummary(db: AppDatabase) {
  const [jobs, publishedCases, calls] = await Promise.all([
    db.select({ id: generationJobs.id, status: generationJobs.status }).from(generationJobs),
    db.select({ payload: cases.privatePayload }).from(cases),
    db.select({
      jobId: modelCalls.jobId,
      purpose: modelCalls.purpose,
      latencyMs: modelCalls.latencyMs,
      estimatedCostCny: modelCalls.estimatedCostCny,
    }).from(modelCalls),
  ]);

  const successfulJobs = jobs.filter((job) => job.status === "SUCCEEDED");
  const durationsByJob = new Map<string, number>();
  let totalCost = 0;
  const repairJobs = new Set<string>();
  for (const call of calls) {
    durationsByJob.set(call.jobId, (durationsByJob.get(call.jobId) ?? 0) + call.latencyMs);
    totalCost += call.estimatedCostCny ?? 0;
    if (call.purpose === "REPAIR") repairJobs.add(call.jobId);
  }
  const successfulDurations = successfulJobs
    .map((job) => durationsByJob.get(job.id))
    .filter((duration): duration is number => duration !== undefined);
  const hotspotCases = publishedCases.filter((entry) => entry.payload.interactionMode !== "CARD_FALLBACK").length;
  const fallbackCases = publishedCases.filter((entry) => entry.payload.interactionMode === "CARD_FALLBACK").length;

  return {
    totalJobs: jobs.length,
    successfulJobs: successfulJobs.length,
    generationSuccessRate: ratio(successfulJobs.length, jobs.length),
    hotspotUsableRate: ratio(hotspotCases, publishedCases.length),
    fallbackRate: ratio(fallbackCases, publishedCases.length),
    p50DurationMs: percentile(successfulDurations, 0.5),
    p95DurationMs: percentile(successfulDurations, 0.95),
    repairRate: ratio(repairJobs.size, successfulJobs.length),
    averageCostPerSuccessfulGameCny: Number(ratio(totalCost, successfulJobs.length).toFixed(6)),
  };
}
