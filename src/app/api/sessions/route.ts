import { getRuntimeDatabase } from "@/server/db/runtime";
import { createSessionRoute } from "./handler";

export async function POST() {
  const { db } = await getRuntimeDatabase();
  return createSessionRoute({
    db,
    secret: process.env.SESSION_SECRET ?? "",
    secure: process.env.NODE_ENV === "production",
    now: () => new Date(),
  })();
}
