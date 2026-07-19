# 万物有戏 V2 公开上线基础 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复当前真实生成与移动端展示问题，并把现有单实例应用准备成可通过阿里云香港 ECS、HTTPS 域名稳定公开访问的作品集版本。

**Architecture:** 保留 Next.js 单实例、PGlite 持久化目录、OSS 私有图片和请求内生成触发器。新增数据库内的每会话每日案件限额、进程内图片清理调度、健康检查和生产环境校验；使用 Docker Compose 运行 Next.js 与 Caddy，PGlite 挂载到持久化卷。V2 案件事实簿、审问、档案卡和漫画分别进入后续实施计划。

**Tech Stack:** Next.js 16、React 19、TypeScript 5.8、Zod 4、Drizzle ORM、PGlite、Vitest、Playwright、Docker、Caddy、阿里云 OSS。

## Global Constraints

- 中国大陆网络环境可访问；第一版使用阿里云香港 ECS，避免等待中国大陆服务器 ICP 备案。
- 角色、审问、档案和漫画不在本计划实现，本计划只交付公开上线基础。
- API Key、OSS 密钥和 `SESSION_SECRET` 只允许存在于服务器环境变量，不写入镜像、日志、文档示例值或 Git。
- 图片继续存放在私有 OSS，签名读取地址有效期不超过 300 秒。
- 匿名会话每天最多创建 3 个真实案件；相同幂等键的重试不得重复计数。
- 清理任务与 Next.js 运行在同一 Node 进程，避免两个进程同时打开同一 PGlite 数据目录。
- 生产部署只运行一个应用副本；PGlite 阶段禁止横向扩容。
- 所有代码改动遵循测试先行；真实模型测试只有在用户再次明确同意产生费用时才运行。

---

## File map

- `src/server/cases/contracts.ts`：V1 案件结构边界，允许非空单字答案。
- `src/server/providers/deepseek.ts`：修复结果使用同一答案长度契约。
- `src/server/providers/prompts/qwen-system.ts`：把答案选项长度写入模型指令。
- `src/components/phone-shell.tsx`：只保留应用容器，不渲染伪系统状态栏。
- `src/app/globals.css`：收回伪状态栏占位并保持真实安全区。
- `src/components/home-screen.tsx`：使用准确的上传与删除隐私文案。
- `src/server/db/repositories.ts`：在会话行锁内完成幂等去重、每日计数和任务创建。
- `src/server/usage/daily-window.ts`：计算 Asia/Shanghai 自然日边界。
- `src/server/config/production.ts`：验证公开部署所需的生产环境变量。
- `src/server/generation/cleanup-scheduler.ts`：在单进程内周期清理过期图片。
- `src/instrumentation.ts`：Node 运行时启动一次清理调度。
- `src/app/api/health/route.ts`：不泄露内部信息的数据库健康检查。
- `Dockerfile`、`.dockerignore`、`deploy/compose.yml`、`deploy/Caddyfile`：单实例 HTTPS 部署包。
- `docs/deployment/aliyun-hk-ecs.md`：非技术用户也可逐步执行的上线与回滚说明。

---

### Task 1: 兼容非空单字答案选项

**Files:**
- Modify: `src/server/cases/contracts.ts`
- Modify: `src/server/providers/deepseek.ts`
- Modify: `src/server/providers/prompts/qwen-system.ts`
- Modify: `src/server/cases/contracts.test.ts`
- Modify: `src/server/providers/qwen.test.ts`
- Modify: `src/server/providers/deepseek.test.ts`

**Interfaces:**
- Consumes: `GeneratedCaseSchema`、`PrivateCaseSchema`、`DeepSeekCaseJudge.repairCase()`。
- Produces: 所有答案选项统一使用“去除首尾空白后 1–40 个字符”的契约；空字符串和重复答案仍由结构/确定性校验拒绝。

- [ ] **Step 1: 写入失败的契约测试**

在 `src/server/cases/contracts.test.ts` 的 `describe` 中加入：

```ts
  it("accepts non-empty single-character Chinese answer options", () => {
    const singleCharacterAnswers = {
      ...valid,
      game: { ...valid.game, answerOptions: ["甲", "乙", "丙"] },
    };

    expect(GeneratedCaseSchema.safeParse(singleCharacterAnswers).success).toBe(true);
  });

  it("still rejects an empty answer option", () => {
    const emptyAnswer = {
      ...valid,
      game: { ...valid.game, answerOptions: ["", "乙", "丙"] },
    };

    expect(GeneratedCaseSchema.safeParse(emptyAnswer).success).toBe(false);
  });
```

在 `src/server/providers/qwen.test.ts` 中加入真实漂移回归：

