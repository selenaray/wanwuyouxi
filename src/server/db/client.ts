import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";

import * as schema from "./schema";

export type AppDatabase = PgliteDatabase<typeof schema>;

export function createLocalDatabase(dataDir = ".data/pglite") {
  const client = new PGlite(dataDir);
  return { client, db: drizzle(client, { schema }) };
}

