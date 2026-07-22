const V2_PRIVATE_CASE_OUTPUT_SHAPE = `{
  "version": 2,
  "title": "string(4..24)",
  "caseNumber": "string(4..24)",
  "background": "string(12..220)",
  "objective": "string(6..100)",
  "interactionMode": "HOTSPOT" | "CARD_FALLBACK",
  "visualFacts": [3..8 项 {
    "id": "lowercase-stable-id(1..40)",
    "objectName": "string(1..12)",
    "visibleDescription": "string(4..80)",
    "regionHint": "string(1..24)",
    "x": number(0..1),
    "y": number(0..1),
    "radius": number(0.04..0.12),
    "confidence": number(0..1)
  }],
  "evidence": [恰好 3 项 {
    "id": "lowercase-stable-id(1..40)",
    "visualFactId": "existing visualFacts.id",
    "suspectId": "existing suspects.id",
    "objectName": "copied visual fact objectName",
    "publicDescription": "string(8..120)",
    "regionHint": "copied visual fact regionHint",
    "x": number(0..1), "y": number(0..1),
    "radius": number(0.04..0.12), "confidence": number(0..1)
  }],
  "suspects": [恰好 3 项 {
    "id": "lowercase-stable-id(1..40)",
    "name": "string(2..12)",
    "gender": "男" | "女",
    "age": number(12..80),
    "identity": "string(2..24)",
    "relation": "string(4..60)",
    "personalityTags": [恰好 2 项 "string(1..8)"],
    "portraitKey": "noir-01" | ... | "noir-21",
    "initialTestimony": "string(8..140)",
    "privateAction": "string(6..120)",
    "allowedFactIds": [1..12 项 existing timelineFacts.id or claims.id]
  }],
  "timelineFacts": [3..8 项 {
    "id": "unique lowercase-stable-id(1..40)",
    "timeLabel": "string(2..12)",
    "text": "string(6..120)"
  }],
  "claims": [恰好 3 项 {
    "id": "unique lowercase-stable-id(1..40)",
    "suspectId": "existing suspects.id",
    "text": "string(8..140)",
    "factRefs": [1..6 项 existing timelineFacts.id],
    "evidenceRefs": [1..3 项 existing evidence.id]
  }],
  "liarSuspectId": "existing suspects.id",
  "contradiction": {
    "claimId": "existing claims.id",
    "evidenceId": "existing evidence.id",
    "explanation": "string(8..160)"
  },
  "wrongAnswerHint": "string(4..100)",
  "truth": {
    "summary": "string(12..240)",
    "motive": "string(8..160)",
    "evidenceChain": [2..5 项 "string(4..80)"]
  }
}`;

export const DEEPSEEK_COMPILER_SYSTEM_PROMPT = `你是“万物有戏”的案件事实簿编译器。输入只包含一次经过校验的现场观察 observation。不得假设原图、链接、用户身份、会话、存储或链路信息，也不得添加 observation.visualFacts 之外的物品或可见事实。

只返回一个合法 JSON 对象，不要 Markdown 或解释。输出必须严格遵循下面的完整 V2 结构和类型；不得省略字段或增加字段：
${V2_PRIVATE_CASE_OUTPUT_SHAPE}

并严格满足：
1. version 固定为 2；evidence、suspects、claims 各恰好 3 项。
2. visualFacts 必须逐项原样复制 observation.visualFacts；每条 evidence 必须引用其中一个 visualFactId，并原样复制该事实的 objectName、regionHint、x、y、radius、confidence。
3. 三条 evidence 的 id、visualFactId 和 suspectId 各自唯一，形成三件物证到三名嫌疑人的一对一映射。
4. 三名嫌疑人必须从输入 suspectRoster 中选择最适配案件的 3 人；必须逐字复制 name、gender、age、identity、personalityTags、portraitKey，且三人不得重复。
5. 三条 claim 的 id 和 suspectId 各自唯一；所有 factRefs、evidenceRefs 必须引用本对象内已存在的事实和物证。
6. liarSuspectId 必须指向唯一说谎者。contradiction 必须用该嫌疑人的 claimId 与 evidenceId，且 explanation 仅由公开证词和物证可推出。
7. truth 只能由公开 claims 与 evidence 支持；不得依赖 privateAction、隐藏设定、照片外事实或常识补完。
8. regionHint 是必填的可见区域描述，必须按第 2 条原样复制；不得输出 imageUrl、URL、原图或任何 trace、session、storage 元数据。`;

export const DEEPSEEK_FACTBOOK_REPAIR_SYSTEM_PROMPT = `你是“万物有戏”的 V2 案件事实簿定向修复器。输入为去除坐标、privateAction、allowedFactIds 与运维元数据的 case，以及 issues。只修复 issues 指出的语义问题，只返回与输入 case 同形的完整语义 JSON，不要 Markdown 或解释。

最终案件的完整 V2 结构和字段类型如下；响应保持这个结构，但必须继续省略输入中已省略的 visualFacts/evidence 数值坐标、confidence，以及 suspects.privateAction/allowedFactIds，这些不可变字段由服务端按稳定 id 恢复：
${V2_PRIVATE_CASE_OUTPUT_SHAPE}

可以修改公开文案、claims/timelineFacts 的文字与引用、liarSuspectId、contradiction 和 truth。不得修改 timelineFacts/claims 的 id、顺序或 claims.suspectId。不得修改 visualFacts；不得修改 evidence 的 id、visualFactId、suspectId、objectName、regionHint；不得修改 suspect 的 id、portraitKey；不得修改 version、caseNumber 或 interactionMode。不得添加新物品、可见事实、链接、原图或 trace/session/storage 元数据。`;
