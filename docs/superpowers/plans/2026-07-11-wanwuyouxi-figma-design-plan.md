# 万物有戏 Figma Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Figma mutations must execute sequentially and be visually validated after every major screen.

**Goal:** 在一个新的 Figma Design 文件中完成“万物有戏”MVP 的移动端高保真设计、核心组件、异常状态和可点击原型说明。

**Architecture:** 设计文件分为 Cover、Foundations、Components、Core Flow、Edge Cases 五个页面。先建立变量、文字样式和基础组件，再用组件实例组装 390 × 844 px 移动端页面；每个主要屏幕完成后通过截图检查字体、截断、对齐、对比度和触控尺寸。

**Tech Stack:** Figma Design、Figma Variables、Auto Layout、Components/Variants、Prototype interactions、iOS/移动 Web 390 × 844 px 基准画板。

## Global Constraints

- MVP 只支持“失踪事件＋三个线索＋最终三选一”。
- 核心流程为首页、拍摄、预检、扫描、案件介绍、现场探索、最终推理、真相卡。
- 不加入 AR、视频、多人、社区、付费或开放式聊天。
- 首屏 5 秒内讲清玩法；所有触控目标不小于 44 × 44 px。
- 生成等待超过 15 秒显示延迟提示，超过 30 秒进入可恢复错误页。
- 结果卡默认不清晰展示用户原图。

---

### Task 1: Discovery and Scope Lock

**Sources:**
- Read: `docs/superpowers/specs/2026-07-11-wanwuyouxi-mvp-prd.md`
- Produce: Figma file inventory, library inventory, visual direction, token list, component list

**Interfaces:**
- Consumes: Approved MVP PRD
- Produces: Locked `Foundations`, `Components`, `Core Flow`, and `Edge Cases` scope

- [ ] **Step 1:** Create a blank Figma Design file named `万物有戏 · MVP Design`.
- [ ] **Step 2:** Inspect pages, local variables, styles, and components; confirm the file is blank.
- [ ] **Step 3:** List available libraries and search for button, icon, text, surface, spacing, and radius assets.
- [ ] **Step 4:** Record reuse/rebuild decisions for every required component.
- [ ] **Step 5:** Present the gap analysis and lock the visual direction before canvas construction.

### Task 2: Foundations

**Figma objects:**
- Create pages: `00 Cover`, `01 Foundations`, `02 Components`, `03 Core Flow`, `04 Edge Cases`
- Create variable collections: `Primitives`, `Semantic`, `Spacing & Radius`
- Create text styles: `Display`, `Title`, `Heading`, `Body`, `Caption`, `Label`
- Create effect styles: `Glow/Clue`, `Shadow/Sheet`, `Blur/Glass`

**Interfaces:**
- Consumes: Locked visual direction from Task 1
- Produces: Variables and styles referenced by all components and screens

- [ ] **Step 1:** Create primitive neutral, burgundy/red, amber, white, and transparent colors.
- [ ] **Step 2:** Create semantic background, surface, text, border, accent, success, warning, and danger aliases.
- [ ] **Step 3:** Create spacing values `4, 8, 12, 16, 20, 24, 32, 40` and radius values `8, 12, 16, 24, 999`.
- [ ] **Step 4:** Set explicit scopes and WEB code syntax for every variable.
- [ ] **Step 5:** Create typography and effect styles.
- [ ] **Step 6:** Build and screenshot a foundations reference board; verify contrast and typography.

### Task 3: Reusable Components

**Figma objects:**
- Create: `Button`, `Icon Button`, `Top Bar`, `Progress`, `Status Chip`, `Clue Hotspot`, `Clue Sheet`, `Answer Option`, `Toast`, `Photo Frame`

**Interfaces:**
- Consumes: Task 2 variables and styles
- Produces: Component instances used by Tasks 4–6

- [ ] **Step 1:** Build `Button` variants for Primary/Secondary/Ghost and Default/Pressed/Disabled/Loading.
- [ ] **Step 2:** Build `Clue Hotspot` variants for Hidden/Hinted/Collected.
- [ ] **Step 3:** Build `Answer Option` variants for Default/Selected/Correct/Incorrect.
- [ ] **Step 4:** Build remaining components with Auto Layout and variable bindings.
- [ ] **Step 5:** Add concise usage notes and minimum touch-target annotations.
- [ ] **Step 6:** Validate component metadata and screenshots; fix duplicate names, hardcoded paints, and clipped text.

