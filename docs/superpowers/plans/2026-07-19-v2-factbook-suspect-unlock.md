# V2 Factbook and Suspect Unlock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace V1's one-model story generation with a grounded visual-fact → case-factbook pipeline, then let players unlock exactly three suspect cards by exploring exactly three real photo objects.

**Architecture:** Qwen Vision becomes an observation-only provider that returns visible objects and coordinates; it no longer invents suspects, motives, or truth. DeepSeek compiles those observations into a private V2 factbook with three evidence items, three suspects, three claims, and one unique `claimId + evidenceId` contradiction. The existing `cases.privatePayload` JSON column stores the new payload without a database migration, while a strict player projection hides the liar, private actions, contradiction explanation, and truth.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod, Drizzle ORM/PGlite, OpenAI-compatible Qwen and DeepSeek clients, Vitest, Testing Library, Playwright.

## Global Constraints

- Every published V2 case has exactly three unique evidence items and exactly three unique suspects.
- Every evidence item references a high-confidence visual fact returned by Qwen from the uploaded photo.
- Qwen never generates suspects, motives, testimony, liar identity, contradiction, or truth.
- DeepSeek never receives the original photo URL, image bytes, session identifier, job identifier, or storage key.
- Exactly one claim contradicts exactly one evidence item, and that pair identifies exactly one liar.
- The browser never receives `liarSuspectId`, suspect private actions, allowed fact IDs, contradiction explanation, motive, evidence chain, or full truth before reveal.
- Runtime portraits come only from the fixed `portraitKey` allowlist; no portrait image model call is allowed.
- Existing anonymous session, image deletion, daily generation limit, job retry, private OSS, and two-attempt answer behavior remain intact.
- This plan intentionally excludes free interrogation, suspect + evidence combination submission, dossier PNG rendering, and comic generation; those are separate testable plans built on the interfaces produced here.

---

## File Map

- `src/server/cases/v2-contracts.ts`: private factbook, player projection, visual observation, and allowlisted portrait schemas.
- `src/server/cases/v2-validator.ts`: deterministic grounding, uniqueness, reference, portrait, and contradiction validation.
- `src/server/providers/qwen-observation.ts`: Qwen request/normalization for visual observations only.
- `src/server/providers/deepseek-compiler.ts`: DeepSeek factbook compilation and one targeted repair.
- `src/server/providers/deepseek-factbook-judge.ts`: independent semantic uniqueness and solvability review.
- `src/server/providers/prompts/qwen-observation-system.ts`: observation-only system contract.
- `src/server/providers/prompts/deepseek-compiler-system.ts`: grounded factbook compilation contract.
- `src/server/providers/prompts/deepseek-factbook-judge-system.ts`: no-new-facts semantic review contract.
- `src/server/providers/types.ts`: new provider interfaces shared by orchestration and fakes.
- `src/server/generation/orchestrator.ts`: observation → compile → validate → judge/repair → publish pipeline.
- `src/server/providers/fake.ts`: deterministic V2 sample factbook used by tests and no-key mode.
- `src/server/cases/contracts.ts`: versioned private payload union and player-case union.
- `src/server/cases/service.ts`: V2 player projection and reveal response.
- `src/features/game/types.ts`: V2 player-facing evidence/suspect types and versioned case union.
- `src/features/game/api-client.ts`: client-side V2 response validation.
- `src/features/game/game-machine.ts`: evidence unlock state and suspect-card selection.
- `src/features/game/game-app.tsx`: wires evidence exploration to suspect cards.
- `src/components/suspect-card.tsx`: compact unlocked suspect summary.
- `src/components/suspect-sheet.tsx`: full suspect profile without interrogation controls.
- `src/components/explore-screen.tsx`: renders evidence hotspots and unlocked suspects.
- `src/app/globals.css`: mobile suspect rail, locked/unlocked states, and sheet styling.
- `tests/e2e/v2-suspect-unlock.spec.ts`: end-to-end sample-case evidence and suspect unlock flow.

---

### Task 1: Define the V2 observation and factbook contracts

**Files:**
- Create: `src/server/cases/v2-contracts.ts`
- Create: `src/server/cases/v2-contracts.test.ts`
- Modify: `src/server/cases/contracts.ts`

**Interfaces:**
- Produces: `VisionObservation`, `V2PrivateCase`, `V2PlayerCase`, `toV2PlayerCase(value)`.
- Produces: `PORTRAIT_KEYS`, a fixed tuple used by compiler validation and UI asset lookup.
- Consumes: no new runtime dependency.

- [ ] **Step 1: Write contract tests that prove private fields cannot enter the player view**

Create `src/server/cases/v2-contracts.test.ts` with a complete valid fixture imported from the same test file and these assertions:

```ts
import { describe, expect, it } from "vitest";

import {
  V2PrivateCaseSchema,
  VisionObservationSchema,
  toV2PlayerCase,
} from "./v2-contracts";

export const validObservation = {
  decision: "PASS" as const,
  sceneSummary: "一张有台灯、书本和杯子的木桌",
  riskLabels: [],
  visualFacts: [
    { id: "vf-lamp", objectName: "台灯", visibleDescription: "灯罩朝向墙面", regionHint: "左侧", x: 0.24, y: 0.35, radius: 0.08, confidence: 0.95 },
    { id: "vf-book", objectName: "书本", visibleDescription: "书页有反向折痕", regionHint: "中央", x: 0.51, y: 0.55, radius: 0.08, confidence: 0.94 },
    { id: "vf-cup", objectName: "杯子", visibleDescription: "杯底有一圈水印", regionHint: "右侧", x: 0.76, y: 0.62, radius: 0.08, confidence: 0.93 },
  ],
};

export const validV2Case = {
  version: 2 as const,
  title: "午夜桌面的证词",
  caseNumber: "WY-V2-001",
  background: "闭馆前，保管箱钥匙在这张桌边短暂失踪，三个人都声称没有移动关键物品。",
  objective: "检查三件物证，判断谁的证词与现场矛盾。",
  interactionMode: "HOTSPOT" as const,
  visualFacts: validObservation.visualFacts,
  evidence: [
    { id: "ev-lamp", visualFactId: "vf-lamp", suspectId: "su-lin", objectName: "台灯", publicDescription: "灯罩朝向墙面，与值班记录中的照明方向不同。", regionHint: "左侧", x: 0.24, y: 0.35, radius: 0.08, confidence: 0.95 },
    { id: "ev-book", visualFactId: "vf-book", suspectId: "su-zhou", objectName: "书本", publicDescription: "书页留下朝向门口的反向折痕。", regionHint: "中央", x: 0.51, y: 0.55, radius: 0.08, confidence: 0.94 },
    { id: "ev-cup", visualFactId: "vf-cup", suspectId: "su-qiao", objectName: "杯子", publicDescription: "杯底的新水印覆盖了原本连续的灰尘。", regionHint: "右侧", x: 0.76, y: 0.62, radius: 0.08, confidence: 0.93 },
  ],
  suspects: [
    { id: "su-lin", name: "林默", identity: "夜班管理员", relation: "负责闭馆巡检", personalityTags: ["克制", "谨慎"], portraitKey: "noir-01", initialTestimony: "我只关了台灯，没有碰桌上的其他东西。", privateAction: "闭馆前调整过台灯", allowedFactIds: ["tf-1", "cl-lin"] },
    { id: "su-zhou", name: "周岚", identity: "资料员", relation: "最后整理借阅资料", personalityTags: ["直接", "急躁"], portraitKey: "noir-02", initialTestimony: "我把书合上后就离开了。", privateAction: "整理书本后离开", allowedFactIds: ["tf-2", "cl-zhou"] },
    { id: "su-qiao", name: "乔野", identity: "临时访客", relation: "在闭馆前来取文件", personalityTags: ["冷静", "回避"], portraitKey: "noir-03", initialTestimony: "杯子从始至终都在原位。", privateAction: "移动杯子取走钥匙后放回", allowedFactIds: ["tf-3", "cl-qiao"] },
  ],
  timelineFacts: [
    { id: "tf-1", timeLabel: "22:40", text: "林默完成照明巡检。" },
    { id: "tf-2", timeLabel: "22:45", text: "周岚合上最后一本资料。" },
    { id: "tf-3", timeLabel: "22:50", text: "乔野在桌边短暂停留。" },
  ],
  claims: [
    { id: "cl-lin", suspectId: "su-lin", text: "我只调整了台灯。", factRefs: ["tf-1"], evidenceRefs: ["ev-lamp"] },
    { id: "cl-zhou", suspectId: "su-zhou", text: "我合上书后马上离开。", factRefs: ["tf-2"], evidenceRefs: ["ev-book"] },
    { id: "cl-qiao", suspectId: "su-qiao", text: "杯子一直没有离开原位。", factRefs: ["tf-3"], evidenceRefs: ["ev-cup"] },
  ],
  liarSuspectId: "su-qiao",
  contradiction: { claimId: "cl-qiao", evidenceId: "ev-cup", explanation: "新水印覆盖旧灰尘，证明杯子曾被拿起并放回。" },
  wrongAnswerHint: "把证词里的绝对说法与物证的新旧痕迹对照。",
  truth: { summary: "乔野移动杯子取走钥匙后又将其放回。", motive: "他想在不惊动管理员的情况下取走文件。", evidenceChain: ["杯底新水印", "被覆盖的旧灰尘", "杯子始终未动的证词"] },
};

describe("V2 contracts", () => {
  it("accepts three grounded observations and one complete factbook", () => {
    expect(VisionObservationSchema.parse(validObservation).visualFacts).toHaveLength(3);
    expect(V2PrivateCaseSchema.parse(validV2Case).suspects).toHaveLength(3);
  });

  it("removes liar, contradiction explanation, private actions and truth", () => {
    const player = toV2PlayerCase(V2PrivateCaseSchema.parse(validV2Case));
    expect(player).not.toHaveProperty("liarSuspectId");
    expect(player).not.toHaveProperty("truth");
    expect(player).not.toHaveProperty("visualFacts");
    expect(player.suspects[0]).not.toHaveProperty("privateAction");
    expect(player.suspects[0]).not.toHaveProperty("allowedFactIds");
    expect(player).not.toHaveProperty("contradiction");
  });
});
```

- [ ] **Step 2: Run the test and verify the module is missing**

Run: `pnpm exec vitest run src/server/cases/v2-contracts.test.ts`

Expected: FAIL because `./v2-contracts` does not exist.

- [ ] **Step 3: Implement strict schemas and the player projection**

