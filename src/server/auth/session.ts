import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { eq } from "drizzle-orm";

import type { AppDatabase } from "@/server/db/client";
import { anonymousSessions } from "@/server/db/schema";

const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

function requireSecureSecret(secret: string) {
  if (secret.length < 32) throw new Error("INVALID_SESSION_SECRET");
}

export function hashSessionPublicId(publicId: string) {
  return createHash("sha256").update(publicId).digest("hex");
}

export async function signSessionCookie(publicId: string, secret: string) {
  requireSecureSecret(secret);
  const signature = createHmac("sha256", secret).update(publicId).digest("base64url");
  return `${publicId}.${signature}`;
}

export async function verifySessionCookie(value: string, secret: string) {
  requireSecureSecret(secret);
  const separator = value.lastIndexOf(".");
  if (separator <= 0) throw new Error("INVALID_SESSION");

  const publicId = value.slice(0, separator);
  const supplied = value.slice(separator + 1);
  const expected = createHmac("sha256", secret).update(publicId).digest("base64url");
  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);

  if (
    suppliedBytes.length !== expectedBytes.length ||
    !timingSafeEqual(suppliedBytes, expectedBytes)
  ) {
    throw new Error("INVALID_SESSION");
  }

  if (!/^[0-9a-f-]{36}$/i.test(publicId)) throw new Error("INVALID_SESSION");
  return publicId;
}

export async function createAnonymousSession(db: AppDatabase, now = new Date()) {
  const publicId = crypto.randomUUID();
  const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS);
  const [session] = await db
    .insert(anonymousSessions)
    .values({ publicIdHash: hashSessionPublicId(publicId), expiresAt })
    .returning({ id: anonymousSessions.id });

  return { id: session.id, publicId, expiresAt };
}

export async function findSessionByCookie(
  db: AppDatabase,
  cookieValue: string,
  secret: string,
  now = new Date(),
) {
  const publicId = await verifySessionCookie(cookieValue, secret);
  const [session] = await db
    .select()
    .from(anonymousSessions)
    .where(eq(anonymousSessions.publicIdHash, hashSessionPublicId(publicId)))
    .limit(1);

  if (!session || session.expiresAt <= now) throw new Error("INVALID_SESSION");
  return session;
}