### Task 4: Entry and Generation Screens

**Figma screens:**
- Create: `01 Home`, `02 Camera Guide`, `03 Photo Preview`, `04 Scanning`, `05 Case Brief`

**Interfaces:**
- Consumes: Task 3 components
- Produces: Entry-to-game flow

- [ ] **Step 1:** Design Home with one dominant CTA, sample entry, and privacy access.
- [ ] **Step 2:** Design camera guide with framing overlay and three concise shooting rules.
- [ ] **Step 3:** Design preview with Retake and Use Photo actions.
- [ ] **Step 4:** Design scanning with honest staged status copy and 15-second delayed state.
- [ ] **Step 5:** Design case brief with title, story, objective, and Enter Scene CTA.
- [ ] **Step 6:** Screenshot each screen and inspect hierarchy, line wrapping, safe areas, and 44 px controls.

### Task 5: Gameplay and Result Screens

**Figma screens:**
- Create: `06 Explore · 0/3`, `07 Explore · Clue Open`, `08 Explore · 3/3`, `09 Deduction`, `10 Wrong Answer`, `11 Truth`, `12 Share Card`

**Interfaces:**
- Consumes: Task 3 components and fixed game structure
- Produces: Complete playable visual narrative

- [ ] **Step 1:** Design the exploration screen using a representative room photo with three subtle clue hotspots.
- [ ] **Step 2:** Design clue bottom sheet and collected state without obscuring the relevant object.
- [ ] **Step 3:** Design the ready-to-deduce state with visible 3/3 progress.
- [ ] **Step 4:** Design three-answer deduction, first-error hint, and second-submit behavior.
- [ ] **Step 5:** Design truth reveal and privacy-safe share card.
- [ ] **Step 6:** Screenshot all gameplay states and verify visual continuity and answer-state clarity.

### Task 6: Edge Cases and Recovery

**Figma screens:**
- Create: `Photo Too Dark`, `Too Few Objects`, `Sensitive Content`, `Generation Delayed`, `Generation Failed`, `Card Mode Fallback`, `Session Expired`, `Offline`

**Interfaces:**
- Consumes: PRD edge-case matrix
- Produces: Recoverable UX for every MVP-blocking failure class

- [ ] **Step 1:** Design photo-quality retries with one reason and one actionable instruction.
- [ ] **Step 2:** Design safety block without exposing classifier details.
- [ ] **Step 3:** Design timeout, rate limit, offline, and session-expired recovery.
- [ ] **Step 4:** Design object-card fallback when hotspot coordinates are unreliable.
- [ ] **Step 5:** Verify every error screen offers exactly one primary recovery action.

### Task 7: Prototype Flow

**Figma prototype:**
- Connect: Home → Camera → Preview → Scanning → Brief → Explore → Deduction → Truth

**Interfaces:**
- Consumes: Tasks 4–6 screens
- Produces: A reviewer-ready click-through demo path

- [ ] **Step 1:** Add primary tap interactions across the happy path.
- [ ] **Step 2:** Add clue-sheet overlays and Close interactions.
- [ ] **Step 3:** Add one wrong-answer branch and return to deduction.
- [ ] **Step 4:** Add one photo-retry branch and one timeout-retry branch.
- [ ] **Step 5:** Set Home as the prototype starting point and verify there are no dead-end screens.

### Task 8: Final QA and Handoff

**Outputs:**
- Final screenshots, node inventory, file URL, implementation notes

**Interfaces:**
- Consumes: Completed Figma file
- Produces: Approved design ready for frontend implementation planning

- [ ] **Step 1:** Audit color contrast, typography family, text clipping, safe areas, and 44 px touch targets.
- [ ] **Step 2:** Audit component usage, naming, variable bindings, and duplicate layers.
- [ ] **Step 3:** Capture overview and per-screen screenshots at readable resolution.
- [ ] **Step 4:** Compare all screens against PRD acceptance requirements and list any deliberate deviations.
- [ ] **Step 5:** Share the editable Figma URL and request final design review.