```ts
  it("accepts a PASS result whose answer choices are single Chinese characters", async () => {
    const response = JSON.stringify({
      ...JSON.parse(validResponse),
      game: { ...fakePrivateCase, answerOptions: ["甲", "乙", "丙"] },
    });
    const provider = new QwenVisionProvider({
      transport: new CapturingTransport(response),
      model: "qwen3-vl-plus",
      timeoutMs: 30_000,
    });

    const result = await provider.generateCase({
      imageUrl: "data:image/jpeg;base64,/9j/",
      imageWidth: 1200,
      imageHeight: 900,
      locale: "zh-CN",
      traceId: "trace",
    });

    expect(result.decision).toBe("PASS");
  });
```

- [ ] **Step 2: 运行测试并确认因最小长度为 2 而失败**

Run:

```bash
pnpm exec vitest run src/server/cases/contracts.test.ts src/server/providers/qwen.test.ts
```

Expected: 两条单字答案测试失败，错误路径包含 `game.answerOptions.0` 与 `too_small`。

- [ ] **Step 3: 统一结构、修复和提示词契约**

在 `src/server/cases/contracts.ts` 中把三个答案项改成：

```ts
  answerOptions: z.tuple([
    z.string().trim().min(1).max(40),
    z.string().trim().min(1).max(40),
    z.string().trim().min(1).max(40),
  ]),
```

在 `src/server/providers/deepseek.ts` 的 `RepairChangesSchema` 中使用相同定义：

```ts
    answerOptions: z.tuple([
      z.string().trim().min(1).max(40),
      z.string().trim().min(1).max(40),
      z.string().trim().min(1).max(40),
    ]).optional(),
```

在 `QWEN_CASE_SYSTEM_PROMPT` 第 10 条中明确：

```text
10. answerOptions 必须恰好包含 3 项，每项去除首尾空白后为 1 到 40 个字符；correctAnswerIndex 只能是 0、1 或 2。
```

- [ ] **Step 4: 为 DeepSeek 修复路径加入同契约测试**

在 `src/server/providers/deepseek.test.ts` 中加入：

```ts
  it("accepts a targeted repair with single-character answer choices", async () => {
    const judge = new DeepSeekCaseJudge({
      transport: new CapturingTransport([
        JSON.stringify({ changes: { answerOptions: ["甲", "乙", "丙"] } }),
      ]),
      model: "deepseek-v4-flash",
      timeoutMs: 30_000,
    });

    const repaired = await judge.repairCase({
      game: fakePrivateCase,
      issues: [{ code: "COPY_QUALITY", field: "answerOptions", message: "short choices" }],
      traceId: "trace",
    });

    expect(repaired.answerOptions).toEqual(["甲", "乙", "丙"]);
  });
```

- [ ] **Step 5: 验证目标测试与完整模型契约测试**

Run:

```bash
pnpm exec vitest run src/server/cases/contracts.test.ts src/server/providers/qwen.test.ts src/server/providers/deepseek.test.ts src/server/cases/validator.test.ts
```

Expected: 4 个测试文件全部通过；空字符串测试仍失败于 schema，重复答案测试仍由 validator 拒绝。

- [ ] **Step 6: 提交格式兼容修复**

```bash
git add src/server/cases/contracts.ts src/server/providers/deepseek.ts src/server/providers/prompts/qwen-system.ts src/server/cases/contracts.test.ts src/server/providers/qwen.test.ts src/server/providers/deepseek.test.ts
git commit -m "fix: accept non-empty single-character answers"
```

---

### Task 2: 删除伪状态栏并修正隐私文案

**Files:**
- Create: `src/components/phone-shell.test.tsx`
- Modify: `src/components/phone-shell.tsx`
- Modify: `src/components/home-screen.tsx`
- Modify: `src/app/globals.css`
- Modify: `tests/e2e/iphone-layout.spec.ts`

**Interfaces:**
- Consumes: `PhoneShell({ children })` 和现有 `.screen`、`.home-screen`、`.overlay-top-bar` 布局。
- Produces: 页面不再渲染 `9:41`、伪信号图标或 `.status-bar`；所有页面仍尊重 iPhone 安全区；首页明确说明照片会上传用于 AI 生成并在 24 小时内删除。

- [ ] **Step 1: 写入失败的组件与移动端测试**

创建 `src/components/phone-shell.test.tsx`：

```tsx
import { render, screen } from "@testing-library/react";

import { PhoneShell } from "./phone-shell";

describe("PhoneShell", () => {
  it("does not imitate the device status bar", () => {
    const { container } = render(<PhoneShell><p>内容</p></PhoneShell>);

    expect(screen.queryByText("9:41")).not.toBeInTheDocument();
    expect(container.querySelector(".status-bar")).toBeNull();
    expect(screen.getByText("内容")).toBeInTheDocument();
  });
});
```

