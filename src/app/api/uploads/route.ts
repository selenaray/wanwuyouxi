import { findSessionByCookie } from "@/server/auth/session";
import { getRuntimeDatabase } from "@/server/db/runtime";
import { getImageStorage } from "@/server/storage";
import { createUploadRoute } from "./handler";

function readCookie(request: Request, name: string) {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return null;
}

export async function POST(request: Request) {
  const { db } = await getRuntimeDatabase();
  return createUploadRoute({
    db,
    storage: getImageStorage(),
    now: () => new Date(),
    resolveSessionId: async (incoming) => {
      const cookie = readCookie(incoming, "wy_session");
      if (!cookie) throw new Error("INVALID_SESSION");
      const session = await findSessionByCookie(db, cookie, process.env.SESSION_SECRET ?? "");
      return session.id;
    },
  })(request);
}