Create `src/server/cases/v2-contracts.ts`. Use tuples for exactly-three fields, `.strict()` for private structural objects, lowercase stable IDs matching `/^[a-z0-9-]{1,40}$/`, text limits copied below, and this public interface:

```ts
import { z } from "zod";

const StableIdSchema = z.string().min(1).max(40).regex(/^[a-z0-9-]+$/);
export const PORTRAIT_KEYS = ["noir-01", "noir-02", "noir-03", "noir-04", "noir-05", "noir-06", "noir-07", "noir-08", "noir-09", "noir-10", "noir-11", "noir-12"] as const;
export const PortraitKeySchema = z.enum(PORTRAIT_KEYS);

export const VisualFactSchema = z.object({
  id: StableIdSchema,
  objectName: z.string().min(1).max(12),
  visibleDescription: z.string().min(4).max(80),
  regionHint: z.string().min(1).max(24),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  radius: z.number().min(0.04).max(0.12),
  confidence: z.number().min(0).max(1),
}).strict();

const ObservationPassSchema = z.object({
  decision: z.literal("PASS"),
  sceneSummary: z.string().min(6).max(120),
  riskLabels: z.array(z.string().max(40)).max(5),
  visualFacts: z.array(VisualFactSchema).min(3).max(8),
}).strict();

const ObservationRejectSchema = z.object({
  decision: z.enum(["RETRY", "BLOCK"]),
  reasonCode: z.enum(["TOO_DARK", "BLURRY", "NOT_A_SPACE", "TOO_FEW_OBJECTS", "UNSAFE"]),
  sceneSummary: z.string().max(120),
  riskLabels: z.array(z.string().max(40)).max(5),
  visualFacts: z.array(VisualFactSchema).max(8),
}).strict();

export const VisionObservationSchema = z.discriminatedUnion("decision", [ObservationPassSchema, ObservationRejectSchema]);
export type VisionObservation = z.infer<typeof VisionObservationSchema>;

export const EvidenceSchema = VisualFactSchema.omit({ visibleDescription: true }).extend({
  id: StableIdSchema,
  visualFactId: StableIdSchema,
  suspectId: StableIdSchema,
  publicDescription: z.string().min(8).max(120),
}).strict();

export const PrivateSuspectSchema = z.object({
  id: StableIdSchema,
  name: z.string().min(2).max(12),
  identity: z.string().min(2).max(24),
  relation: z.string().min(4).max(60),
  personalityTags: z.tuple([z.string().min(1).max(8), z.string().min(1).max(8)]),
  portraitKey: PortraitKeySchema,
  initialTestimony: z.string().min(8).max(140),
  privateAction: z.string().min(6).max(120),
  allowedFactIds: z.array(StableIdSchema).min(1).max(12),
}).strict();

const TimelineFactSchema = z.object({ id: StableIdSchema, timeLabel: z.string().min(2).max(12), text: z.string().min(6).max(120) }).strict();
const ClaimSchema = z.object({ id: StableIdSchema, suspectId: StableIdSchema, text: z.string().min(8).max(140), factRefs: z.array(StableIdSchema).min(1).max(6), evidenceRefs: z.array(StableIdSchema).min(1).max(3) }).strict();

export const V2PrivateCaseSchema = z.object({
  version: z.literal(2),
  title: z.string().min(4).max(24),
  caseNumber: z.string().min(4).max(24),
  background: z.string().min(12).max(220),
  objective: z.string().min(6).max(100),
  interactionMode: z.enum(["HOTSPOT", "CARD_FALLBACK"]),
  visualFacts: z.array(VisualFactSchema).min(3).max(8),
  evidence: z.tuple([EvidenceSchema, EvidenceSchema, EvidenceSchema]),
  suspects: z.tuple([PrivateSuspectSchema, PrivateSuspectSchema, PrivateSuspectSchema]),
  timelineFacts: z.array(TimelineFactSchema).min(3).max(8),
  claims: z.tuple([ClaimSchema, ClaimSchema, ClaimSchema]),
  liarSuspectId: StableIdSchema,
  contradiction: z.object({ claimId: StableIdSchema, evidenceId: StableIdSchema, explanation: z.string().min(8).max(160) }).strict(),
  wrongAnswerHint: z.string().min(4).max(100),
  truth: z.object({ summary: z.string().min(12).max(240), motive: z.string().min(8).max(160), evidenceChain: z.array(z.string().min(4).max(80)).min(2).max(5) }).strict(),
}).strict();

export type V2PrivateCase = z.infer<typeof V2PrivateCaseSchema>;
export type V2PlayerCase = ReturnType<typeof toV2PlayerCase>;

export function toV2PlayerCase(value: V2PrivateCase) {
  return {
    version: value.version,
    title: value.title,
    caseNumber: value.caseNumber,
    background: value.background,
    objective: value.objective,
    interactionMode: value.interactionMode,
    evidence: value.evidence,
    suspects: value.suspects.map(({ privateAction: _privateAction, allowedFactIds: _allowedFactIds, ...suspect }) => suspect) as [Omit<V2PrivateCase["suspects"][number], "privateAction" | "allowedFactIds">, Omit<V2PrivateCase["suspects"][number], "privateAction" | "allowedFactIds">, Omit<V2PrivateCase["suspects"][number], "privateAction" | "allowedFactIds">],
    claims: value.claims.map(({ factRefs: _factRefs, evidenceRefs: _evidenceRefs, ...claim }) => claim) as [Omit<V2PrivateCase["claims"][number], "factRefs" | "evidenceRefs">, Omit<V2PrivateCase["claims"][number], "factRefs" | "evidenceRefs">, Omit<V2PrivateCase["claims"][number], "factRefs" | "evidenceRefs">],
    wrongAnswerHint: value.wrongAnswerHint,
  };
}
```

