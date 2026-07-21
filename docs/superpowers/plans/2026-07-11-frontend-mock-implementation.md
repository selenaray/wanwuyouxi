# 万物有戏 Frontend Mock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a polished mobile-first Next.js frontend that runs the complete Wanwuyouxi MVP flow with local mock data and browser persistence, without backend or AI dependencies.

**Architecture:** Use one App Router page hosting a client-side state machine. Keep mock case data, game transition logic, persistence, and UI components separate so the mock adapters can later be replaced by API calls without rewriting screens.

**Tech Stack:** Next.js 16 App Router, React 19.2+, TypeScript, Tailwind CSS v4, Vitest, Testing Library, Playwright.

## Global Constraints

- Fixed game: one missing-person case, three clues, three answer options, two attempts.
- Use local mock data only; no database, upload service, queue, analytics vendor, or model API.
- Mobile-first at 390 × 844 px; desktop centers a phone-sized experience.
- Refresh restores the current mock game from localStorage.
- User-provided images remain browser-local and are never uploaded.
- Primary controls have at least 44 × 44 px touch targets.
- The happy path and one wrong-answer path must be automated.

---

### Task 1: Scaffold and Test Harness

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`
- Create: `vitest.config.ts`, `vitest.setup.ts`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `pnpm dev`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` commands.

- [ ] Write a smoke test expecting the product title on the home page.
- [ ] Run the test and confirm it fails because the app is not scaffolded.
- [ ] Scaffold the minimal Next.js App Router project and test harness.
- [ ] Add the minimal home page needed for the smoke test to pass.
- [ ] Run the smoke test and build.
- [ ] Commit the scaffold.

### Task 2: Domain State Machine and Persistence

**Files:**
- Create: `src/features/game/types.ts`
- Create: `src/features/game/mock-case.ts`
- Create: `src/features/game/game-machine.ts`
- Create: `src/features/game/persistence.ts`
- Test: `src/features/game/game-machine.test.ts`
- Test: `src/features/game/persistence.test.ts`

**Interfaces:**
- Produces: `GameState`, `GameEvent`, `transitionGame(state, event)`, `loadGameState()`, `saveGameState()`.

- [ ] Test that the game advances through home, capture, scanning, briefing, exploring, deduction, and result.
- [ ] Test clues are idempotent and deduction is locked before three clues.
- [ ] Test first wrong answer returns a hint and second answer reveals the truth.
- [ ] Test localStorage round-trip and invalid payload fallback.
- [ ] Implement minimal types, reducer, mock case, and persistence.
- [ ] Run tests and commit.

### Task 3: Entry and Mock Generation UI

**Files:**
- Create: `src/features/game/game-app.tsx`
- Create: `src/components/phone-shell.tsx`
- Create: `src/components/home-screen.tsx`
- Create: `src/components/capture-screen.tsx`
- Create: `src/components/scanning-screen.tsx`
- Create: `src/components/case-brief-screen.tsx`
- Test: `src/features/game/game-app.test.tsx`

**Interfaces:**
- Consumes: Task 2 state machine.
- Produces: Working home → capture → scanning → case brief flow.

- [ ] Test the sample-photo path reaches the case brief after mock scanning.
- [ ] Test selecting a local image shows a preview and keeps it browser-local.
- [ ] Implement the phone shell and four screens.
- [ ] Use an explicit “complete scan” timer adapter so tests do not wait in real time.
- [ ] Run tests and commit.

### Task 4: Exploration, Deduction, and Result UI

**Files:**
- Create: `src/components/explore-screen.tsx`
- Create: `src/components/clue-hotspot.tsx`
- Create: `src/components/clue-sheet.tsx`
- Create: `src/components/deduction-screen.tsx`
- Create: `src/components/result-screen.tsx`
- Test: `src/features/game/game-app.test.tsx`

**Interfaces:**
- Consumes: Task 2 transitions and mock case.
- Produces: Complete playable flow and replay action.

- [ ] Test three hotspot clicks unlock deduction.
- [ ] Test one wrong answer displays the hint without revealing the truth.
- [ ] Test a correct answer displays the result and replay resets the game.
- [ ] Implement exploration, bottom sheet, answer states, and result screen.
- [ ] Run tests and commit.

### Task 5: Visual Polish and Edge States

**Files:**
- Modify: `src/app/globals.css`
- Modify: all screen components
- Create: `src/components/error-screen.tsx`
- Create: `src/components/privacy-sheet.tsx`
- Test: `src/features/game/game-app.test.tsx`

**Interfaces:**
- Produces: Production-style dark cinematic visual system and recoverable mock errors.

- [ ] Test photo validation copy for unsupported type and oversized files.
- [ ] Test the mock timeout screen retries without losing the selected image.
- [ ] Implement dark cinematic tokens, scan animation, hotspot pulse, motion-reduction rules, privacy sheet, and error screen.
- [ ] Verify all interactive controls meet 44 px minimum size.
- [ ] Run component tests and commit.

### Task 6: Browser Verification

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/happy-path.spec.ts`
- Create: `tests/e2e/wrong-answer.spec.ts`

**Interfaces:**
- Produces: Browser-level proof of the mock experience.

- [ ] Write failing Playwright tests for the happy path and wrong-answer path.
- [ ] Run them and confirm expected failure before completing selectors or behavior.
- [ ] Add stable accessible names or test IDs only where semantic selectors are insufficient.
- [ ] Run Playwright at a 390 × 844 viewport.
- [ ] Run full unit tests, lint, build, and browser tests.
- [ ] Capture a final mobile screenshot and commit.
