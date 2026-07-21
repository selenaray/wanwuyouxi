import { NextResponse } from "next/server";

import { createAnonymousSession, signSessionCookie } from "@/server/auth/session";
import type { AppDatabase } from "@/server/db/client";

export type SessionRouteDependencies = {
  db: AppDatabase;
  secret: string;
  secure: boolean;
  now: () => Date;
};

export function createSessionRoute(dependencies: SessionRouteDependencies) {
  return async function POST() {
    const traceId = crypto.randomUUID();

    try {
      const session = await createAnonymousSession(dependencies.db, dependencies.now());
      const cookie = await signSessionCookie(session.publicId, dependencies.secret);
      const response = NextResponse.json(
        {
          ok: true,
          data: {
            sessionPublicId: session.publicId,
            expiresAt: session.expiresAt.toISOString(),
          },
          traceId,
        },
        { status: 201 },
      );

      response.cookies.set("wy_session", cookie, {
        httpOnly: true,
        sameSite: "lax",
        secure: dependencies.secure,
        path: "/",
        expires: session.expiresAt,
      });
      return response;
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "SESSION_CREATE_FAILED",
            message: "暂时无法开始体验，请稍后重试",
            retryable: true,
          },
          traceId,
        },
        { status: 500 },
      );
    }
  };
}
