# Wanwuyouxi Backend MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the frontend fixture with a recoverable, server-authoritative photo-to-mystery pipeline using Qwen vision and DeepSeek validation.

**Architecture:** Keep the existing Next.js repository as a modular monolith. Route handlers own HTTP concerns, focused domain modules own validation and game rules, PostgreSQL stores durable state, and a separately started worker claims database-backed generation jobs. Storage and model providers are interfaces with local/fake implementations for tests and Alibaba OSS/Qwen plus DeepSeek implementations for real runs.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.8, Vitest 3, Playwright, Zod, Drizzle ORM, PostgreSQL, Sharp, OpenAI-compatible SDK, Node `tsx` worker.

## Global Constraints

- The complete production flow must be usable from mainland China.
- Use Alibaba Model Studio China (Beijing) `qwen3-vl-plus` in non-thinking JSON mode for vision generation.
- DeepSeek receives case text and visible object names only; it never receives images, signed URLs, object keys, or session identifiers.
- Compress client images to JPEG, longest edge at most 1600 px, and upload at most 5 MB.
- Keep images private; model URLs expire within 5 minutes; delete on request and no later than 24 hours after upload.
- Never log image data, image URLs, object keys, full generated stories, answers, prompts, or API keys.
- Reveal neither `correctAnswerIndex` nor `truth` before server-side completion.
- Allow exactly three clues and at most two answer submissions per game.
- Allow at most two Qwen calls and two DeepSeek calls per generation job.
- The browser may stop waiting after 30 seconds, but the durable worker may finish later and the client must recover by `jobId`.
- Automated tests use fake providers and spend no model quota unless `RUN_LIVE_AI_TESTS=1` is explicitly set.
- Do not commit `.env.local`, uploaded photos, database data, signed URLs, or secrets.

---

## Planned File Structure

```text
src/
  app/api/
    sessions/route.ts
    uploads/route.ts
    generation-jobs/route.ts
    generation-jobs/[jobId]/route.ts
    cases/[caseId]/route.ts
    cases/[caseId]/answer/route.ts
    cases/[caseId]/reveal/route.ts
    images/[imageId]/route.ts
  features/game/
    api-client.ts                 # typed browser calls only
    image-compression.ts          # JPEG/PNG resize, HEIC safe fallback
    game-app.tsx                  # connects existing screens to the API
    types.ts                      # browser-safe state and API types
  server/
    auth/session.ts               # anonymous signed session cookie
    cases/contracts.ts            # Zod schemas and public/private case types
    cases/validator.ts            # deterministic validation
    cases/service.ts              # player view, answer, reveal rules
    db/client.ts                  # PostgreSQL client
    db/schema.ts                  # Drizzle tables and enums
    db/repositories.ts            # durable state access and job leases
    generation/orchestrator.ts    # provider calls, validation, repair, publish
    generation/worker.ts          # polling worker entry point
    generation/cleanup-worker.ts  # expired image deletion entry point
    providers/types.ts            # provider interfaces and unified errors
    providers/fake.ts             # deterministic tests and local fallback
    providers/qwen.ts             # Alibaba Model Studio adapter
    providers/deepseek.ts         # DeepSeek judge adapter
    storage/types.ts              # storage interface
    storage/local.ts              # private local development files
    storage/oss.ts                # Alibaba OSS implementation
    observability/metrics.ts      # metadata-only metrics
drizzle/                          # generated SQL migrations
scripts/worker.ts
scripts/cleanup-worker.ts
tests/fixtures/                   # generated JSON fixtures only; no user photos
```

---

### Task 1: Shared Contracts and Backend Tooling

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`
- Create: `.env.example`
- Create: `src/server/cases/contracts.ts`
- Test: `src/server/cases/contracts.test.ts`

**Interfaces:**
- Produces: `GeneratedCaseSchema`, `PrivateCase`, `PlayerCase`, `GenerationDecision`, `JobStatus`, and `toPlayerCase(privateCase)`.

- [ ] **Step 1: Write the failing contract tests**

```ts
import { describe, expect, it } from "vitest";
import { GeneratedCaseSchema, toPlayerCase } from "./contracts";

const valid = {
  decision: "PASS",
  logicalConfidence: 0.94,
  riskLabels: [],
  candidates: ["台灯", "书", "杯子"],
  game: {
    title: "消失的借阅卡",
    caseNumber: "WY-001",
    background: "闭馆前，一张借阅卡从桌面消失。",
    objective: "找出最后移动借阅卡的人。",
    interactionMode: "HOTSPOT",
    clues: [
      { id: "lamp", objectName: "台灯", clueText: "灯罩仍有余温。", regionHint: "桌面左侧", x: 0.2, y: 0.3, radius: 0.08, confidence: 0.95 },
      { id: "book", objectName: "书", clueText: "书页夹着一张新折痕。", regionHint: "桌面中央", x: 0.5, y: 0.5, radius: 0.08, confidence: 0.94 },
      { id: "cup", objectName: "杯子", clueText: "杯底压着半圈水印。", regionHint: "桌面右侧", x: 0.8, y: 0.6, radius: 0.08, confidence: 0.93 },
    ],
    question: "谁最后移动了借阅卡？",
    answerOptions: ["整理书本的人", "关闭台灯的人", "拿走杯子的人"],
    correctAnswerIndex: 2,
    wrongAnswerHint: "把三件物品留下的时间顺序连起来。",
    truth: "杯底的新水印覆盖了卡片原来的灰尘轮廓。",
  },
} as const;