在 `tests/e2e/iphone-layout.spec.ts` 中加入：

```ts
  await expect(page.getByText("9:41", { exact: true })).toHaveCount(0);
  await expect(page.getByText("照片会安全上传用于本次 AI 生成，并在 24 小时内删除")).toBeVisible();
```

并把原来的隐私文案定位器替换为新文案。

- [ ] **Step 2: 运行测试并确认旧状态栏和旧文案导致失败**

Run:

```bash
pnpm exec vitest run src/components/phone-shell.test.tsx
pnpm exec playwright test tests/e2e/iphone-layout.spec.ts --project=mobile-chromium
```

Expected: 组件测试找到 `9:41`；端到端测试找不到新隐私文案。

- [ ] **Step 3: 删除伪状态栏结构**

将 `src/components/phone-shell.tsx` 改为：

```tsx
import type { ReactNode } from "react";

export function PhoneShell({ children }: { children: ReactNode }) {
  return (
    <main className="app-stage">
      <section className="phone-shell" aria-label="万物有戏移动端体验">
        {children}
      </section>
    </main>
  );
}
```

删除 `globals.css` 中 `.status-bar` 和 `.status-icons` 两条规则，并做以下精确替换：

```css
.screen { min-height: 100svh; min-height: 100dvh; padding: calc(20px + var(--safe-top)) calc(22px + var(--safe-right)) calc(26px + var(--safe-bottom)) calc(22px + var(--safe-left)); position: relative; display: flex; flex-direction: column; overflow: hidden; }
.home-screen { padding-top: calc(20px + var(--safe-top)); background: linear-gradient(180deg, rgba(28,15,20,.35), transparent 45%); }
.overlay-top-bar { position: absolute; z-index: 4; top: var(--safe-top); left: 0; right: 0; padding: 16px calc(20px + var(--safe-right)) 16px calc(20px + var(--safe-left)); display: flex; justify-content: space-between; align-items: center; background: linear-gradient(#060608, transparent); pointer-events: none; }
.error-code { position: absolute; top: calc(24px + var(--safe-top)); color: #6b6668; font: 9px var(--font-mono); letter-spacing: .15em; }
```

在短屏媒体查询中把首页顶部间距改为：

```css
  .home-screen { padding-top: calc(16px + var(--safe-top)); padding-bottom: calc(12px + var(--safe-bottom)); }
```

- [ ] **Step 4: 修正首页隐私说明**

在 `src/components/home-screen.tsx` 中替换为：

```tsx
<p className="privacy-note">照片会安全上传用于本次 AI 生成，并在 24 小时内删除</p>
```

- [ ] **Step 5: 验证组件、页面和短 iPhone 布局**

Run:

```bash
pnpm exec vitest run src/components/phone-shell.test.tsx src/app/page.test.tsx src/features/game/game-app.test.tsx
pnpm exec playwright test tests/e2e/iphone-layout.spec.ts --project=mobile-chromium
```

Expected: 所有测试通过；375×667 视口内两个按钮和隐私说明均未越界；页面不存在 `9:41`。

- [ ] **Step 6: 提交视觉与文案修复**

```bash
git add src/components/phone-shell.tsx src/components/phone-shell.test.tsx src/components/home-screen.tsx src/app/globals.css tests/e2e/iphone-layout.spec.ts
git commit -m "fix: remove simulated phone status chrome"
```

---

### Task 3: 增加数据库内的每日案件限额

**Files:**
- Create: `src/server/usage/daily-window.ts`
- Create: `src/server/usage/daily-window.test.ts`
- Modify: `src/server/db/repositories.ts`
- Modify: `src/server/db/repositories.test.ts`
- Modify: `src/app/api/generation-jobs/route.ts`
- Modify: `src/app/api/generation-jobs/route.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `startOfShanghaiDay(now: Date): Date`。
- Produces: `GenerationJobRepository.createWithinDailyLimit(input, since, limit): Promise<{ job: GenerationJob | null; limited: boolean }>`。
- Consumes: `DAILY_CASE_LIMIT`，默认 `3`，允许值 `1..20`。
- API behavior: 超限返回 HTTP 429、`DAILY_CASE_LIMIT_REACHED` 和不可重试提示；同一幂等键重放仍返回原任务。

- [ ] **Step 1: 写入上海自然日边界测试**

创建 `src/server/usage/daily-window.test.ts`：

```ts
import { describe, expect, it } from "vitest";

import { startOfShanghaiDay } from "./daily-window";