Update `contracts.ts` with `PrivatePayloadSchema = z.union([PrivateCaseSchema, V2PrivateCaseSchema])`, matching `PrivatePayload` and `PlayerPayload` types, and a `toPlayerPayload` function that dispatches on `"version" in value && value.version === 2`. Keep existing V1 exports until all V1 tests and stored rows can still load.

- [ ] **Step 4: Run the contract suites**

Run: `pnpm exec vitest run src/server/cases/v2-contracts.test.ts src/server/cases/contracts.test.ts`

Expected: PASS; V1 compatibility tests remain green.

- [ ] **Step 5: Commit the versioned contracts**

```bash
git add src/server/cases/v2-contracts.ts src/server/cases/v2-contracts.test.ts src/server/cases/contracts.ts
git commit -m "feat: define grounded v2 case factbook"
```

---

### Task 2: Make Qwen an observation-only vision provider

**Files:**
- Create: `src/server/providers/prompts/qwen-observation-system.ts`
- Create: `src/server/providers/qwen-observation.ts`
- Create: `src/server/providers/qwen-observation.test.ts`
- Modify: `src/server/providers/types.ts`

**Interfaces:**
- Produces: `VisionObservationProvider.observeScene(input): Promise<VisionObservation>`.
- Produces: `QwenObservationProvider` and `createQwenObservationProviderFromEnv()`.
- Consumes: `VisionObservationSchema` from Task 1.

- [ ] **Step 1: Write provider tests for grounding and forbidden story fields**

Create a fake transport that captures the request and returns `validObservation`. Assert:

```ts
const observation = await provider.observeScene({ imageUrl: "signed://photo", imageWidth: 1200, imageHeight: 1600, locale: "zh-CN", traceId: "trace" });
expect(observation.decision).toBe("PASS");
expect(observation.visualFacts).toHaveLength(3);
expect(captured.messages[0].content).toContain("不得生成嫌疑人");
expect(JSON.stringify(observation)).not.toContain("liarSuspectId");
```

Add a second test returning a fact whose `confidence` is `"94"` and coordinates are percentages (`"51"`, `"55"`); expect normalized values `0.94`, `0.51`, and `0.55`. Add a third malformed-output test expecting `ProviderError("BAD_OUTPUT", "QWEN_OBSERVATION_SCHEMA_INVALID")`.

- [ ] **Step 2: Run the tests and verify the provider is missing**

Run: `pnpm exec vitest run src/server/providers/qwen-observation.test.ts`

Expected: FAIL because the provider module does not exist.

- [ ] **Step 3: Define the observation-only interface and prompt**

Add to `providers/types.ts`:

```ts
export interface VisionObservationProvider {
  observeScene(input: {
    imageUrl: string;
    imageWidth: number;
    imageHeight: number;
    locale: "zh-CN";
    traceId: string;
  }): Promise<VisionObservation>;
}
```

The system prompt must state: return JSON only; list 3–8 visible movable objects; describe only visible shape/position/state; normalized coordinates; reject faces, credentials, chats, unsafe content, dark/blurred/non-space images; do not infer text too small to read; and explicitly “不得生成嫌疑人、人物身份、动机、证词、时间线、凶手、矛盾或案件真相”.

- [ ] **Step 4: Implement transport, timeout, normalization, and schema parsing**

Mirror the existing Qwen OpenAI-compatible transport but call `observeScene`. Send the image only to Qwen, use `max_tokens: 2048`, and normalize only observation fields. On parse failure log only `QWEN_OBSERVATION_SCHEMA_INVALID` plus up to 12 Zod field paths; never log content.

- [ ] **Step 5: Run provider and live-test compile checks**

Run: `pnpm exec vitest run src/server/providers/qwen-observation.test.ts src/server/providers/qwen.test.ts src/server/providers/live-ai.test.ts`

Expected: observation tests pass; existing live tests remain skipped unless `RUN_LIVE_AI_TESTS=1`.

- [ ] **Step 6: Commit the observation provider**

```bash
git add src/server/providers/types.ts src/server/providers/qwen-observation.ts src/server/providers/qwen-observation.test.ts src/server/providers/prompts/qwen-observation-system.ts
git commit -m "feat: separate visual observation from story generation"
```

---

### Task 3: Compile and semantically judge a unique factbook with DeepSeek

**Files:**
- Create: `src/server/providers/prompts/deepseek-compiler-system.ts`
- Create: `src/server/providers/prompts/deepseek-factbook-judge-system.ts`
- Create: `src/server/providers/deepseek-compiler.ts`
- Create: `src/server/providers/deepseek-compiler.test.ts`
- Create: `src/server/providers/deepseek-factbook-judge.ts`
- Create: `src/server/providers/deepseek-factbook-judge.test.ts`
- Modify: `src/server/providers/types.ts`

