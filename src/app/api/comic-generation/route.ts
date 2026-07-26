import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { PORTRAIT_KEYS } from "@/features/game/suspect-roster";
import type { CaseComicStoryboard } from "@/server/comic/storyboard";
import type { PlayerCase } from "@/features/game/types";
import { buildCaseComicStoryboard } from "@/server/comic/storyboard";
import { createQwenImageComicProviderFromEnv } from "@/server/providers";
import { ProviderError } from "@/server/providers/types";

export const maxDuration = 180;

const EvidenceSchema = z.object({
  id: z.string(),
  visualFactId: z.string(),
  suspectId: z.string(),
  objectName: z.string(),
  publicDescription: z.string(),
  regionHint: z.string(),
  x: z.number(),
  y: z.number(),
  radius: z.number(),
  confidence: z.number(),
}).strict();

const SuspectSchema = z.object({
  id: z.string(),
  name: z.string(),
  gender: z.enum(["男", "女"]),
  age: z.number(),
  identity: z.string(),
  relation: z.string(),
  personalityTags: z.tuple([z.string(), z.string()]),
  portraitKey: z.enum(PORTRAIT_KEYS),
  initialTestimony: z.string(),
}).strict();

const ClaimSchema = z.object({
  id: z.string(),
  suspectId: z.string(),
  text: z.string(),
}).strict();

const V2PlayerCaseSchema = z.object({
  version: z.literal(2),
  title: z.string().min(1).max(80),
  caseNumber: z.string().min(1).max(40),
  background: z.string().min(1).max(500),
  objective: z.string().min(1).max(200),
  interactionMode: z.enum(["HOTSPOT", "CARD_FALLBACK"]),
  evidence: z.tuple([EvidenceSchema, EvidenceSchema, EvidenceSchema]),
  suspects: z.tuple([SuspectSchema, SuspectSchema, SuspectSchema]),
  claims: z.tuple([ClaimSchema, ClaimSchema, ClaimSchema]),
  wrongAnswerHint: z.string().min(1).max(200),
}).strict();

const V1PlayerCaseSchema = z.object({
  title: z.string().min(1).max(80),
  caseNumber: z.string().min(1).max(40),
  background: z.string().min(1).max(500),
  objective: z.string().min(1).max(200),
  interactionMode: z.enum(["HOTSPOT", "CARD_FALLBACK"]).optional(),
  clues: z.tuple([
    z.object({ id: z.string(), objectName: z.string(), clueText: z.string(), regionHint: z.string(), x: z.number(), y: z.number(), radius: z.number().optional(), confidence: z.number().optional() }).passthrough(),
    z.object({ id: z.string(), objectName: z.string(), clueText: z.string(), regionHint: z.string(), x: z.number(), y: z.number(), radius: z.number().optional(), confidence: z.number().optional() }).passthrough(),
    z.object({ id: z.string(), objectName: z.string(), clueText: z.string(), regionHint: z.string(), x: z.number(), y: z.number(), radius: z.number().optional(), confidence: z.number().optional() }).passthrough(),
  ]),
  question: z.string().min(1).max(120),
  answerOptions: z.tuple([z.string(), z.string(), z.string()]),
  wrongAnswerHint: z.string().min(1).max(200),
}).strict();

const PlayerCaseSchema: z.ZodType<PlayerCase> = z.union([V2PlayerCaseSchema, V1PlayerCaseSchema]);

const ComicRequestSchema = z.object({
  game: PlayerCaseSchema,
  truth: z.string().min(1).max(1000),
  correctAnswerIndex: z.number().int().min(0).max(2).nullable(),
}).strict();

function errorCode(error: unknown) {
  if (error instanceof ProviderError) return error.message;
  if (error instanceof Error && /^[A-Z0-9_]{1,80}$/.test(error.message)) return error.message;
  return "COMIC_GENERATION_FAILED";
}

function seedNumber(seed: string) {
  return [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function pickVariant<T>(items: readonly T[], seed: string, offset: number) {
  return items[(seedNumber(seed) + offset) % items.length];
}

function buildVariationPrompt(traceId: string) {
  const palettes = [
    "电青色轮廓光、猩红色物证高光、深黑阴影",
    "月光蓝窗边光、琥珀色室内灯、锋利的红色点缀",
    "霓虹洋红反光、冷青色阴影、明亮的物证反光",
    "高反差暖灯、紫色夜影、饱和红色线索点",
  ];
  const staging = [
    "第1格多人现场全景，第2格物证微距特写，第3格越肩动作，第4格侦探复盘",
    "第1格像监控视角，第2格手伸向本案物证，第3格复原后的诡异对称现场，第4格嫌疑人剪影和物理痕迹",
    "第1格房间里的群像张力，第2格物证反光特写，第3格斜线动作构图，第4格嫌疑人面部与物证分屏式呼应",
    "第1格低机位环境镜头，第2格强戏剧手部细节，第3格俯视复原现场，第4格明亮推理瞬间",
  ];
  const speechStyle = [
    "画面里不要出现任何文字，即使是对白或心理活动也不要画出来。",
    "不要画标题、标签、字幕、对白气泡或任何可读文字。",
    "用表情、手部动作、光线和物证痕迹表达心理，不要使用文字。",
  ];

  return [
    `生成变体种子：${traceId}。`,
    `色彩方向：${pickVariant(palettes, traceId, 0)}。`,
    `分镜构图：${pickVariant(staging, traceId, 17)}。`,
    pickVariant(speechStyle, traceId, 31),
    "这次画面必须和之前生成明显不同：镜头距离、人物站位、灯光颜色、物证焦点都要变化，但本案物证和嫌疑人必须保持一致。",
  ].join("\n");
}

function imageUrlWithRenderKey(imageUrl: string, traceId: string) {
  return `${imageUrl.split("#")[0]}#comic-${traceId}`;
}

async function portraitReferenceImages(storyboard: CaseComicStoryboard) {
  if (!storyboard.referencePortraitKey) return [];
  try {
    const portraitPath = join(process.cwd(), "public", "portraits", `${storyboard.referencePortraitKey}.webp`);
    const image = await readFile(portraitPath);
    return [`data:image/webp;base64,${image.toString("base64")}`];
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
  const traceId = crypto.randomUUID();
  try {
    const parsed = ComicRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({
        ok: false,
        error: { code: "INVALID_COMIC_INPUT", message: "漫画生成信息不完整", retryable: false },
        traceId,
      }, { status: 400 });
    }

    const storyboard = buildCaseComicStoryboard(parsed.data);
    const prompt = [
      storyboard.prompt,
      buildVariationPrompt(traceId),
    ].join("\n");
    const image = await createQwenImageComicProviderFromEnv().generate({
      prompt,
      referenceImages: await portraitReferenceImages(storyboard),
    });

    return Response.json({
      ok: true,
      data: {
        ...image,
        imageUrl: imageUrlWithRenderKey(image.imageUrl, traceId),
        panels: storyboard.panels,
        ...(process.env.NODE_ENV === "production" ? {} : {
          debugPrompt: prompt,
          referencePortraitKey: storyboard.referencePortraitKey,
        }),
      },
      traceId,
    });
  } catch (error) {
    const code = errorCode(error);
    return Response.json({
      ok: false,
      error: { code, message: "案件漫画生成失败，请稍后重试", retryable: code !== "QWEN_IMAGE_AUTH_FAILED" },
      traceId,
    }, { status: code === "QWEN_IMAGE_AUTH_FAILED" ? 401 : 503 });
  }
}