describe("startOfShanghaiDay", () => {
  it("returns midnight in Asia/Shanghai as a UTC instant", () => {
    expect(startOfShanghaiDay(new Date("2026-07-19T08:30:00.000Z")).toISOString())
      .toBe("2026-07-18T16:00:00.000Z");
  });

  it("moves to the next bucket at Shanghai midnight", () => {
    expect(startOfShanghaiDay(new Date("2026-07-19T16:00:00.000Z")).toISOString())
      .toBe("2026-07-19T16:00:00.000Z");
  });
});
```

- [ ] **Step 2: 运行测试并确认模块尚不存在**

```bash
pnpm exec vitest run src/server/usage/daily-window.test.ts
```

Expected: FAIL，提示无法解析 `./daily-window`。

- [ ] **Step 3: 实现上海自然日计算**

创建 `src/server/usage/daily-window.ts`：

```ts
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

export function startOfShanghaiDay(now: Date) {
  const shifted = new Date(now.getTime() + SHANGHAI_OFFSET_MS);
  const utcMidnight = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  );
  return new Date(utcMidnight - SHANGHAI_OFFSET_MS);
}
```

- [ ] **Step 4: 写入仓储限额失败测试**

在 `src/server/db/repositories.test.ts` 的 `GenerationJobRepository` 分组中加入：

```ts
  it("creates at most three jobs per Shanghai day and preserves idempotent replay", async () => {
    const since = new Date("2026-07-18T16:00:00.000Z");
    const inputs = await Promise.all([0, 1, 2, 3].map(async (index) => ({
      sessionId,
      imageAssetId: await testDatabase.seedImageAsset(sessionId, `quota-photo-${index}`),
      imageSha256: `quota-photo-${index}`,
      idempotencyKey: `quota-${index}`,
    })));

    const first = await repository.createWithinDailyLimit(inputs[0], since, 3);
    await repository.createWithinDailyLimit(inputs[1], since, 3);
    await repository.createWithinDailyLimit(inputs[2], since, 3);
    const blocked = await repository.createWithinDailyLimit(inputs[3], since, 3);
    const replay = await repository.createWithinDailyLimit(inputs[0], since, 3);

    expect(first.limited).toBe(false);
    expect(blocked).toEqual({ job: null, limited: true });
    expect(replay.job?.id).toBe(first.job?.id);
  });
```

- [ ] **Step 5: 在会话行锁内实现原子限额**

在 `repositories.ts` 增加 `count`、`gte` 和 `anonymousSessions` import，把现有创建逻辑抽到事务内，并新增：

```ts
  async createWithinDailyLimit(
    input: CreateGenerationJobInput,
    since: Date,
    limit: number,
  ) {
    return this.db.transaction(async (transaction) => {
      await transaction
        .select({ id: anonymousSessions.id })
        .from(anonymousSessions)
        .where(eq(anonymousSessions.id, input.sessionId))
        .limit(1)
        .for("update");

      const [existing] = await transaction
        .select()
        .from(generationJobs)
        .where(and(
          eq(generationJobs.sessionId, input.sessionId),
          eq(generationJobs.imageSha256, input.imageSha256),
          eq(generationJobs.idempotencyKey, input.idempotencyKey),
        ))
        .limit(1);
      if (existing) return { job: existing, limited: false };

      const [usage] = await transaction
        .select({ value: count() })
        .from(generationJobs)
        .where(and(
          eq(generationJobs.sessionId, input.sessionId),
          gte(generationJobs.createdAt, since),
        ));
      if (Number(usage?.value ?? 0) >= limit) return { job: null, limited: true };

      const [job] = await transaction.insert(generationJobs).values(input).returning();
      if (!job) throw new Error("JOB_CREATE_FAILED");
      return { job, limited: false };
    });
  }
```

保留 `createGenerationJob()` 供现有测试和内部任务使用，不改变其签名。

- [ ] **Step 6: 写入 API 超限失败测试**

扩展 `route.test.ts` 的依赖为：

```ts
    const POST = createGenerationJobsRoute({
      db: database.db,
      resolveSessionId: async () => sessionId,
      onJobCreated,
      now: () => new Date("2026-07-19T08:00:00.000Z"),
      dailyGenerationLimit: 3,
    });
