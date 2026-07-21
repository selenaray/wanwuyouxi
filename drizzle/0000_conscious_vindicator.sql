CREATE TABLE "anonymous_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "anonymous_sessions_public_id_hash_unique" UNIQUE("public_id_hash")
);
--> statement-breakpoint
CREATE TABLE "answer_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_session_id" uuid NOT NULL,
	"selected_answer_index" integer NOT NULL,
	"correct" boolean NOT NULL,
	"attempt_number" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"private_payload" jsonb NOT NULL,
	"judge_degraded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cases_job_id_unique" UNIQUE("job_id")
);
--> statement-breakpoint
CREATE TABLE "game_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"opened_clue_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"first_answer_correct" boolean,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"image_asset_id" uuid NOT NULL,
	"image_sha256" varchar(64) NOT NULL,
	"idempotency_key" varchar(80) NOT NULL,
	"status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"lease_owner" varchar(100),
	"lease_expires_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"error_code" varchar(80),
	"trace_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "image_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"delete_after" timestamp with time zone NOT NULL,
	"deletion_requested_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "image_assets_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "model_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"provider" varchar(40) NOT NULL,
	"model" varchar(80) NOT NULL,
	"purpose" varchar(40) NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"latency_ms" integer NOT NULL,
	"estimated_cost_cny" real,
	"success" boolean NOT NULL,
	"error_code" varchar(80),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "answer_attempts" ADD CONSTRAINT "answer_attempts_game_session_id_game_sessions_id_fk" FOREIGN KEY ("game_session_id") REFERENCES "public"."game_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_job_id_generation_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."generation_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_session_id_anonymous_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."anonymous_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_session_id_anonymous_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."anonymous_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_session_id_anonymous_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."anonymous_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_image_asset_id_image_assets_id_fk" FOREIGN KEY ("image_asset_id") REFERENCES "public"."image_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_assets" ADD CONSTRAINT "image_assets_session_id_anonymous_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."anonymous_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_calls" ADD CONSTRAINT "model_calls_job_id_generation_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."generation_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "game_sessions_case_session_idx" ON "game_sessions" USING btree ("case_id","session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "generation_jobs_idempotency_idx" ON "generation_jobs" USING btree ("session_id","image_sha256","idempotency_key");--> statement-breakpoint
CREATE INDEX "generation_jobs_lease_idx" ON "generation_jobs" USING btree ("status","lease_expires_at");--> statement-breakpoint
CREATE INDEX "image_assets_expiry_idx" ON "image_assets" USING btree ("delete_after");--> statement-breakpoint
CREATE INDEX "model_calls_job_idx" ON "model_calls" USING btree ("job_id");