**Interfaces:**
- Produces: `CaseFactbookCompiler.compileCase(input): Promise<V2PrivateCase>`.
- Produces: `CaseFactbookCompiler.repairCase(input): Promise<V2PrivateCase>`.
- Produces: `CaseFactbookJudge.validateCase(input): Promise<SemanticValidation>`.
- Consumes: `VisionObservation`, `V2PrivateCase`, and existing `ValidationIssue`.

- [ ] **Step 1: Write tests that inspect the exact data boundary sent to DeepSeek**

Use `validObservation` and a fake transport returning `validV2Case`. Capture the user message, parse it as JSON, and assert:

```ts
expect(payload).toEqual({ observation: validObservation });
expect(JSON.stringify(payload)).not.toContain("signed://");
expect(JSON.stringify(payload)).not.toContain("sessionId");
expect(JSON.stringify(payload)).not.toContain("traceId");
expect(compiled.contradiction).toEqual({ claimId: "cl-qiao", evidenceId: "ev-cup", explanation: expect.any(String) });
```

Add failure tests for duplicate portraits and a repair response that tries to change `visualFacts`; both must throw `DEEPSEEK_FACTBOOK_OUTPUT_INVALID` rather than silently accepting drift.

In `deepseek-factbook-judge.test.ts`, return `{ "valid": false, "confidence": 0.96, "issues": [{ "code": "NON_UNIQUE", "field": "contradiction", "message": "两组人物与物证都能成立" }] }`. Assert the result remains invalid, the judge request contains only `semanticV2Case`, and its serialized payload contains none of `imageUrl`, `storageKey`, `sessionId`, or `traceId`. Add malformed JSON and out-of-range confidence cases expecting `DEEPSEEK_FACTBOOK_JUDGE_OUTPUT_INVALID`.

- [ ] **Step 2: Run the compiler test and verify the module is missing**

Run: `pnpm exec vitest run src/server/providers/deepseek-compiler.test.ts`

Expected: FAIL because the compiler module does not exist.

- [ ] **Step 3: Add the compiler interface**

```ts
export interface CaseFactbookCompiler {
  compileCase(input: { observation: Extract<VisionObservation, { decision: "PASS" }>; traceId: string }): Promise<V2PrivateCase>;
  repairCase(input: { game: V2PrivateCase; issues: ValidationIssue[]; traceId: string }): Promise<V2PrivateCase>;
}

export interface CaseFactbookJudge {
  validateCase(input: { game: V2PrivateCase; traceId: string }): Promise<SemanticValidation>;
}
```

- [ ] **Step 4: Implement the compile prompt and provider**

The compiler prompt must require exactly three evidence items, suspects, and claims; a one-to-one evidence-to-suspect mapping; three unique allowlisted `portraitKey` values; one liar; one contradiction; all evidence coordinates copied exactly from referenced visual facts; no new objects; and a truth supported only by public claims plus evidence. The transport receives `JSON.stringify({ observation })` and never receives the trace ID inside the model message.

Repair input must be exactly `{ case: semanticV2Case(game), issues }`. `semanticV2Case` excludes the original photo, URLs, coordinates, and trace/session IDs. Repair is allowed to change public copy, claims, timeline, liar, contradiction, and truth, but must preserve `visualFacts`, evidence IDs, evidence `visualFactId`, object names, coordinates, suspect IDs, and portrait keys. Compare these immutable fields after parsing; reject drift.

Implement `DeepSeekFactbookJudge` as a separate request using `DEEPSEEK_FACTBOOK_JUDGE_SYSTEM_PROMPT`. Its user payload is `{ case: semanticV2Case(game) }`. The prompt must return only the existing `SemanticValidation` JSON, reject cases where more than one suspect/evidence pair fits, reject contradictions that require hidden facts, and never propose new facts. Unlike V1 `DeepSeekCaseJudge`, this judge accepts `V2PrivateCase` and does not accept `visibleObjectNames` because grounding is checked deterministically against `visualFacts`.

- [ ] **Step 5: Run compiler tests**

Run: `pnpm exec vitest run src/server/providers/deepseek-compiler.test.ts src/server/providers/deepseek-factbook-judge.test.ts src/server/providers/deepseek.test.ts`

Expected: PASS with no request containing a photo URL or trace/session ID.

- [ ] **Step 6: Commit the compiler**

```bash
git add src/server/providers/types.ts src/server/providers/deepseek-compiler.ts src/server/providers/deepseek-compiler.test.ts src/server/providers/deepseek-factbook-judge.ts src/server/providers/deepseek-factbook-judge.test.ts src/server/providers/prompts/deepseek-compiler-system.ts src/server/providers/prompts/deepseek-factbook-judge-system.ts
git commit -m "feat: compile grounded case factbooks"
```

---

### Task 4: Add deterministic V2 validation and switch generation orchestration

**Files:**
- Create: `src/server/cases/v2-validator.ts`
- Create: `src/server/cases/v2-validator.test.ts`
- Modify: `src/server/generation/orchestrator.ts`
- Modify: `src/server/generation/orchestrator.test.ts`
- Modify: `src/server/generation/inline-worker.ts`
- Modify: `src/server/providers/index.ts`
- Modify: `src/server/providers/fake.ts`

**Interfaces:**
- Produces: `validateV2Case(game, observation, imageAspect): V2ValidationResult`.
- Consumes: `VisionObservationProvider`, `CaseFactbookCompiler`, `CaseFactbookJudge`, job repository, case repository, and image storage.