```

新增完整测试：

```ts
  it("limits new jobs to three per Shanghai day but permits an idempotent replay", async () => {
    const onJobCreated = vi.fn();
    const imageIds = await Promise.all([
      imageId,
      database.seedImageAsset(sessionId, "job-route-photo-2"),
      database.seedImageAsset(sessionId, "job-route-photo-3"),
      database.seedImageAsset(sessionId, "job-route-photo-4"),
    ]);
    const POST = createGenerationJobsRoute({
      db: database.db,
      resolveSessionId: async () => sessionId,
      onJobCreated,
      now: () => new Date("2026-07-19T08:00:00.000Z"),
      dailyGenerationLimit: 3,
    });
    const request = (index: number) => new Request("http://test/api/generation-jobs", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": `capture-${index}` },
      body: JSON.stringify({ imageId: imageIds[index] }),
    });

    const accepted = await Promise.all([0, 1, 2].map((index) => POST(request(index))));
    const firstBody = await accepted[0].json();
    const blocked = await POST(request(3));
    const blockedBody = await blocked.json();
    const replay = await POST(request(0));
    const replayBody = await replay.json();

    expect(accepted.map((response) => response.status)).toEqual([202, 202, 202]);
    expect(blocked.status).toBe(429);
    expect(blockedBody.error.code).toBe("DAILY_CASE_LIMIT_REACHED");
    expect(replay.status).toBe(202);
    expect(replayBody.data.jobId).toBe(firstBody.data.jobId);
    expect(onJobCreated).toHaveBeenCalledTimes(4);
  });
```

这里 `onJobCreated` 被调用 4 次：三个新任务各一次，幂等重放仍触发一次 drain；超限的新请求不得触发。

- [ ] **Step 7: 接入生成任务路由**

把 `Dependencies` 增加：

```ts
  now(): Date;
  dailyGenerationLimit: number;
```

在验证图片后调用：

```ts
      const repository = new GenerationJobRepository(dependencies.db);
      const result = await repository.createWithinDailyLimit({
        sessionId,
        imageAssetId: image.id,
        imageSha256: image.sha256,
        idempotencyKey,
      }, startOfShanghaiDay(dependencies.now()), dependencies.dailyGenerationLimit);

      if (result.limited || !result.job) {
        return NextResponse.json({
          ok: false,
          error: {
            code: "DAILY_CASE_LIMIT_REACHED",
            message: "今天的真实案件体验次数已用完，明天再来吧",
            retryable: false,
          },
          traceId,
        }, { status: 429 });
      }
      const job = result.job;
```

生产依赖使用：

```ts
    now: () => new Date(),
    dailyGenerationLimit: Math.min(20, Math.max(1, Number(process.env.DAILY_CASE_LIMIT ?? 3))),
```

`.env.example` 增加：

```dotenv
DAILY_CASE_LIMIT=3
```

- [ ] **Step 8: 验证限额、去重与并发相关仓储测试**

```bash
pnpm exec vitest run src/server/usage/daily-window.test.ts src/server/db/repositories.test.ts src/app/api/generation-jobs/route.test.ts
```

Expected: 全部通过，第四个新案件被限额，相同幂等键不受限额影响。

- [ ] **Step 9: 提交每日限额**

```bash
git add src/server/usage/daily-window.ts src/server/usage/daily-window.test.ts src/server/db/repositories.ts src/server/db/repositories.test.ts src/app/api/generation-jobs/route.ts src/app/api/generation-jobs/route.test.ts .env.example
git commit -m "feat: enforce daily case generation limit"
```

---

### Task 4: 增加生产环境校验、健康检查与单进程清理调度

**Files:**
- Create: `src/server/config/production.ts`
- Create: `src/server/config/production.test.ts`
- Create: `src/server/generation/cleanup-scheduler.ts`
- Create: `src/server/generation/cleanup-scheduler.test.ts`
- Create: `src/instrumentation.ts`
- Create: `src/app/api/health/route.ts`
- Create: `src/app/api/health/route.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `readProductionConfig(env): ProductionConfig`，生产环境缺失配置时抛出只含字段名的错误。
- Produces: `startCleanupScheduler({ clean, intervalMs }): () => void`，重复启动只保留一个调度器。
- Produces: `GET /api/health`，数据库可查询时返回 200 `{ ok: true }`，否则返回 503 `{ ok: false }`。

- [ ] **Step 1: 写入生产配置失败测试**

创建 `src/server/config/production.test.ts`：

```ts
import { describe, expect, it } from "vitest";

import { readProductionConfig } from "./production";

const valid = {
  NODE_ENV: "production",
  SESSION_SECRET: "a-secure-session-secret-with-more-than-32-characters",
  QWEN_API_KEY: "qwen-secret",
  DEEPSEEK_API_KEY: "deepseek-secret",
  IMAGE_STORAGE_DRIVER: "oss",
  OSS_REGION: "oss-cn-hongkong",
  OSS_BUCKET: "private-bucket",
  OSS_ACCESS_KEY_ID: "ram-user",
  OSS_ACCESS_KEY_SECRET: "ram-secret",
  PGLITE_DATA_DIR: "/app/.data/pglite",
};

describe("readProductionConfig", () => {
  it("accepts the complete production configuration", () => {
    expect(readProductionConfig(valid)).toMatchObject({
      imageStorageDriver: "oss",
      pgliteDataDir: "/app/.data/pglite",
    });
  });

  it("reports missing field names without printing secret values", () => {
    expect(() => readProductionConfig({ ...valid, SESSION_SECRET: "short" }))
      .toThrow("INVALID_PRODUCTION_ENV:SESSION_SECRET");
  });
});
```

