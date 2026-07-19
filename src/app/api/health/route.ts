import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getRuntimeDatabase } from "@/server/db/runtime";

export function createHealthRoute(checkDatabase: () => Promise<void>) {
  return async function GET() {
    try {
      await checkDatabase();
      return NextResponse.json({ ok: true }, { status: 200 });
    } catch {
      return NextResponse.json({ ok: false }, { status: 503 });
    }
  };
}

export function createRuntimeHealthRoute(
  loadDatabase: typeof getRuntimeDatabase = getRuntimeDatabase,
) {
  return createHealthRoute(async () => {
    const { db } = await loadDatabase();
    await db.execute(sql`select 1`);
  });
}

export const GET = createRuntimeHealthRoute();