describe("GeneratedCaseSchema", () => {
  it("accepts the fixed three-clue contract", () => {
    expect(GeneratedCaseSchema.parse(valid).game?.clues).toHaveLength(3);
  });

  it("removes the answer and truth from the player view", () => {
    const player = toPlayerCase(GeneratedCaseSchema.parse(valid).game!);
    expect(player).not.toHaveProperty("correctAnswerIndex");
    expect(player).not.toHaveProperty("truth");
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm vitest run src/server/cases/contracts.test.ts`

Expected: FAIL because `./contracts` does not exist.

- [ ] **Step 3: Install dependencies and add scripts**

Run:

```bash
pnpm add zod drizzle-orm postgres sharp openai ali-oss dotenv
pnpm add -D drizzle-kit tsx
```

Add these scripts to `package.json`:

```json
{
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "worker": "tsx scripts/worker.ts",
  "worker:cleanup": "tsx scripts/cleanup-worker.ts",
  "test:live-ai": "RUN_LIVE_AI_TESTS=1 vitest run src/server/providers/live-ai.test.ts"
}
```

- [ ] **Step 4: Implement the shared contract**

Create Zod schemas using exact-length tuples for three clues and three answers. Define:

```ts
export const JobStatusSchema = z.enum([
  "PENDING", "PROCESSING", "VALIDATING", "SUCCEEDED",
  "RETRYABLE_FAILED", "REJECTED", "FAILED",
]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const GeneratedCaseSchema = z.discriminatedUnion("decision", [
  z.object({
    decision: z.literal("PASS"),
    logicalConfidence: z.number().min(0).max(1),
    riskLabels: z.array(z.string()).max(5),
    candidates: z.array(z.string().min(1).max(12)).min(3).max(8),
    game: PrivateCaseSchema,
  }),
  z.object({
    decision: z.enum(["RETRY", "BLOCK"]),
    reasonCode: z.enum(["TOO_DARK", "BLURRY", "NOT_A_SPACE", "TOO_FEW_OBJECTS", "UNSAFE"]),
    riskLabels: z.array(z.string()).max(5),
    candidates: z.array(z.string().max(12)).max(8),
    game: z.null(),
  }),
]);

export function toPlayerCase(value: PrivateCase): PlayerCase {
  const { correctAnswerIndex: _answer, truth: _truth, ...player } = value;
  return player;
}
```

The private schema must enforce normalized coordinates, radius `0.04..0.12`, confidence `0..1`, bounded Chinese copy, and `interactionMode` of `HOTSPOT | CARD_FALLBACK`.

- [ ] **Step 5: Add safe environment documentation**

Create `.env.example` containing names and non-secret defaults only:

```dotenv
DATABASE_URL=postgres://wanwuyouxi:wanwuyouxi@127.0.0.1:5432/wanwuyouxi
SESSION_SECRET=replace-with-at-least-32-random-characters
IMAGE_STORAGE_DRIVER=local
LOCAL_IMAGE_ROOT=.data/uploads
PHOTO_TTL_HOURS=24
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_API_KEY=
QWEN_VISION_MODEL=qwen3-vl-plus
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-v4-flash
GENERATION_TIMEOUT_MS=30000
JOB_LEASE_SECONDS=60
RUN_LIVE_AI_TESTS=0
OSS_REGION=
OSS_BUCKET=
OSS_ACCESS_KEY_ID=
OSS_ACCESS_KEY_SECRET=
```

Append `.env.local`, `.data/`, and `*.log` to `.gitignore`.

- [ ] **Step 6: Run focused and existing tests**

Run: `pnpm vitest run src/server/cases/contracts.test.ts && pnpm test:run`

Expected: contract tests and all existing frontend tests PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml .gitignore .env.example src/server/cases
git commit -m "feat: define backend case contracts"
```

---

### Task 2: PostgreSQL Schema and Durable Repositories

**Files:**
- Create: `drizzle.config.ts`
- Create: `src/server/db/client.ts`
- Create: `src/server/db/schema.ts`
- Create: `src/server/db/repositories.ts`
- Test: `src/server/db/repositories.test.ts`
- Create: `tests/helpers/database.ts`
- Create: generated `drizzle/*.sql`

**Interfaces:**
- Produces: `createSession()`, `createImageAsset()`, `createGenerationJob()`, `leaseNextJob()`, `transitionJob()`, `publishCase()`, `getPlayerCase()`, and `recordAnswer()`.
- Consumes: `JobStatus` and private/player case types from Task 1.

- [ ] **Step 1: Write repository behavior tests**

Cover these exact cases with a temporary test database:

```ts
it("deduplicates an active job by session, image hash, and idempotency key", async () => {
  const first = await repo.createGenerationJob(input);
  const second = await repo.createGenerationJob(input);
  expect(second.id).toBe(first.id);
});

it("does not move a terminal job backwards", async () => {
  await repo.transitionJob(job.id, "SUCCEEDED");
  await expect(repo.transitionJob(job.id, "PROCESSING")).rejects.toThrow("INVALID_JOB_TRANSITION");
});

it("lets another worker reclaim an expired lease", async () => {
  const first = await repo.leaseNextJob("worker-a", new Date("2026-07-13T00:00:00Z"));
  const second = await repo.leaseNextJob("worker-b", new Date("2026-07-13T00:02:00Z"));
  expect(second?.id).toBe(first?.id);
});
```

- [ ] **Step 2: Run the repository test and confirm it fails**

Run: `pnpm vitest run src/server/db/repositories.test.ts`

Expected: FAIL because database modules do not exist.

- [ ] **Step 3: Define the schema**

Create tables for `anonymous_sessions`, `image_assets`, `generation_jobs`, `cases`, `game_sessions`, `answer_attempts`, and `model_calls`. Store private case JSON only in `cases.private_payload`; never duplicate the answer into the job table. Add unique index `(session_id, image_sha256, idempotency_key)` and job lease fields `lease_owner`, `lease_expires_at`, `attempt_count`.

The transition guard must use:

```ts
const allowed: Record<JobStatus, readonly JobStatus[]> = {
  PENDING: ["PROCESSING"],
  PROCESSING: ["VALIDATING", "RETRYABLE_FAILED", "REJECTED", "FAILED"],
  VALIDATING: ["SUCCEEDED", "RETRYABLE_FAILED", "REJECTED", "FAILED"],
  SUCCEEDED: [],
  RETRYABLE_FAILED: ["PENDING"],
  REJECTED: [],
  FAILED: [],
};
```

- [ ] **Step 4: Generate and apply the migration**

Run:

```bash
pnpm db:generate
pnpm db:migrate
```

Expected: migration completes and creates all seven tables.

- [ ] **Step 5: Implement repositories with conditional updates**

Use transactions for `publishCase()` and `recordAnswer()`. `recordAnswer()` must lock the game session row, reject a third attempt, compare on the server, and return only:

```ts
type AnswerResult =
  | { correct: true; attemptCount: number; completed: true }
  | { correct: false; attemptCount: 1; completed: false; hint: string }
  | { correct: false; attemptCount: 2; completed: true };
```

- [ ] **Step 6: Run migrations and repository tests**

Run: `pnpm db:migrate && pnpm vitest run src/server/db/repositories.test.ts`

Expected: all repository tests PASS.

- [ ] **Step 7: Commit**

```bash
git add drizzle.config.ts drizzle src/server/db tests/helpers/database.ts
git commit -m "feat: add durable generation data model"
```

---

### Task 3: Anonymous Session Boundary

**Files:**
- Create: `src/server/auth/session.ts`
- Create: `src/app/api/sessions/route.ts`
- Test: `src/server/auth/session.test.ts`
- Test: `src/app/api/sessions/route.test.ts`

**Interfaces:**
- Produces: `getOrCreateSession(requestHeaders)`, `requireSession(requestHeaders)`, and `POST /api/sessions`.

- [ ] **Step 1: Write session tests**

```ts
it("sets an HttpOnly SameSite=Lax anonymous cookie", async () => {
  const response = await POST(new Request("http://test/api/sessions", { method: "POST" }));
  const cookie = response.headers.get("set-cookie") ?? "";
  expect(cookie).toContain("HttpOnly");
  expect(cookie).toContain("SameSite=Lax");
});

it("rejects a modified signed cookie", async () => {
  await expect(verifySessionCookie("changed.payload")).rejects.toThrow("INVALID_SESSION");
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm vitest run src/server/auth/session.test.ts src/app/api/sessions/route.test.ts`

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement signed opaque sessions**

Generate a random public ID with `crypto.randomUUID()`, store its SHA-256 hash in PostgreSQL, and sign the public ID with HMAC-SHA256 using `SESSION_SECRET`. Cookie name: `wy_session`; max age: 7 days; `secure` only outside local development. Never store model or game data in the cookie.

- [ ] **Step 4: Implement the route response**

Return:

```ts
{ ok: true, data: { sessionPublicId, expiresAt }, traceId }
```

Use the shared error envelope for all failures:

```ts
{ ok: false, error: { code, message, retryable }, traceId }
```

- [ ] **Step 5: Run tests and commit**

Run: `pnpm vitest run src/server/auth src/app/api/sessions`

Expected: PASS.

```bash
git add src/server/auth src/app/api/sessions
git commit -m "feat: add anonymous backend sessions"
```

---

### Task 4: Private Image Upload and Storage Adapters

**Files:**
- Create: `src/server/storage/types.ts`
- Create: `src/server/storage/local.ts`
- Create: `src/server/storage/oss.ts`
- Create: `src/server/storage/index.ts`
- Create: `src/app/api/uploads/route.ts`
- Test: `src/server/storage/local.test.ts`
- Test: `src/app/api/uploads/route.test.ts`

**Interfaces:**
- Produces: `ImageStorage.put()`, `createReadUrl()`, `delete()`, `POST /api/uploads`.
- Upload response: `{ imageId, width, height, expiresAt }`; never return a file path, object key, or model URL.

- [ ] **Step 1: Write failing storage and upload tests**

Test JPEG success plus invalid magic bytes, unsupported MIME, dimensions below 320 px, more than 5 MB, unauthenticated request, and path traversal. Assert stored filenames are generated UUIDs rather than client names.

```ts
it("does not expose the storage key in the response", async () => {
  const body = await uploadValidJpeg();
  expect(JSON.stringify(body)).not.toContain(".data/uploads");
  expect(body.data).not.toHaveProperty("storageKey");
});
```

- [ ] **Step 2: Verify tests fail**

Run: `pnpm vitest run src/server/storage src/app/api/uploads`

Expected: FAIL because storage modules do not exist.

- [ ] **Step 3: Implement the storage interface**

```ts
export interface ImageStorage {
  put(input: { bytes: Uint8Array; contentType: "image/jpeg"; sha256: string }): Promise<{ key: string }>;
  createReadUrl(key: string, expiresInSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
}
```

`LocalImageStorage` must store outside `public/`, use `0o600` files, and expose model access through an authenticated internal route or data URL—not a public static directory. `OssImageStorage` must create signed GET URLs capped at 300 seconds and use private ACL.

- [ ] **Step 4: Implement authoritative image validation**

Read multipart field `image`, cap the request before decoding, and verify JPEG, PNG, or HEIC using magic bytes rather than trusting the MIME header. Use `sharp().metadata()` to verify dimensions, strip metadata with `rotate().jpeg({ quality: 82 })`, hash the sanitized JPEG bytes, store them, then create the `image_assets` row with `deleteAfter = now + 24h`. If the current Sharp build cannot decode a valid HEIC, return the specific recoverable code `HEIC_CONVERSION_UNAVAILABLE` so the UI can ask for a JPEG without treating it as unsafe content.

- [ ] **Step 5: Run tests and commit**

Run: `pnpm vitest run src/server/storage src/app/api/uploads`

Expected: PASS with no file written under `public/`.

```bash
git add src/server/storage src/app/api/uploads
git commit -m "feat: add private image uploads"
```

---

### Task 5: Generation Job API, Fake Providers, and Worker Lease Loop

**Files:**
- Create: `src/server/providers/types.ts`
- Create: `src/server/providers/fake.ts`
- Create: `src/server/generation/orchestrator.ts`
- Create: `src/server/generation/worker.ts`
- Create: `scripts/worker.ts`
- Create: `src/app/api/generation-jobs/route.ts`
- Create: `src/app/api/generation-jobs/[jobId]/route.ts`
- Test: `src/server/generation/orchestrator.test.ts`
- Test: `src/app/api/generation-jobs/route.test.ts`

**Interfaces:**
- Produces: `VisionCaseProvider.generateCase()`, `CaseJudgeProvider.validateCase()`, `CaseJudgeProvider.repairCase()`, `runGenerationJob(jobId)`, job create/status routes.

- [ ] **Step 1: Write failing job tests**

```ts
it("returns immediately with a durable pending job", async () => {
  const response = await createJob({ imageId, idempotencyKey: "capture-1" });
  expect(response.status).toBe(202);
  expect(response.body.data.status).toBe("PENDING");
});

it("publishes a fake-provider case exactly once", async () => {
  await Promise.all([runGenerationJob(job.id), runGenerationJob(job.id)]);
  expect(await countCasesForJob(job.id)).toBe(1);
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm vitest run src/server/generation src/app/api/generation-jobs`

Expected: FAIL because job and provider modules do not exist.

- [ ] **Step 3: Define unified provider interfaces**

```ts
export interface VisionCaseProvider {
  generateCase(input: {
    imageUrl: string;
    imageWidth: number;
    imageHeight: number;
    locale: "zh-CN";
    traceId: string;
  }): Promise<GeneratedCase>;
}

export interface CaseJudgeProvider {
  validateCase(input: { game: PrivateCase; visibleObjectNames: string[]; traceId: string }): Promise<SemanticValidation>;
  repairCase(input: { game: PrivateCase; issues: ValidationIssue[]; traceId: string }): Promise<PrivateCase>;
}
```

Define `ProviderError` codes `TIMEOUT`, `RATE_LIMITED`, `BAD_OUTPUT`, `UNAVAILABLE`, and `AUTH_FAILED`, with only the first four eligible for controlled retry.

- [ ] **Step 4: Implement fake providers and orchestrator skeleton**

Fake providers return the existing sample case converted to the shared schema. The orchestrator must transition `PROCESSING -> VALIDATING -> SUCCEEDED`, record provider metadata, and publish transactionally. It must never log provider input/output.

- [ ] **Step 5: Implement the worker loop**

`worker.ts` polls one leased job at a time, handles `SIGINT`/`SIGTERM`, waits 500 ms when empty, and renews the lease during a model call. `scripts/worker.ts` imports `dotenv/config`, validates environment values, creates dependencies, and calls `startGenerationWorker()`.

- [ ] **Step 6: Run tests and a manual fake job**

Run: `pnpm vitest run src/server/generation src/app/api/generation-jobs`

Then in separate terminals run `pnpm dev` and `pnpm worker`; create one job with the UI or an authenticated test request.

Expected: status advances from `PENDING` to `SUCCEEDED`; restarting the browser preserves the job.

- [ ] **Step 7: Commit**

```bash
git add src/server/providers src/server/generation scripts/worker.ts src/app/api/generation-jobs
git commit -m "feat: add durable generation worker"
```

---

### Task 6: Deterministic Case Validation and Card Fallback

**Files:**
- Create: `src/server/cases/validator.ts`
- Test: `src/server/cases/validator.test.ts`
- Modify: `src/server/generation/orchestrator.ts`
- Modify: `src/server/generation/orchestrator.test.ts`

**Interfaces:**
- Produces: `validateGeneratedCase(value): ValidationResult` and `applyHotspotFallback(game, issues): PrivateCase`.

- [ ] **Step 1: Write table-driven failing tests**

Include invalid JSON/schema, duplicate object names, candidate mismatch, coordinate/radius range, severe overlap, answer index range, forbidden content, text bounds, and low-confidence fallback.

```ts
it("changes only interaction mode when hotspot confidence is low", () => {
  const result = validateGeneratedCase(caseWith({ confidence: 0.41 }));
  expect(result.publishable).toBe(true);
  expect(result.game?.interactionMode).toBe("CARD_FALLBACK");
  expect(result.game?.title).toBe(validCase.title);
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm vitest run src/server/cases/validator.test.ts`

Expected: FAIL because validator does not exist.

- [ ] **Step 3: Implement ordered validation**

Run checks in this order: Zod parse, copy bounds, uniqueness, candidate binding, normalized coordinates, geometry, answer index, restricted content. Use the existing aspect-aware overlap rule:

```ts
const dx = (a.x - b.x) * imageAspect;
const dy = a.y - b.y;
const distance = Math.sqrt(dx * dx + dy * dy);
const severe = distance < (a.radius + b.radius) * 0.8;
```

Geometry-only issues and confidence below `0.65` produce `CARD_FALLBACK`; logical, structural, or safety issues remain non-publishable.

- [ ] **Step 4: Integrate validator before judge and after repair**

The orchestrator must never invoke DeepSeek for `BLOCK`, unsafe input, or structurally unparseable output. After repair, rerun all checks from the beginning.

- [ ] **Step 5: Run tests and commit**

Run: `pnpm vitest run src/server/cases/validator.test.ts src/server/generation/orchestrator.test.ts`

Expected: PASS.

```bash
git add src/server/cases/validator* src/server/generation/orchestrator*
git commit -m "feat: validate generated mystery cases"
```

---

### Task 7: Qwen Vision Provider

**Files:**
- Create: `src/server/providers/qwen.ts`
- Create: `src/server/providers/qwen.test.ts`
- Create: `src/server/providers/prompts/qwen-system.ts`
- Create: `src/server/providers/live-ai.test.ts`
- Create: `src/server/providers/index.ts`

**Interfaces:**
- Produces: `QwenVisionProvider implements VisionCaseProvider`.
- Consumes: `GeneratedCaseSchema` and unified provider errors.

- [ ] **Step 1: Write mocked transport tests**

Assert model ID, Beijing base URL, image URL placement, `response_format: { type: "json_object" }`, non-thinking mode, abort timeout, parsing, and error mapping. Also assert the prompt contains no client filename or arbitrary user text.

```ts
expect(request.model).toBe("qwen3-vl-plus");
expect(request.response_format).toEqual({ type: "json_object" });
expect(JSON.stringify(request.messages)).not.toContain("IMG_1234.jpg");
```

- [ ] **Step 2: Verify failure**

Run: `pnpm vitest run src/server/providers/qwen.test.ts`

Expected: FAIL because provider does not exist.

- [ ] **Step 3: Implement the fixed system prompt**

The prompt must specify `zh-CN`, fictional light suspense, exactly three clues/options, no OCR-dependent clue, no real-person allegation, normalized centers/radii, copy limits, allowed risk labels, and the exact JSON shape. It must instruct the model to return `RETRY` or `BLOCK` with `game: null` when input is unsuitable.

- [ ] **Step 4: Implement the OpenAI-compatible adapter**

Use server-only configuration:

```ts
new OpenAI({
  apiKey: env.QWEN_API_KEY,
  baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
});
```

Call `chat.completions.create()` with the image signed URL, trusted width/height, fixed prompt, JSON mode, and an abort signal. Parse with `GeneratedCaseSchema`. Record model, input/output token counts, latency, and estimated cost, but not content.

- [ ] **Step 5: Add an opt-in live smoke test**

Skip unless both `RUN_LIVE_AI_TESTS=1` and `QWEN_API_KEY` exist. Use a repository-owned non-sensitive test scene, assert only schema validity and bounded coordinates, and print no model output.

- [ ] **Step 6: Run mocked tests and optionally live smoke test**

Run: `pnpm vitest run src/server/providers/qwen.test.ts`

Expected: PASS without network.

After the user locally fills `.env.local`, run: `pnpm test:live-ai`.

Expected: Qwen test PASS or return a sanitized provider error without leaking the key.

- [ ] **Step 7: Commit**

```bash
git add src/server/providers
git commit -m "feat: integrate Qwen vision generation"
```

---

### Task 8: DeepSeek Semantic Judge and One Repair

**Files:**
- Create: `src/server/providers/deepseek.ts`
- Create: `src/server/providers/deepseek.test.ts`
- Create: `src/server/providers/prompts/deepseek-system.ts`
- Modify: `src/server/generation/orchestrator.ts`
- Modify: `src/server/generation/orchestrator.test.ts`

**Interfaces:**
- Produces: `DeepSeekCaseJudge implements CaseJudgeProvider`.

- [ ] **Step 1: Write privacy and behavior tests**

```ts
it("sends case text but never image metadata", async () => {
  await judge.validateCase({ game, visibleObjectNames, traceId: "trace-1" });
  const payload = JSON.stringify(transport.lastRequest);
  expect(payload).toContain(game.title);
  expect(payload).not.toMatch(/https?:\/\//);
  expect(payload).not.toContain("storageKey");
  expect(payload).not.toContain("trace-1");
});
```

Test valid, non-unique answer, contradiction, timeout, invalid JSON, a successful targeted repair, and failed second validation.

- [ ] **Step 2: Verify failure**

Run: `pnpm vitest run src/server/providers/deepseek.test.ts src/server/generation/orchestrator.test.ts`

Expected: FAIL because judge adapter does not exist.

- [ ] **Step 3: Implement judge schemas and adapter**

Use JSON mode with:

```ts
const SemanticValidationSchema = z.object({
  valid: z.boolean(),
  confidence: z.number().min(0).max(1),
  issues: z.array(z.object({
    code: z.enum(["NON_UNIQUE", "CONTRADICTION", "OUTSIDE_EVIDENCE", "UNSAFE", "COPY_QUALITY"]),
    field: z.string().max(80),
    message: z.string().max(120),
  })).max(8),
});
```

Build a fresh payload containing only `game` and `visibleObjectNames`. Remove hotspot coordinates and internal IDs before sending because they are not needed for semantic judgment.

- [ ] **Step 4: Integrate one repair budget**

If judge returns invalid with only repairable semantic issues, call `repairCase()` once, then rerun deterministic validation and semantic validation. Never repair `UNSAFE`. If DeepSeek is unavailable, publish only when deterministic validation passes and Qwen logical confidence is at least `0.9`; set `judgeDegraded=true` and record it.

- [ ] **Step 5: Run tests and commit**

Run: `pnpm vitest run src/server/providers/deepseek.test.ts src/server/generation/orchestrator.test.ts`

Expected: PASS and call-count assertions show no more than two DeepSeek calls.

```bash
git add src/server/providers/deepseek* src/server/providers/prompts/deepseek-system.ts src/server/generation/orchestrator*
git commit -m "feat: validate mysteries with DeepSeek"
```

---

### Task 9: Player Case, Answer, Reveal, and Image Deletion APIs

**Files:**
- Create: `src/server/cases/service.ts`
- Create: `src/server/cases/service.test.ts`
- Create: `src/app/api/cases/[caseId]/route.ts`
- Create: `src/app/api/cases/[caseId]/answer/route.ts`
- Create: `src/app/api/cases/[caseId]/reveal/route.ts`
- Create: `src/app/api/images/[imageId]/route.ts`
- Test: `src/app/api/cases/routes.test.ts`

**Interfaces:**
- Produces: browser-safe case API, server-authoritative two-attempt answer API, gated reveal API, idempotent photo deletion API.

- [ ] **Step 1: Write authorization and leakage tests**

Test cross-session 404, player response leakage scan, first wrong answer with hint, second wrong completion, correct completion, third-attempt rejection, reveal before completion, reveal after completion, and repeated delete.

```ts
it("never leaks private fields before completion", async () => {
  const response = await getPlayerCase(ownerCookie, caseId);
  const json = JSON.stringify(response.body);
  expect(json).not.toContain("correctAnswerIndex");
  expect(json).not.toContain(game.truth);
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm vitest run src/server/cases/service.test.ts src/app/api/cases/routes.test.ts`

Expected: FAIL because service and routes do not exist.

- [ ] **Step 3: Implement server-authoritative game service**

`getPlayerCase()` returns player fields plus opened clue IDs and attempt count. `submitAnswer()` locks and updates the game session transactionally. `reveal()` requires completion and returns `{ truth, correctAnswerIndex, firstAnswerCorrect }`. All resource lookups scope by hashed anonymous session ID.

- [ ] **Step 4: Implement idempotent image deletion**

Authorize ownership, mark `deletionRequestedAt`, call storage delete, then set `deletedAt`. Treat storage `not found` as success. On transient storage failure return retryable error and leave the deletion request for cleanup worker retry.

- [ ] **Step 5: Run tests and commit**

Run: `pnpm vitest run src/server/cases src/app/api/cases src/app/api/images`

Expected: PASS.

```bash
git add src/server/cases src/app/api/cases src/app/api/images
git commit -m "feat: add secure game and deletion APIs"
```

---

### Task 10: Connect the Existing Frontend to the Backend

**Files:**
- Create: `src/features/game/api-client.ts`
- Create: `src/features/game/image-compression.ts`
- Test: `src/features/game/image-compression.test.ts`
- Modify: `src/features/game/types.ts`
- Modify: `src/features/game/game-machine.ts`
- Modify: `src/features/game/game-app.tsx`
- Modify: `src/features/game/persistence.ts`
- Modify: relevant `src/components/*.tsx` to accept case data rather than import fixture data
- Test: `src/features/game/api-client.test.ts`
- Modify: `src/features/game/game-app.test.tsx`
- Modify: `tests/e2e/happy-path.spec.ts`
- Modify: `tests/e2e/wrong-answer.spec.ts`

**Interfaces:**
- Consumes: session, upload, job status, player case, answer, reveal and delete APIs.
- Produces: real-photo flow while keeping “体验示例案件” deterministic.

- [ ] **Step 1: Write failing API-client and component tests**

Use mocked fetch to cover session creation, multipart upload, 202 job creation, polling through `PROCESSING`, success, rejected photo, retryable failure, 30-second leave state, answer, reveal, and delete. Test that a 2400×1800 browser-decodable image becomes JPEG with longest edge 1600 or less. Test that an undecodable HEIC under 5 MB is preserved for server-side conversion and an oversized HEIC is rejected locally.

```ts
it("persists only job and case identifiers, never answers or image URLs", () => {
  saveGameState(realApiState);
  const stored = localStorage.getItem("wanwuyouxi:game") ?? "";
  expect(stored).toContain(realApiState.jobId!);
  expect(stored).not.toContain("correctAnswerIndex");
  expect(stored).not.toContain("blob:");
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm vitest run src/features/game`

Expected: new tests FAIL against the fixture-only state machine.

- [ ] **Step 3: Implement typed API calls**

Every method parses the shared browser-safe schema and maps server error codes to a small UI union. Use `credentials: "same-origin"`. Poll with 1-second delay while visible, back off to 3 seconds after 15 seconds, and stop visible waiting at 30 seconds without canceling the server job.

Implement `prepareImageForUpload(file)` with `createImageBitmap` and an off-screen canvas: preserve aspect ratio, cap the longest edge at 1600, export JPEG quality `0.82`, and reject output above 5 MB. If the browser cannot decode an HEIC file, return the original HEIC only when it is at most 5 MB so the server can attempt conversion; map `HEIC_CONVERSION_UNAVAILABLE` to a request for JPEG/original camera compatibility mode.

- [ ] **Step 4: Extend state without storing secrets**

Add `sessionReady`, `imageId`, `jobId`, `caseId`, `caseData`, `jobStatus`, and recoverable error state. Remove the automatic 1.6-second mock completion for real uploads. Keep sample mode explicitly backed by the existing fixture and clearly label it as a sample.

- [ ] **Step 5: Make components data-driven**

Pass case title, background, objective, clues, question, answer options, hint, and truth as props. For `CARD_FALLBACK`, render three object cards instead of positioned hotspots. Do not put answer correctness logic in the reducer; use the answer API result.

- [ ] **Step 6: Run frontend and end-to-end tests**

Run:

```bash
pnpm test:run
pnpm test:e2e
```

Expected: sample flow remains green; API flow tests cover success, wrong answer, refresh recovery and card fallback.

- [ ] **Step 7: Commit**

```bash
git add src/features/game src/components tests/e2e
git commit -m "feat: connect game UI to backend generation"
```

---

### Task 11: Cleanup Worker and Metadata-Only Metrics

**Files:**
- Create: `src/server/generation/cleanup-worker.ts`
- Create: `scripts/cleanup-worker.ts`
- Create: `src/server/observability/metrics.ts`
- Test: `src/server/generation/cleanup-worker.test.ts`
- Test: `src/server/observability/metrics.test.ts`

**Interfaces:**
- Produces: `deleteExpiredImages(now)`, `recordModelCall()`, `getEvaluationSummary()`.

- [ ] **Step 1: Write failing cleanup and privacy tests**

```ts
it("deletes expired images and is safe to repeat", async () => {
  await deleteExpiredImages(now);
  await deleteExpiredImages(now);
  expect(storage.delete).toHaveBeenCalledTimes(1);
});

it("rejects forbidden metric properties", () => {
  expect(() => recordMetric("generation", { imageUrl: "signed" })).toThrow("FORBIDDEN_METRIC_FIELD");
});
```

Also test transient delete retry, already-missing object, and retention of the case after image deletion.

- [ ] **Step 2: Verify failure**

Run: `pnpm vitest run src/server/generation/cleanup-worker.test.ts src/server/observability`

Expected: FAIL because modules do not exist.

- [ ] **Step 3: Implement cleanup and summary metrics**

Delete rows whose `deleteAfter <= now` or `deletionRequestedAt` is set. Retry transient errors on the next run. Metrics allow IDs, enums, booleans, durations, token counts and costs only. Summary must calculate generation success rate, hotspot usable rate, fallback rate, P50/P95 duration, repair rate and average cost per successful game.

- [ ] **Step 4: Run tests and commit**

Run: `pnpm vitest run src/server/generation/cleanup-worker.test.ts src/server/observability`

Expected: PASS.

```bash
git add src/server/generation/cleanup-worker* src/server/observability scripts/cleanup-worker.ts
git commit -m "feat: clean photos and track generation quality"
```

---

### Task 12: Live Configuration, Full Verification, and Handoff Documentation

**Files:**
- Create: `docs/development/backend-local-setup.md`
- Create: `docs/evaluation/backend-mvp-scorecard.md`
- Modify: `README.md`
- Modify: `.env.example` if verification exposes missing configuration
- Modify: tests only when they reveal a real requirement gap; do not weaken assertions

**Interfaces:**
- Produces: a reproducible local runbook and evidence-backed MVP scorecard.

- [ ] **Step 1: Write the local setup runbook**

Document exact commands for PostgreSQL, migration, `.env.local`, `pnpm dev`, `pnpm worker`, `pnpm worker:cleanup`, fake mode, live mode, key rotation, and common sanitized errors. Tell the user to paste keys only into `.env.local`; never ask them to send keys in chat.

- [ ] **Step 2: Configure local secrets interactively**

Copy `.env.example` to `.env.local` only if absent. Have the user open that local file in an editor and fill the blank `QWEN_API_KEY=` and `DEEPSEEK_API_KEY=` lines without echoing either value into tool output.

Generate `SESSION_SECRET` locally using a secure random source. Confirm presence by printing only `configured`/`missing`, never the value or prefix.

- [ ] **Step 3: Run static and automated verification**

Run:

```bash
pnpm lint
pnpm test:run
pnpm build
pnpm test:e2e
```

Expected: all commands exit 0, all unit/integration tests pass, production build succeeds, and both mobile E2E flows pass.

- [ ] **Step 4: Run live model and privacy verification**

With explicit user approval to spend the small live quota, run `pnpm test:live-ai`, then generate one case from an authorized room photo. Confirm schema, three visible objects, bounded hotspots, unique answer, no client answer leakage, model call caps, and successful immediate deletion. Do not print model content or signed URLs in the terminal transcript.

- [ ] **Step 5: Verify the complete browser story**

Start Web and Worker, then test at 390×844:

1. upload an authorized room photo;
2. observe `PENDING/PROCESSING` without UI lockup;
3. refresh and recover;
4. enter the generated case;
5. inspect all three clues or cards;
6. submit one wrong answer and receive the server hint;
7. submit the final answer and reveal truth;
8. delete the photo;
9. check browser console, server output and network responses for errors or leaked private fields.

Expected: full flow completes with no uncaught error, no horizontal overflow, no answer before reveal, and no retrievable photo after deletion.

- [ ] **Step 6: Create the initial scorecard**

Run 10 authorized development photos and fill `backend-mvp-scorecard.md` with counts and formulas for success rate, hotspot usable rate, fallback rate, P50/P95 latency, retries, repairs and average cost. Expand to 50 photos before the public portfolio launch.

- [ ] **Step 7: Final commit**

```bash
git add README.md .env.example docs/development docs/evaluation
git commit -m "docs: add backend runbook and evaluation scorecard"
```

- [ ] **Step 8: Request review before merge**

Use `superpowers:requesting-code-review`, address actionable findings, then rerun the full verification commands before pushing or updating the pull request.

---

## Completion Evidence

Implementation is complete only when all of the following are attached to the handoff:

- unit/integration test count and passing output;
- production build result;
- mobile E2E result;
- one successful live Qwen + DeepSeek generation without secret/content leakage;
- immediate photo deletion verification;
- initial 10-photo scorecard with success, hotspot, latency and cost numbers;
- Git commit list and pull request URL.
