import {
  GeneratedCaseSchema,
  type GeneratedCase,
  type PrivateCase,
} from "./contracts";

export type DeterministicIssue =
  | "INVALID_SCHEMA"
  | "DUPLICATE_CLUE_OBJECT"
  | "DUPLICATE_ANSWER_OPTION"
  | "CLUE_NOT_VISIBLE"
  | "LOW_HOTSPOT_CONFIDENCE"
  | "HOTSPOT_OVERLAP"
  | "UNSAFE_CONTENT";

export type ValidationResult = {
  publishable: boolean;
  game: PrivateCase | null;
  generated: GeneratedCase | null;
  issues: DeterministicIssue[];
};

const RESTRICTED_PATTERNS = [
  /自杀方法/,
  /照做才能/,
  /色情细节/,
  /制造炸弹/,
  /仇恨(言论|攻击)/,
  /真实.{0,8}(犯罪|凶手)/,
];

function hasUnsafeContent(game: PrivateCase) {
  const text = [
    game.title,
    game.background,
    game.objective,
    game.question,
    game.wrongAnswerHint,
    game.truth,
    ...game.answerOptions,
    ...game.clues.flatMap((clue) => [clue.objectName, clue.clueText, clue.regionHint]),
  ].join("\n");
  return RESTRICTED_PATTERNS.some((pattern) => pattern.test(text));
}

function hotspotsOverlap(game: PrivateCase, imageAspect: number) {
  for (let left = 0; left < game.clues.length; left += 1) {
    for (let right = left + 1; right < game.clues.length; right += 1) {
      const a = game.clues[left];
      const b = game.clues[right];
      const dx = (a.x - b.x) * imageAspect;
      const dy = a.y - b.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < (a.radius + b.radius) * 0.8) return true;
    }
  }
  return false;
}

export function validateGeneratedCase(value: unknown, imageAspect: number): ValidationResult {
  const parsed = GeneratedCaseSchema.safeParse(value);
  if (!parsed.success) {
    return { publishable: false, game: null, generated: null, issues: ["INVALID_SCHEMA"] };
  }
  if (parsed.data.decision !== "PASS") {
    return { publishable: false, game: null, generated: parsed.data, issues: [] };
  }

  const generated = parsed.data;
  const game = structuredClone(generated.game);
  const issues: DeterministicIssue[] = [];
  const objectNames = game.clues.map((clue) => clue.objectName);

  if (new Set(objectNames).size !== objectNames.length) issues.push("DUPLICATE_CLUE_OBJECT");
  if (new Set(game.answerOptions).size !== game.answerOptions.length) issues.push("DUPLICATE_ANSWER_OPTION");
  if (objectNames.some((name) => !generated.candidates.includes(name))) issues.push("CLUE_NOT_VISIBLE");
  if (game.clues.some((clue) => clue.confidence < 0.65)) issues.push("LOW_HOTSPOT_CONFIDENCE");
  if (hotspotsOverlap(game, imageAspect)) issues.push("HOTSPOT_OVERLAP");
  if (generated.riskLabels.length > 0 || hasUnsafeContent(game)) issues.push("UNSAFE_CONTENT");

  const blockingIssues = issues.filter(
    (issue) => issue !== "LOW_HOTSPOT_CONFIDENCE" && issue !== "HOTSPOT_OVERLAP",
  );
  if (blockingIssues.length > 0) {
    return { publishable: false, game: null, generated, issues };
  }

  if (issues.length > 0) game.interactionMode = "CARD_FALLBACK";
  return { publishable: true, game, generated, issues };
}

