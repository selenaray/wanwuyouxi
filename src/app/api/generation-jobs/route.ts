import { findSessionByCookie } from "@/server/auth/session";
import { readRuntimeLimits } from "@/server/config/production";
import { getRuntimeDatabase } from "@/server/db/runtime";
import { createLocalGenerationTrigger } from "@/server/generation/inline-worker";
import { createGenerationJobsRoute } from "./handler";

let localGenerationTrigger: ReturnType<typeof createLocalGenerationTrigger> | undefined;

function readCookie(request: Request, name: string) {
  const header = request.headers.get("cookie") ?? "";
  return header.split(";").map((part) => part.trim().split("=")).find(([key]) => key === name)?.slice(1).join("=") ?? null;
}

export async function POST(request: Request) {
  const { db } = await getRuntimeDatabase();
  localGenerationTrigger ??= createLocalGenerationTrigger(db);
  return createGenerationJobsRoute({
    db,
    onJobCreated: () => localGenerationTrigger?.(),
    now: () => new Date(),
    dailyGenerationLimit: readRuntimeLimits(process.env).dailyGenerationLimit,
    resolveSessionId: async (incoming) => {
      const cookie = readCookie(incoming, "wy_session");
      if (!cookie) throw new Error("INVALID_SESSION");
      return (await findSessionByCookie(db, cookie, process.env.SESSION_SECRET ?? "")).id;
    },
  })(request);
}