- [ ] **Step 1: Write validator tests for every uniqueness and reference boundary**

Create one passing test with `validObservation` and `validV2Case`. Create table-driven failing cases expecting these exact issue codes:

```ts
[
  ["duplicate evidence ids", mutate({ evidence1Id: "ev-lamp" }), "DUPLICATE_EVIDENCE"],
  ["duplicate suspects", mutate({ suspect1Id: "su-lin" }), "DUPLICATE_SUSPECT"],
  ["duplicate portraits", mutate({ suspect1Portrait: "noir-01" }), "DUPLICATE_PORTRAIT"],
  ["unknown visual fact", mutate({ evidence0VisualFactId: "vf-missing" }), "EVIDENCE_NOT_VISIBLE"],
  ["coordinate drift", mutate({ evidence0X: 0.9 }), "EVIDENCE_COORDINATE_DRIFT"],
  ["unknown liar", mutate({ liarSuspectId: "su-missing" }), "INVALID_LIAR"],
  ["claim belongs to other suspect", mutate({ contradictionClaimSuspectId: "su-lin" }), "CONTRADICTION_LIAR_MISMATCH"],
  ["evidence belongs to other suspect", mutate({ contradictionEvidenceSuspectId: "su-lin" }), "CONTRADICTION_EVIDENCE_MISMATCH"],
]
```

Implement `mutate` as a local fixture helper with named override fields so the test remains readable and deterministic.

- [ ] **Step 2: Run validator tests and confirm failure**

Run: `pnpm exec vitest run src/server/cases/v2-validator.test.ts`

Expected: FAIL because `validateV2Case` does not exist.

- [ ] **Step 3: Implement validation without model calls**

Return `{ publishable, game, issues }`. Verify tuple uniqueness, all references, `confidence >= 0.65`, exact object name and coordinate/radius copies, three distinct allowlisted portraits, one liar contained in suspects, contradiction claim/evidence existence, and both contradiction members belonging to the liar. Reuse the existing hotspot-overlap calculation; only low confidence or overlap may downgrade `interactionMode` to `CARD_FALLBACK`, while all reference and uniqueness issues block publication.

- [ ] **Step 4: Rewrite orchestrator tests for the two-model pipeline**

Use fakes with spies and assert call order and boundaries:

```ts
expect(vision.observeScene).toHaveBeenCalledOnce();
expect(compiler.compileCase).toHaveBeenCalledWith({ observation: validObservation, traceId: expect.any(String) });
expect(judge.validateCase).toHaveBeenCalledOnce();
expect(await jobs.getJob(jobId)).toMatchObject({ status: "SUCCEEDED" });
```

Add cases for observation rejection → `REJECTED`, deterministic factbook failure → `FAILED`, one repair → `SUCCEEDED`, and second validation failure → `FAILED`. Remove the old high-confidence judge-degraded publication path for V2: a V2 case without a successful semantic uniqueness check must not publish.

- [ ] **Step 5: Switch orchestration and provider construction**

Change generation dependencies to `vision: VisionObservationProvider`, `compiler: CaseFactbookCompiler`, and `judge: CaseFactbookJudge`. Execute: signed image URL → `observeScene` → reject or compile → transition `VALIDATING` → deterministic validation → semantic judge → at most one compiler repair → deterministic revalidation → semantic revalidation → publish. The signed URL must be discarded after Qwen and never passed to compiler or judge.

Update fake providers so no-key mode returns `validObservation` and a deterministic V2 factbook matching the sample scene.

- [ ] **Step 6: Run orchestration, worker, cleanup, and repository suites**

Run: `pnpm exec vitest run src/server/cases/v2-validator.test.ts src/server/generation/orchestrator.test.ts src/server/generation/inline-worker.test.ts src/server/db/repositories.test.ts src/server/generation/cleanup-worker.test.ts`

Expected: PASS; source image deletion still retains the published V2 JSON case.

- [ ] **Step 7: Commit the switched pipeline**

```bash
git add src/server/cases/v2-validator.ts src/server/cases/v2-validator.test.ts src/server/generation/orchestrator.ts src/server/generation/orchestrator.test.ts src/server/generation/inline-worker.ts src/server/providers/index.ts src/server/providers/fake.ts
git commit -m "feat: publish only uniquely grounded v2 cases"
```

---

### Task 5: Serve a safe V2 player view and retain V1 rows

**Files:**
- Modify: `src/server/db/schema.ts`
- Modify: `src/server/db/repositories.ts`
- Modify: `src/server/db/repositories.test.ts`
- Modify: `src/server/cases/service.ts`
- Modify: `src/server/cases/service.test.ts`
- Modify: `src/app/api/cases/[caseId]/route.ts`
- Modify: `src/app/api/cases/[caseId]/reveal/route.ts`

**Interfaces:**
- Produces: `CaseService.getPlayerCase()` returning `PlayerPayload` for V1 or V2.
- Produces: V2 reveal data `{ truth, liarSuspectId, contradiction, firstAnswerCorrect }` only after completion.
- Consumes: versioned private payload from Task 1.

- [ ] **Step 1: Add service tests proving V2 secrecy before completion**

Publish `validV2Case`, fetch it through `CaseService.getPlayerCase`, serialize the response, and assert it contains suspect names and evidence but none of:

```ts
for (const forbidden of ["liarSuspectId", "privateAction", "allowedFactIds", "explanation", "motive", "evidenceChain", "summary"]) {
  expect(JSON.stringify(player)).not.toContain(forbidden);
}
```

Assert `revealCase` throws `CASE_NOT_COMPLETED`. After marking the game complete through the repository, assert reveal includes the liar, the contradiction pair and explanation, and truth.

- [ ] **Step 2: Run service tests and confirm the V2 fixture fails to type-check or project**

Run: `pnpm exec vitest run src/server/cases/service.test.ts src/server/db/repositories.test.ts`

Expected: FAIL before the repository and service accept the versioned payload.

- [ ] **Step 3: Widen JSON payload typing without a database migration**

Change `cases.privatePayload` from `PrivateCase` to `PrivatePayload`, repository publish input likewise, and dispatch through `toPlayerPayload`. Do not alter the SQL column or generate a migration because the column remains `jsonb`.

For V2 reveal return:

```ts
{
  version: 2,
  truth: row.privateCase.truth,
  liarSuspectId: row.privateCase.liarSuspectId,
  contradiction: row.privateCase.contradiction,
  firstAnswerCorrect: row.firstAnswerCorrect,
}
```

Keep the existing V1 reveal response unchanged so stored V1 cases and current tests remain readable.

- [ ] **Step 4: Run API, service, and repository tests**

Run: `pnpm exec vitest run src/server/cases/service.test.ts src/server/db/repositories.test.ts src/app/api/generation-jobs/route.test.ts`

Expected: PASS for both payload versions; pre-reveal API output contains no V2 private fields.

- [ ] **Step 5: Commit versioned persistence and projection**

```bash
git add src/server/db/schema.ts src/server/db/repositories.ts src/server/db/repositories.test.ts src/server/cases/service.ts src/server/cases/service.test.ts src/app/api/cases/[caseId]/route.ts src/app/api/cases/[caseId]/reveal/route.ts
git commit -m "feat: serve private-safe v2 case views"
```

---

### Task 6: Unlock suspect cards from the three evidence items

**Files:**
- Create: `src/components/suspect-card.tsx`
- Create: `src/components/suspect-sheet.tsx`
- Create: `src/components/suspect-card.test.tsx`
- Modify: `src/features/game/types.ts`
- Modify: `src/features/game/api-client.ts`
- Modify: `src/features/game/api-client.test.ts`
- Modify: `src/features/game/game-machine.ts`
- Modify: `src/features/game/game-machine.test.ts`
- Modify: `src/features/game/mock-case.ts`
- Modify: `src/features/game/game-app.tsx`
- Modify: `src/components/explore-screen.tsx`
- Modify: `src/app/globals.css`
- Create: `tests/e2e/v2-suspect-unlock.spec.ts`

**Interfaces:**
- Produces: V2 client types with `evidence` and public `suspects`.
- Produces: `OPEN_EVIDENCE`, `OPEN_SUSPECT`, and `CLOSE_SUSPECT` state events.
- Consumes: V2 player payload from Task 5 and portrait assets under `public/portraits/<portraitKey>.webp`.

- [ ] **Step 1: Add client schema and reducer failure tests**

In `api-client.test.ts`, parse a V2 player response and assert private fields are rejected by the strict client schema. In `game-machine.test.ts`, assert:

```ts
const afterEvidence = transitionGame(v2ExploringState, { type: "OPEN_EVIDENCE", evidenceId: "ev-cup" });
expect(afterEvidence.openedEvidenceIds).toEqual(["ev-cup"]);
expect(afterEvidence.unlockedSuspectIds).toEqual(["su-qiao"]);

const locked = transitionGame(v2ExploringState, { type: "OPEN_SUSPECT", suspectId: "su-qiao" });
expect(locked.activeSuspectId).toBeNull();

const opened = transitionGame(afterEvidence, { type: "OPEN_SUSPECT", suspectId: "su-qiao" });
expect(opened.activeSuspectId).toBe("su-qiao");
```

- [ ] **Step 2: Run client/reducer tests and verify missing V2 fields/events**

Run: `pnpm exec vitest run src/features/game/api-client.test.ts src/features/game/game-machine.test.ts`

Expected: FAIL because the V2 client schema and events do not exist.

- [ ] **Step 3: Add versioned client types and persistent state**

Add `version: 2`, `evidence`, `suspects`, and public claims to the client union. Bump persisted `GameState.version` from `1` to `2`; add `openedEvidenceIds`, `unlockedSuspectIds`, and `activeSuspectId`. The hydration parser must discard version-1 transient state rather than attempting an unsafe partial migration; sample and live cases can be restarted from home.

For V2, `OPEN_EVIDENCE` atomically adds the evidence ID and its linked `suspectId`. `BEGIN_DEDUCTION` remains disabled until all three evidence and suspects are unlocked. V1 `OPEN_CLUE` behavior stays available for old cases.

- [ ] **Step 4: Implement suspect components**

`SuspectCard` receives `{ suspect, unlocked, onOpen }`. Locked cards show a silhouette, `嫌疑人未解锁`, and are disabled. Unlocked cards show `/portraits/${portraitKey}.webp`, name, identity, and two personality tags.

