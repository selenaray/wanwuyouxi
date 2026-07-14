import { createHash } from "node:crypto";

import { NextResponse } from "next/server";
import sharp from "sharp";

import { findSessionByCookie } from "@/server/auth/session";
import type { AppDatabase } from "@/server/db/client";
import { getRuntimeDatabase } from "@/server/db/runtime";
import { imageAssets } from "@/server/db/schema";
import { getImageStorage, type ImageStorage } from "@/server/storage";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MIN_IMAGE_EDGE = 320;
const PHOTO_TTL_MS = 24 * 60 * 60 * 1000;

type UploadRouteDependencies = {
  db: AppDatabase;
  storage: ImageStorage;
  resolveSessionId(request: Request): Promise<string>;
  now: () => Date;
};

function jsonError(traceId: string, status: number, code: string, message: string, retryable = false) {
  return NextResponse.json(
    { ok: false, error: { code, message, retryable }, traceId },
    { status },
  );
}

function detectImageType(bytes: Uint8Array) {
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.slice(0, 8).every((value, index) =>
    value === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index]);
  const brand = Buffer.from(bytes.slice(8, 12)).toString("ascii");
  const heic = Buffer.from(bytes.slice(4, 8)).toString("ascii") === "ftyp" &&
    ["heic", "heix", "hevc", "mif1"].includes(brand);
  return jpeg ? "jpeg" : png ? "png" : heic ? "heic" : null;
}

export function createUploadRoute(dependencies: UploadRouteDependencies) {
  return async function POST(request: Request) {
    const traceId = crypto.randomUUID();
    let sessionId: string;

    try {
      sessionId = await dependencies.resolveSessionId(request);
    } catch {
      return jsonError(traceId, 401, "UNAUTHORIZED", "请重新开始体验");
    }

    let file: File;
    try {
      const form = await request.formData();
      const value = form.get("image");
      if (!(value instanceof File)) throw new Error("MISSING_IMAGE");
      file = value;
    } catch {
      return jsonError(traceId, 400, "INVALID_IMAGE", "请选择一张有效照片");
    }

    if (file.size === 0 || file.size > MAX_IMAGE_BYTES) {
      return jsonError(traceId, 400, "IMAGE_TOO_LARGE", "照片需小于 5 MB");
    }

    const inputBytes = new Uint8Array(await file.arrayBuffer());
    const detectedType = detectImageType(inputBytes);
    if (!detectedType) {
      return jsonError(traceId, 400, "INVALID_IMAGE", "目前只支持 JPEG、PNG 或 HEIC 照片");
    }

    let sanitized: Buffer;
    let width: number;
    let height: number;
    try {
      const converted = await sharp(inputBytes)
        .rotate()
        .jpeg({ quality: 82 })
        .toBuffer({ resolveWithObject: true });
      sanitized = converted.data;
      width = converted.info.width;
      height = converted.info.height;
    } catch {
      if (detectedType === "heic") {
        return jsonError(traceId, 400, "HEIC_CONVERSION_UNAVAILABLE", "请将照片转换为 JPEG 后重试");
      }
      return jsonError(traceId, 400, "INVALID_IMAGE", "照片无法解析，请重新选择");
    }

    if (width < MIN_IMAGE_EDGE || height < MIN_IMAGE_EDGE || sanitized.byteLength > MAX_IMAGE_BYTES) {
      return jsonError(traceId, 400, "IMAGE_TOO_SMALL", "请使用更清晰的原图");
    }

    const sha256 = createHash("sha256").update(sanitized).digest("hex");
    const expiresAt = new Date(dependencies.now().getTime() + PHOTO_TTL_MS);
    const stored = await dependencies.storage.put({
      bytes: sanitized,
      contentType: "image/jpeg",
      sha256,
    });

    try {
      const [asset] = await dependencies.db
        .insert(imageAssets)
        .values({
          sessionId,
          storageKey: stored.key,
          sha256,
          width,
          height,
          deleteAfter: expiresAt,
        })
        .returning({ id: imageAssets.id });

      return NextResponse.json(
        {
          ok: true,
          data: { imageId: asset.id, width, height, expiresAt: expiresAt.toISOString() },
          traceId,
        },
        { status: 201 },
      );
    } catch {
      await dependencies.storage.delete(stored.key).catch(() => undefined);
      return jsonError(traceId, 500, "UPLOAD_FAILED", "上传失败，请重试", true);
    }
  };
}

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

