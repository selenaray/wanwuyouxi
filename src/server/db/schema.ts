import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import type { JobStatus, PrivatePayload } from "@/server/cases/contracts";

const createdAt = timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const anonymousSessions = pgTable("anonymous_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  publicIdHash: varchar("public_id_hash", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt,
});

export const imageAssets = pgTable(
  "image_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").notNull().references(() => anonymousSessions.id),
    storageKey: text("storage_key").notNull().unique(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    deleteAfter: timestamp("delete_after", { withTimezone: true }).notNull(),
    deletionRequestedAt: timestamp("deletion_requested_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt,
  },
  (table) => [index("image_assets_expiry_idx").on(table.deleteAfter)],
);

export const generationJobs = pgTable(
  "generation_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").notNull().references(() => anonymousSessions.id),
    imageAssetId: uuid("image_asset_id").notNull().references(() => imageAssets.id),
    imageSha256: varchar("image_sha256", { length: 64 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 80 }).notNull(),
    status: varchar("status", { length: 32 }).$type<JobStatus>().notNull().default("PENDING"),
    leaseOwner: varchar("lease_owner", { length: 100 }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    attemptCount: integer("attempt_count").notNull().default(0),
    errorCode: varchar("error_code", { length: 80 }),
    traceId: uuid("trace_id").notNull().defaultRandom(),
    createdAt,
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("generation_jobs_idempotency_idx").on(
      table.sessionId,
      table.imageSha256,
      table.idempotencyKey,
    ),
    index("generation_jobs_lease_idx").on(table.status, table.leaseExpiresAt),
  ],
);

export const cases = pgTable("cases", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").notNull().unique().references(() => generationJobs.id),
  sessionId: uuid("session_id").notNull().references(() => anonymousSessions.id),
  privatePayload: jsonb("private_payload").$type<PrivatePayload>().notNull(),
  judgeDegraded: boolean("judge_degraded").notNull().default(false),
  createdAt,
});

export const gameSessions = pgTable(
  "game_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id").notNull().references(() => cases.id),
    sessionId: uuid("session_id").notNull().references(() => anonymousSessions.id),
    openedClueIds: jsonb("opened_clue_ids").$type<string[]>().notNull().default([]),
    attemptCount: integer("attempt_count").notNull().default(0),
    firstAnswerCorrect: boolean("first_answer_correct"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt,
  },
  (table) => [uniqueIndex("game_sessions_case_session_idx").on(table.caseId, table.sessionId)],
);

export const answerAttempts = pgTable("answer_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  gameSessionId: uuid("game_session_id").notNull().references(() => gameSessions.id),
  selectedAnswerIndex: integer("selected_answer_index").notNull(),
  correct: boolean("correct").notNull(),
  attemptNumber: integer("attempt_number").notNull(),
  createdAt,
});

export const modelCalls = pgTable(
  "model_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id").notNull().references(() => generationJobs.id),
    provider: varchar("provider", { length: 40 }).notNull(),
    model: varchar("model", { length: 80 }).notNull(),
    purpose: varchar("purpose", { length: 40 }).notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    latencyMs: integer("latency_ms").notNull(),
    estimatedCostCny: real("estimated_cost_cny"),
    success: boolean("success").notNull(),
    errorCode: varchar("error_code", { length: 80 }),
    createdAt,
  },
  (table) => [index("model_calls_job_idx").on(table.jobId)],
);
