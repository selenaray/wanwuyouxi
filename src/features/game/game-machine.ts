import { MOCK_CASE, SAMPLE_IMAGE_URL } from "./mock-case";
import type { GameEvent, GameState } from "./types";

export function createInitialState(): GameState {
  return {
    version: 1,
    screen: "home",
    selectedImageUrl: null,
    selectedImageName: null,
    openedClueIds: [],
    activeClueId: null,
    selectedAnswerIndex: null,
    attemptCount: 0,
    showHint: false,
    firstAnswerCorrect: null,
    startedAt: null,
    revealedAt: null,
    errorCode: null,
  };
}

export function transitionGame(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case "START":
      return { ...state, screen: "capture" };
    case "USE_SAMPLE":
      return {
        ...state,
        screen: "scanning",
        selectedImageUrl: SAMPLE_IMAGE_URL,
        selectedImageName: "示例宿舍现场",
        errorCode: null,
      };
    case "SELECT_IMAGE":
      return {
        ...state,
        screen: "capture",
        selectedImageUrl: event.imageUrl,
        selectedImageName: event.imageName,
      };
    case "CONFIRM_IMAGE":
      return state.selectedImageUrl ? { ...state, screen: "scanning", errorCode: null } : state;
    case "SCAN_COMPLETE":
      return state.screen === "scanning" ? { ...state, screen: "briefing" } : state;
    case "SCAN_FAILED":
      return { ...state, screen: "error", errorCode: "MOCK_TIMEOUT" };
    case "RETRY_SCAN":
      return state.selectedImageUrl ? { ...state, screen: "scanning", errorCode: null } : state;
    case "ENTER_SCENE":
      return state.screen === "briefing"
        ? { ...state, screen: "exploring", startedAt: event.now }
        : state;
    case "OPEN_CLUE": {
      if (state.screen !== "exploring" || !MOCK_CASE.clues.some((clue) => clue.id === event.clueId)) {
        return state;
      }
      const openedClueIds = state.openedClueIds.includes(event.clueId)
        ? state.openedClueIds
        : [...state.openedClueIds, event.clueId];
      return { ...state, openedClueIds, activeClueId: event.clueId };
    }
    case "CLOSE_CLUE":
      return { ...state, activeClueId: null };
    case "BEGIN_DEDUCTION":
      return state.screen === "exploring" && state.openedClueIds.length === 3
        ? { ...state, screen: "deduction", activeClueId: null }
        : state;
    case "SELECT_ANSWER":
      return state.screen === "deduction"
        ? { ...state, selectedAnswerIndex: event.answerIndex }
        : state;
    case "SUBMIT_ANSWER": {
      if (state.screen !== "deduction" || state.openedClueIds.length !== 3 || state.attemptCount >= 2) {
        return state;
      }
      const attemptCount = state.attemptCount + 1;
      const correct = event.answerIndex === MOCK_CASE.correctAnswerIndex;
      if (correct || attemptCount === 2) {
        return {
          ...state,
          screen: "result",
          selectedAnswerIndex: event.answerIndex,
          attemptCount,
          firstAnswerCorrect: attemptCount === 1 && correct,
          revealedAt: event.now,
        };
      }
      return {
        ...state,
        selectedAnswerIndex: null,
        attemptCount,
        showHint: true,
        firstAnswerCorrect: false,
      };
    }
    case "REPLAY":
      return createInitialState();
    default:
      return state;
  }
}