`SuspectSheet` shows portrait, name, identity, relation, personality tags, and `initialTestimony`. It must not render an input, recommended question, free-question button, or any text implying interrogation is already available. Include one “返回现场” button.

- [ ] **Step 5: Update the exploration screen**

For V2 render hotspots from `game.evidence`, keep the existing 58×58 minimum target, and open an evidence sheet using `publicDescription`. Add a horizontal three-card suspect rail above the scene footer. Opening evidence immediately animates the matching card from locked to unlocked. The footer copy becomes `已发现 N/3 物证 · 已解锁 N/3 嫌疑人` and the primary button says `整理证词` when all three are unlocked.

Use static portrait files `public/portraits/noir-01.webp` through `noir-12.webp`. Bundle twelve lightweight local WebP silhouette illustrations with distinct accent colors, hair shapes, and coat shapes; do not call an image model at runtime or reuse the same illustration under multiple keys.

- [ ] **Step 6: Write the mobile end-to-end unlock test**

The sample flow must:

```ts
await page.getByRole("button", { name: "体验示例案件" }).click();
await page.getByRole("button", { name: "进入现场" }).click();
await expect(page.getByText("已解锁 0/3 嫌疑人")).toBeVisible();
// Click each uniquely labelled evidence hotspot after locating it from the current DOM.
await expect(page.getByRole("button", { name: "查看乔野角色卡" })).toBeEnabled();
await page.getByRole("button", { name: "查看乔野角色卡" }).click();
await expect(page.getByText("杯子从始至终都在原位。")).toBeVisible();
await expect(page.getByRole("textbox")).toHaveCount(0);
```

Use stable accessible names `查看<物品名>物证` and `查看<姓名>角色卡`; do not target positional hotspot indexes.

- [ ] **Step 7: Run component, state, API, and mobile tests**

Run:

```bash
pnpm exec vitest run src/components/suspect-card.test.tsx src/features/game/api-client.test.ts src/features/game/game-machine.test.ts src/features/game/game-app.test.tsx
pnpm exec playwright test tests/e2e/v2-suspect-unlock.spec.ts tests/e2e/happy-path.spec.ts tests/e2e/iphone-layout.spec.ts --project=mobile-chromium
```

Expected: V2 unlock flow passes at 390×844 and existing 375×667 short-screen layout remains within the viewport.

- [ ] **Step 8: Commit the playable suspect-unlock slice**

```bash
git add src/components/suspect-card.tsx src/components/suspect-sheet.tsx src/components/suspect-card.test.tsx src/features/game/types.ts src/features/game/api-client.ts src/features/game/api-client.test.ts src/features/game/game-machine.ts src/features/game/game-machine.test.ts src/features/game/mock-case.ts src/features/game/game-app.tsx src/components/explore-screen.tsx src/app/globals.css public/portraits tests/e2e/v2-suspect-unlock.spec.ts
git commit -m "feat: unlock suspects from real evidence"
```

---

### Task 7: Complete the Phase 2 quality gate and document downstream interfaces

**Files:**
- Modify: `README.md`
- Create: `docs/development/v2-factbook-contract.md`

**Interfaces:**
- Produces: stable documented inputs for the next `V2 constrained interrogation` plan.
- Consumes: all Phase 2 interfaces and tests.

- [ ] **Step 1: Document the factbook and secrecy boundary**

Document these exact downstream guarantees: each suspect has one public testimony, private action, allowed fact IDs, and one linked evidence item; public claims expose text but not fact/evidence references; private factbook contains the only liar and contradiction; Phase 3 interrogation may read only the selected suspect's allowed subset; Phase 4 answer submission will accept `{ accusedSuspectId, supportingEvidenceId }`.

- [ ] **Step 2: Run the full verification gate**

Run sequentially:

```bash
pnpm lint
pnpm test:run
pnpm build
pnpm test:e2e
```

Expected: zero lint errors, all non-live tests pass, live AI tests remain skipped, production build succeeds, and all mobile flows pass.

- [ ] **Step 3: Perform a privacy response scan**

Run the sample and one fake live generation, save the pre-reveal `/api/cases/<id>` JSON to a temporary file outside the repository, and scan for:

```text
liarSuspectId
privateAction
allowedFactIds
contradiction
explanation
motive
evidenceChain
truth
```

Expected: none of the strings appear before reveal. After completing the case, the reveal response contains the correct liar, contradiction, and truth.

- [ ] **Step 4: Commit Phase 2 documentation**

```bash
git add README.md docs/development/v2-factbook-contract.md
git commit -m "docs: define v2 factbook integration boundary"
```

---

## Plan Self-Review

- **Spec coverage:** This plan covers V2 spec sections 5–6 and the evidence-to-suspect unlock portion of section 3. Sections 7–10 intentionally receive separate implementation plans after this foundation is merged.
- **Completeness:** Every task has exact files, interfaces, failure tests, commands, expected results, and commits. Portrait assets have a fixed count, path, uniqueness rule, and runtime cost of zero.
- **Type consistency:** `VisionObservationProvider` feeds `CaseFactbookCompiler`; `V2PrivateCase` feeds `CaseFactbookJudge`, deterministic validation, and persistence; `toV2PlayerCase` feeds the versioned API and client; evidence `suspectId` feeds atomic suspect unlock.
- **Backward compatibility:** V1 schemas and stored rows remain readable throughout this slice; state persistence deliberately resets incompatible version-1 transient client state.