- [ ] **Step 2: 实现生产配置解析**

创建 `src/server/config/production.ts`：

```ts
import { z } from "zod";

export type ProductionConfig = {
  sessionSecret: string;
  qwenApiKey: string;
  deepseekApiKey: string;
  imageStorageDriver: "oss";
  ossRegion: string;
  ossBucket: string;
  ossAccessKeyId: string;
  ossAccessKeySecret: string;
  pgliteDataDir: string;
};

const ProductionEnvSchema = z.object({
  SESSION_SECRET: z.string().min(32),
  QWEN_API_KEY: z.string().min(1),
  DEEPSEEK_API_KEY: z.string().min(1),
  IMAGE_STORAGE_DRIVER: z.literal("oss"),
  OSS_REGION: z.string().min(1),
  OSS_BUCKET: z.string().min(1),
  OSS_ACCESS_KEY_ID: z.string().min(1),
  OSS_ACCESS_KEY_SECRET: z.string().min(1),
  PGLITE_DATA_DIR: z.string().min(1),
});

export function readProductionConfig(env: Record<string, string | undefined>): ProductionConfig {
  const parsed = ProductionEnvSchema.safeParse(env);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))]
      .sort()
      .join(",");
    throw new Error(`INVALID_PRODUCTION_ENV:${fields}`);
  }
  return {
    sessionSecret: parsed.data.SESSION_SECRET,
    qwenApiKey: parsed.data.QWEN_API_KEY,
    deepseekApiKey: parsed.data.DEEPSEEK_API_KEY,
    imageStorageDriver: parsed.data.IMAGE_STORAGE_DRIVER,
    ossRegion: parsed.data.OSS_REGION,
    ossBucket: parsed.data.OSS_BUCKET,
    ossAccessKeyId: parsed.data.OSS_ACCESS_KEY_ID,
    ossAccessKeySecret: parsed.data.OSS_ACCESS_KEY_SECRET,
    pgliteDataDir: parsed.data.PGLITE_DATA_DIR,
  };
}
```

- [ ] **Step 3: 写入清理调度失败测试**

创建 `src/server/generation/cleanup-scheduler.test.ts`：

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { resetCleanupSchedulerForTests, startCleanupScheduler } from "./cleanup-scheduler";

afterEach(() => {
  resetCleanupSchedulerForTests();
  vi.useRealTimers();
});

