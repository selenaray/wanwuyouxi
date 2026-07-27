import { z } from "zod";

export const maxDuration = 30;

const DownloadRequestSchema = z.object({
  imageUrl: z.string().url(),
}).strict();

function isAllowedComicHost(hostname: string) {
  return /^dashscope[a-z0-9-]*\.oss(?:-[a-z0-9-]+)?\.aliyuncs\.com$/i.test(hostname);
}

export async function POST(request: Request) {
  const parsed = DownloadRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ ok: false, error: "INVALID_COMIC_URL" }, { status: 400 });
  }

  const source = new URL(parsed.data.imageUrl);
  if (source.protocol !== "https:" || !isAllowedComicHost(source.hostname)) {
    return Response.json({ ok: false, error: "COMIC_HOST_NOT_ALLOWED" }, { status: 400 });
  }
  source.hash = "";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const upstream = await fetch(source, { signal: controller.signal, cache: "no-store" });
    const contentType = upstream.headers.get("content-type") ?? "";
    if (!upstream.ok || !contentType.startsWith("image/")) {
      return Response.json({ ok: false, error: "COMIC_DOWNLOAD_UNAVAILABLE" }, { status: 502 });
    }

    return new Response(await upstream.arrayBuffer(), {
      headers: {
        "cache-control": "private, no-store",
        "content-disposition": 'attachment; filename="wanwuyouxi-comic.png"',
        "content-type": contentType,
      },
    });
  } catch {
    return Response.json({ ok: false, error: "COMIC_DOWNLOAD_UNAVAILABLE" }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
