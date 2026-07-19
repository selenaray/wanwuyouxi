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

export async function GET() {
  const { db } = await getRuntimeDatabase();
  return createHealthRoute(async () => {
    await db.execute(sql`select 1`);
  })();
}
