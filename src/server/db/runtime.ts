import { migrate } from "drizzle-orm/pglite/migrator";

import { createLocalDatabase } from "./client";

let runtimeDatabase: ReturnType<typeof createRuntimeDatabase> | undefined;

async function createRuntimeDatabase() {
  const database = createLocalDatabase(process.env.PGLITE_DATA_DIR ?? ".data/pglite");
  await migrate(database.db, { migrationsFolder: "drizzle" });
  return database;
}

export function getRuntimeDatabase() {
  runtimeDatabase ??= createRuntimeDatabase();
  return runtimeDatabase;
}

