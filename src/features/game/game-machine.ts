import { LEGACY_MOCK_CASE, MOCK_CASE, SAMPLE_IMAGE_URL } from "./mock-case";
import { isV2PlayerCase, type GameEvent, type GameState } from "./types";

export function createInitialState(): GameState {
  return {
    version: 2,
    screen: "home",
    selectedImageUrl: null,
    selectedImageName: null,
    openedClueIds: [],
    activeClueId: null,
    openedEvidenceIds: [],
    unlockedSuspectIds: [],
    activeSuspectId: null,
    selectedAnswerIndex: null,
    attemptCount: 0,
    showHint: false,
    firstAnswerCorrect: null,
    startedAt: null,
    revealedAt: null,
    errorCode: null,
    mode: null,
    imageId: null,
    jobId: null,
    caseId: null,
    caseData: null,
    truth: null,
  };
}

export function transitionGame(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case "HYDRATE":
      return event.state;
    case "START":
      return { ...state, screen: "capture" };
    case "USE_SAMPLE":
      return {
        ...state,
        screen: "scanning",
        selectedImageUrl: SAMPLE_IMAGE_URL,
        selectedImageName: "示例宿舍现场",
        errorCode: null,
        mode: "sample",
        caseData: MOCK_CASE,
        truth: null,
        openedClueIds: [],
        activeClueId: null,
        openedEvidenceIds: [],
        unlockedSuspectIds: [],
        activeSuspectId: null,
      };
    case "SELECT_IMAGE":
      return {
        ...state,
        screen: "capture",
        selectedImageUrl: event.imageUrl,
        selectedImageName: event.imageName,
        mode: "live",
        imageId: null,
        jobId: null,
        caseId: null,
        caseData: null,
        truth: null,
        openedClueIds: [],
        activeClueId: null,
        openedEvidenceIds: [],
        unlockedSuspectIds: [],
        activeSuspectId: null,
      };
    case "CONFIRM_IMAGE":
      return state.selectedImageUrl ? { ...state, screen: "scanning", errorCode: null } : state;
    case "SCAN_COMPLETE":
      return state.screen === "scanning" ? { ...state, screen: "briefing" } : state;
    case "SCAN_FAILED":
      return { ...state, screen: "error", errorCode: event.errorCode };
    case "GENERATION_STARTED":
      return { ...state, imageId: event.imageId, jobId: event.jobId };
    case "GENERATION_SUCCEEDED":
      return {
        ...state,
        screen: "briefing",
        caseId: event.caseId,
        caseData: event.caseData,
        errorCode: null,
      };
    case "RETRY_SCAN":
      return {
        ...state,
        screen: state.selectedImageUrl ? "scanning" : "capture",
        imageId: null,
        jobId: null,
        caseId: null,
        errorCode: null,
      };
    case "ENTER_SCENE":
      return state.screen === "briefing"
        ? { ...state, screen: "exploring", startedAt: event.now }
        : state;
    case "OPEN_CLUE": {
      if (
        state.screen !== "exploring"
        || !state.caseData
        || isV2PlayerCase(state.caseData)
        || !state.caseData.clues.some((clue) => clue.id === event.clueId)
      ) {
        return state;
      }
      const openedClueIds = state.openedClueIds.includes(event.clueId)
        ? state.openedClueIds
        : [...state.openedClueIds, event.clueId];
      return { ...state, openedClueIds, activeClueId: event.clueId };
    }
    case "OPEN_EVIDENCE": {
      if (state.screen !== "exploring" || !state.caseData || !isV2PlayerCase(state.caseData)) {
        return state;
      }
      const evidence = state.caseData.evidence.find((item) => item.id === event.evidenceId);
      if (!evidence) return state;
      const openedEvidenceIds = state.openedEvidenceIds.includes(evidence.id)
        ? state.openedEvidenceIds
        : [...state.openedEvidenceIds, evidence.id];
      const unlockedSuspectIds = state.unlockedSuspectIds.includes(evidence.suspectId)
        ? state.unlockedSuspectIds
        : [...state.unlockedSuspectIds, evidence.suspectId];
      return {
        ...state,
        openedEvidenceIds,
        unlockedSuspectIds,
        activeClueId: evidence.id,
        activeSuspectId: null,
      };
    }
    case "CLOSE_CLUE":
      return { ...state, activeClueId: null };
    case "OPEN_SUSPECT": {
      if (
        state.screen !== "exploring"
        || !state.caseData
        || !isV2PlayerCase(state.caseData)
        || !state.unlockedSuspectIds.includes(event.suspectId)
        || !state.caseData.suspects.some((suspect) => suspect.id === event.suspectId)
      ) {
        return state;
      }
      return { ...state, activeSuspectId: event.suspectId, activeClueId: null };
    }
    case "CLOSE_SUSPECT":
      return { ...state, activeSuspectId: null };
    case "BEGIN_DEDUCTION":
      return state.screen === "exploring"
        && state.caseData
        && (isV2PlayerCase(state.caseData)
          ? state.caseData.evidence.every((evidence) => state.openedEvidenceIds.includes(evidence.id))
            && state.caseData.suspects.every((suspect) => state.unlockedSuspectIds.includes(suspect.id))
          : state.caseData.clues.every((clue) => state.openedClueIds.includes(clue.id)))
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
      const correct = event.answerIndex === LEGACY_MOCK_CASE.correctAnswerIndex;
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
    case "ANSWER_RESPONSE":
      if (!event.completed) {
        return {
          ...state,
          selectedAnswerIndex: null,
          attemptCount: event.attemptCount,
          showHint: true,
          firstAnswerCorrect: false,
        };
      }
      return {
        ...state,
        attemptCount: event.attemptCount,
        firstAnswerCorrect: event.attemptCount === 1 && event.correct,
      };
    case "REVEAL_LOADED":
      return {
        ...state,
        screen: "result",
        truth: event.truth,
        firstAnswerCorrect: event.firstAnswerCorrect,
        revealedAt: event.now,
      };
    case "REPLAY":
      return createInitialState();
    default:
      return state;
  }
}