describe("startCleanupScheduler", () => {
  it("runs immediately, repeats, and does not start twice", async () => {
    vi.useFakeTimers();
    const clean = vi.fn().mockResolvedValue(undefined);

    startCleanupScheduler({ clean, intervalMs: 60_000 });
    startCleanupScheduler({ clean, intervalMs: 60_000 });
    await vi.runAllTicks();
    expect(clean).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(clean).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 4: 实现不重入的单进程调度器与 instrumentation**

创建 `src/server/generation/cleanup-scheduler.ts`：

```ts
type Options = {
  clean(): Promise<void>;
  intervalMs: number;
};

let stopCurrent: (() => void) | undefined;
let running = false;

export function startCleanupScheduler(options: Options) {
  if (stopCurrent) return stopCurrent;

  async function run() {
    if (running) return;
    running = true;
    try {
      await options.clean();
    } catch {
      console.error("image cleanup failed");
    } finally {
      running = false;
    }
  }

  void run();
  const timer = setInterval(() => void run(), options.intervalMs);
  stopCurrent = () => {
    clearInterval(timer);
    stopCurrent = undefined;
    running = false;
  };
  return stopCurrent;
}

export function resetCleanupSchedulerForTests() {
  stopCurrent?.();
  stopCurrent = undefined;
  running = false;
}
```

创建 `src/instrumentation.ts`：

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  if (process.env.NODE_ENV === "production") {
    const { readProductionConfig } = await import("@/server/config/production");
    readProductionConfig(process.env);
  }
  if (process.env.ENABLE_INLINE_CLEANUP !== "1") return;

  const [{ getRuntimeDatabase }, { deleteExpiredImages }, { startCleanupScheduler }, { getImageStorage }] = await Promise.all([
    import("@/server/db/runtime"),
    import("@/server/generation/cleanup-worker"),
    import("@/server/generation/cleanup-scheduler"),
    import("@/server/storage"),
  ]);
  const { db } = await getRuntimeDatabase();
  const storage = getImageStorage();
  startCleanupScheduler({
    clean: () => deleteExpiredImages(db, storage).then(() => undefined),
    intervalMs: Math.max(60_000, Number(process.env.CLEANUP_INTERVAL_MS ?? 60_000)),
  });
}
```

- [ ] **Step 5: 写入并实现健康检查**

创建 `src/app/api/health/route.test.ts`：

```ts
// @vitest-environment node

import { describe, expect, it } from "vitest";

import { createHealthRoute } from "./route";

describe("GET /api/health", () => {
  it("returns 200 when the database is available", async () => {
    const response = await createHealthRoute(async () => undefined)();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("returns a sanitized 503 when the database is unavailable", async () => {
    const response = await createHealthRoute(async () => {
      throw new Error("private database path");
    })();
    const text = await response.text();
    expect(response.status).toBe(503);
    expect(text).toContain('"ok":false');
    expect(text).not.toContain("private database path");
  });
});
```

创建 `src/app/api/health/route.ts`：

```ts
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
```

- [ ] **Step 6: 增加生产环境示例值并验证**

`.env.example` 增加：

```dotenv
PGLITE_DATA_DIR=.data/pglite
ENABLE_INLINE_CLEANUP=0
CLEANUP_INTERVAL_MS=60000
```

Run:

```bash
pnpm exec vitest run src/server/config/production.test.ts src/server/generation/cleanup-scheduler.test.ts src/app/api/health/route.test.ts src/server/generation/cleanup-worker.test.ts
```

Expected: 全部通过，健康检查不泄露数据库异常，调度器只启动一次。

- [ ] **Step 7: 提交生产运行基础**

```bash
git add src/server/config/production.ts src/server/config/production.test.ts src/server/generation/cleanup-scheduler.ts src/server/generation/cleanup-scheduler.test.ts src/instrumentation.ts src/app/api/health/route.ts src/app/api/health/route.test.ts .env.example
git commit -m "feat: add production health and cleanup runtime"
```

---

### Task 5: 打包阿里云香港 ECS 的 Docker/HTTPS 部署

**Files:**
- Create: `.dockerignore`
- Create: `Dockerfile`
- Create: `deploy/Caddyfile`
- Create: `deploy/compose.yml`
- Create: `deploy/.env.production.example`
- Create: `docs/deployment/aliyun-hk-ecs.md`
- Modify: `next.config.ts`
- Modify: `README.md`
- Modify: `docs/development/backend-local-setup.md`

**Interfaces:**
- Consumes: `GET /api/health`、`PGLITE_DATA_DIR=/app/.data/pglite`、私有 OSS 环境变量。
- Produces: 单应用副本、持久化 `wanwuyouxi-data` volume、Caddy 自动 HTTPS、容器健康检查与可复制的上线/回滚步骤。

- [ ] **Step 1: 让 Next.js 生成 standalone 产物**

在 `next.config.ts` 增加：

```ts
  output: "standalone",
```

保留现有 `allowedDevOrigins`、`devIndicators` 和 `serverExternalPackages`。

- [ ] **Step 2: 创建确定性的 Docker 构建文件**

创建 `.dockerignore`：

```text
.git
.next
.data
node_modules
test-results
.env.local
deploy/.env.production
```

创建 `Dockerfile`：

```dockerfile
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
RUN mkdir -p /app/.data && chown -R node:node /app
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 3: 创建 Caddy 与 Compose 配置**

创建 `deploy/Caddyfile`：

```caddyfile
{$APP_DOMAIN} {
  encode zstd gzip
  reverse_proxy app:3000
  header {
    X-Content-Type-Options nosniff
    Referrer-Policy strict-origin-when-cross-origin
    -Server
  }
}
```

创建 `deploy/compose.yml`：

```yaml
services:
  app:
    build:
      context: ..
      dockerfile: Dockerfile
    restart: unless-stopped
    env_file: .env.production
    environment:
      NODE_ENV: production
      HOSTNAME: 0.0.0.0
      PORT: 3000
      PGLITE_DATA_DIR: /app/.data/pglite
      ENABLE_INLINE_CLEANUP: "1"
    volumes:
      - app-data:/app/.data
    expose:
      - "3000"
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 30s

  caddy:
    image: caddy:2.10-alpine
    restart: unless-stopped
    depends_on:
      app:
        condition: service_healthy
    environment:
      APP_DOMAIN: ${APP_DOMAIN}
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config

volumes:
  app-data:
    name: wanwuyouxi-data
  caddy-data:
  caddy-config:
```

- [ ] **Step 4: 创建无秘密的生产变量模板**

`deploy/.env.production.example` 必须只含空值或非敏感默认值：

```dotenv
APP_DOMAIN=
SESSION_SECRET=
QWEN_API_KEY=
QWEN_VISION_MODEL=qwen3-vl-plus
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com
GENERATION_TIMEOUT_MS=30000
IMAGE_STORAGE_DRIVER=oss
OSS_REGION=oss-cn-hongkong
OSS_BUCKET=
OSS_ACCESS_KEY_ID=
OSS_ACCESS_KEY_SECRET=
DAILY_CASE_LIMIT=3
CLEANUP_INTERVAL_MS=60000
```

- [ ] **Step 5: 编写上线、验证、备份和回滚文档**

创建 `docs/deployment/aliyun-hk-ecs.md`，必须按以下顺序给出可复制命令：

1. 购买一个香港区域、Ubuntu、至少 2 vCPU / 2 GB 内存、带公网 IP 的 ECS；安全组只开放 SSH、80、443。
2. 将域名 A 记录指向 ECS 公网 IP，等待解析生效。
3. 安装 Docker Engine 与 Compose 插件。
4. 克隆 GitHub 仓库并进入项目目录。
5. `cp deploy/.env.production.example deploy/.env.production`，用 `openssl rand -base64 48` 生成 `SESSION_SECRET`，其余密钥只填服务器文件。
6. 执行：

```bash
docker compose -f deploy/compose.yml --env-file deploy/.env.production up -d --build
docker compose -f deploy/compose.yml --env-file deploy/.env.production ps
curl -fsS "https://你的域名/api/health"
```

7. 备份数据库卷：

```bash
mkdir -p backups
docker run --rm -v wanwuyouxi-data:/data -v "$PWD/backups:/backup" alpine sh -c 'tar czf /backup/pglite-$(date +%Y%m%d-%H%M%S).tgz -C /data .'
```

8. 更新前先备份，随后 `git pull --ff-only` 和 `docker compose ... up -d --build`。
9. 回滚使用上一个 Git commit，重新构建；不得删除 `wanwuyouxi-data` volume。
10. Key 泄露时先在供应商撤销旧 Key，再更新服务器变量和重启容器。

文档不得包含真实域名、IP、Token、AccessKey 或 Bucket 名称。

- [ ] **Step 6: 更新 README 与本地指南的部署边界**

在 README 增加“正式部署”链接，明确当前作品集采用香港 ECS 单实例。把 `backend-local-setup.md` 中“生产必须接入 RDS”的表述改为：作品集低流量阶段使用挂载云盘的单实例 PGlite；禁止多副本；需要扩容时再迁移 RDS。

- [ ] **Step 7: 验证生产构建与 Compose 配置**

Run:

```bash
pnpm lint
pnpm test:run
pnpm build
docker compose -f deploy/compose.yml --env-file deploy/.env.production.example config
docker build -t wanwuyouxi:verify .
```

Expected: lint、86 项以上测试和生产构建通过；Compose 配置可解析；Docker 镜像构建成功；构建输出不包含 `.env.local`。

- [ ] **Step 8: 本地容器冒烟与移动端端到端验证**

使用仅包含测试/fake provider 的本地生产变量启动容器，不填真实模型 Key；验证：

```bash
curl -fsS http://127.0.0.1:3000/api/health
pnpm exec playwright test tests/e2e/iphone-layout.spec.ts tests/e2e/happy-path.spec.ts --project=mobile-chromium
```

Expected: 健康检查 200；首页无伪状态栏；示例案件完整通关；不产生真实模型费用。

- [ ] **Step 9: 提交部署包**

```bash
git add .dockerignore Dockerfile deploy/Caddyfile deploy/compose.yml deploy/.env.production.example docs/deployment/aliyun-hk-ecs.md next.config.ts README.md docs/development/backend-local-setup.md
git commit -m "feat: package single-instance public deployment"
```

---

## Final verification gate

- [ ] `pnpm lint` exit 0。
- [ ] `pnpm test:run` 0 failures；真实模型测试保持跳过。
- [ ] `pnpm build` exit 0。
- [ ] `pnpm test:e2e` 所有移动端流程通过。
- [ ] `docker build -t wanwuyouxi:verify .` exit 0。
- [ ] `docker compose ... config` exit 0。
- [ ] 浏览器检查 375×667、390×844 两种视口，无 `9:41`、按钮不越界、首页隐私文案准确。
- [ ] 生成路由第四个新案件返回 429，相同幂等键重放仍返回原任务。
- [ ] `/api/health` 不返回数据库路径、错误堆栈、Key 或 OSS 配置。
- [ ] Git diff 中不存在 `.env.local`、`deploy/.env.production`、Token、AccessKey 或真实图片。
