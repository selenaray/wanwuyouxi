import { createInitialState } from "./game-machine";
import type { GameScreen, GameState } from "./types";

const STORAGE_KEY = "wanwuyouxi.game.v1";
const VALID_SCREENS: GameScreen[] = [
  "home",
  "capture",
  "scanning",
  "briefing",
  "exploring",
  "deduction",
  "result",
  "error",
];

function isGameState(value: unknown): value is GameState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GameState>;
  return (
    candidate.version === 2 &&
    typeof candidate.screen === "string" &&
    VALID_SCREENS.includes(candidate.screen as GameScreen) &&
    Array.isArray(candidate.openedClueIds) &&
    Array.isArray(candidate.openedEvidenceIds) &&
    Array.isArray(candidate.unlockedSuspectIds) &&
    (candidate.activeSuspectId === null || typeof candidate.activeSuspectId === "string") &&
    typeof candidate.attemptCount === "number"
  );
}

export function loadGameState(): GameState {
  if (typeof window === "undefined") return createInitialState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw) as unknown;
    return isGameState(parsed) ? parsed : createInitialState();
  } catch {
    return createInitialState();
  }
}

export function saveGameState(state: GameState): void {
  if (typeof window === "undefined") return;
  const persisted = state.mode === "live"
    ? {
        ...state,
        selectedImageUrl: null,
        selectedImageName: null,
        selectedAnswerIndex: null,
        caseData: null,
        truth: null,
      }
    : state;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
}
