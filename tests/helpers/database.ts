import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";

import * as schema from "@/server/db/schema";

export type TestDatabase = {
  db: PgliteDatabase<typeof schema>;
  client: PGlite;
  seedSession(): Promise<string>;
  seedImageAsset(sessionId: string, sha256: string): Promise<string>;
  close(): Promise<void>;
};

export async function createTestDatabase(): Promise<TestDatabase> {
  const client = new PGlite();
  await client.exec(`
    CREATE TABLE anonymous_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      public_id_hash varchar(64) NOT NULL UNIQUE,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE image_assets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id uuid NOT NULL REFERENCES anonymous_sessions(id),
      storage_key text NOT NULL UNIQUE,
      sha256 varchar(64) NOT NULL,
      width integer NOT NULL,
      height integer NOT NULL,
      delete_after timestamptz NOT NULL,
      deletion_requested_at timestamptz,
      deleted_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE generation_jobs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id uuid NOT NULL REFERENCES anonymous_sessions(id),
      image_asset_id uuid NOT NULL REFERENCES image_assets(id),
      image_sha256 varchar(64) NOT NULL,
      idempotency_key varchar(80) NOT NULL,
      status varchar(32) NOT NULL DEFAULT 'PENDING',
      lease_owner varchar(100),
      lease_expires_at timestamptz,
      attempt_count integer NOT NULL DEFAULT 0,
      error_code varchar(80),
      trace_id uuid NOT NULL DEFAULT gen_random_uuid(),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (session_id, image_sha256, idempotency_key)
    );
    CREATE TABLE cases (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      job_id uuid NOT NULL UNIQUE REFERENCES generation_jobs(id),
      session_id uuid NOT NULL REFERENCES anonymous_sessions(id),
      private_payload jsonb NOT NULL,
      judge_degraded boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE game_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      case_id uuid NOT NULL REFERENCES cases(id),
      session_id uuid NOT NULL REFERENCES anonymous_sessions(id),
      opened_clue_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
      attempt_count integer NOT NULL DEFAULT 0,
      first_answer_correct boolean,
      completed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (case_id, session_id)
    );
    CREATE TABLE answer_attempts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      game_session_id uuid NOT NULL REFERENCES game_sessions(id),
      selected_answer_index integer NOT NULL,
      correct boolean NOT NULL,
      attempt_number integer NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const db = drizzle(client, { schema });

  return {
    client,
    db,
    async seedSession() {
      const [row] = await db
        .insert(schema.anonymousSessions)
        .values({
          publicIdHash: crypto.randomUUID().replaceAll("-", "").padEnd(64, "0"),
          expiresAt: new Date("2026-07-20T00:00:00.000Z"),
        })
        .returning({ id: schema.anonymousSessions.id });
      return row.id;
    },
    async seedImageAsset(sessionId, sha256) {
      const [row] = await db
        .insert(schema.imageAssets)
        .values({
          sessionId,
          storageKey: `tests/${crypto.randomUUID()}.jpg`,
          sha256,
          width: 1200,
          height: 900,
          deleteAfter: new Date("2026-07-14T00:00:00.000Z"),
        })
        .returning({ id: schema.imageAssets.id });
      return row.id;
    },
    close: () => client.close(),
  };
}
