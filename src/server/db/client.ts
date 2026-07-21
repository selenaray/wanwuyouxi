import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { mkdirSync } from "node:fs";

import * as schema from "./schema";

export type AppDatabase = PgliteDatabase<typeof schema>;

export function createLocalDatabase(dataDir = ".data/pglite") {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const client = new PGlite(dataDir);
  return { client, db: drizzle(client, { schema }) };
}
