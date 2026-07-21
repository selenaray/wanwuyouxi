export type GameScreen =
  | "home"
  | "capture"
  | "scanning"
  | "briefing"
  | "exploring"
  | "deduction"
  | "result"
  | "error";

export type PortraitKey =
  | "noir-01"
  | "noir-02"
  | "noir-03"
  | "noir-04"
  | "noir-05"
  | "noir-06"
  | "noir-07"
  | "noir-08"
  | "noir-09"
  | "noir-10"
  | "noir-11"
  | "noir-12";

export type GameClue = {
  id: string;
  objectName: string;
  clueText: string;
  regionHint: string;
  x: number;
  y: number;
  radius?: number;
  confidence?: number;
};

export type V1PlayerCase = {
  title: string;
  caseNumber: string;
  background: string;
  objective: string;
  interactionMode?: "HOTSPOT" | "CARD_FALLBACK";
  clues: [GameClue, GameClue, GameClue];
  question: string;
  answerOptions: [string, string, string];
  wrongAnswerHint: string;
};

export type GameEvidence = {
  id: string;
  visualFactId: string;
  suspectId: string;
  objectName: string;
  publicDescription: string;
  regionHint: string;
  x: number;
  y: number;
  radius: number;
  confidence: number;
};

export type PublicSuspect = {
  id: string;
  name: string;
  identity: string;
  relation: string;
  personalityTags: [string, string];
  portraitKey: PortraitKey;
  initialTestimony: string;
};

export type PublicClaim = {
  id: string;
  suspectId: string;
  text: string;
};

export type V2PlayerCase = {
  version: 2;
  title: string;
  caseNumber: string;
  background: string;
  objective: string;
  interactionMode: "HOTSPOT" | "CARD_FALLBACK";
  evidence: [GameEvidence, GameEvidence, GameEvidence];
  suspects: [PublicSuspect, PublicSuspect, PublicSuspect];
  claims: [PublicClaim, PublicClaim, PublicClaim];
  wrongAnswerHint: string;
};

export type PlayerCase = V1PlayerCase | V2PlayerCase;

export function isV2PlayerCase(game: PlayerCase): game is V2PlayerCase {
  return "version" in game && game.version === 2;
}

export type GameState = {
  version: 2;
  screen: GameScreen;
  selectedImageUrl: string | null;
  selectedImageName: string | null;
  openedClueIds: string[];
  activeClueId: string | null;
  openedEvidenceIds: string[];
  unlockedSuspectIds: string[];
  activeSuspectId: string | null;
  selectedAnswerIndex: number | null;
  attemptCount: number;
  showHint: boolean;
  firstAnswerCorrect: boolean | null;
  startedAt: number | null;
  revealedAt: number | null;
  errorCode: string | null;
  mode: "sample" | "live" | null;
  imageId: string | null;
  jobId: string | null;
  caseId: string | null;
  caseData: PlayerCase | null;
  truth: string | null;
};

export type GameEvent =
  | { type: "HYDRATE"; state: GameState }
  | { type: "START" }
  | { type: "USE_SAMPLE" }
  | { type: "SELECT_IMAGE"; imageUrl: string; imageName: string }
  | { type: "CONFIRM_IMAGE" }
  | { type: "SCAN_COMPLETE" }
  | { type: "SCAN_FAILED"; errorCode: string }
  | { type: "GENERATION_STARTED"; imageId: string; jobId: string }
  | { type: "GENERATION_SUCCEEDED"; caseId: string; caseData: PlayerCase }
  | { type: "RETRY_SCAN" }
  | { type: "ENTER_SCENE"; now: number }
  | { type: "OPEN_CLUE"; clueId: string }
  | { type: "OPEN_EVIDENCE"; evidenceId: string }
  | { type: "CLOSE_CLUE" }
  | { type: "OPEN_SUSPECT"; suspectId: string }
  | { type: "CLOSE_SUSPECT" }
  | { type: "BEGIN_DEDUCTION" }
  | { type: "RETURN_TO_SCENE" }
  | { type: "SELECT_ANSWER"; answerIndex: number }
  | { type: "SUBMIT_ANSWER"; answerIndex: number; now: number }
  | { type: "ANSWER_RESPONSE"; correct: boolean; completed: boolean; attemptCount: number; now: number }
  | { type: "REVEAL_LOADED"; truth: string; firstAnswerCorrect: boolean | null; now: number }
  | { type: "REPLAY" };

export type MockCase = V1PlayerCase & {
  correctAnswerIndex: 0 | 1 | 2;
  truth: string;
};
