export type GameScreen =
  | "home"
  | "capture"
  | "scanning"
  | "briefing"
  | "exploring"
  | "deduction"
  | "result"
  | "error";

export type GameState = {
  version: 1;
  screen: GameScreen;
  selectedImageUrl: string | null;
  selectedImageName: string | null;
  openedClueIds: string[];
  activeClueId: string | null;
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
  | { type: "CLOSE_CLUE" }
  | { type: "BEGIN_DEDUCTION" }
  | { type: "SELECT_ANSWER"; answerIndex: number }
  | { type: "SUBMIT_ANSWER"; answerIndex: number; now: number }
  | { type: "ANSWER_RESPONSE"; correct: boolean; completed: boolean; attemptCount: number; now: number }
  | { type: "REVEAL_LOADED"; truth: string; firstAnswerCorrect: boolean | null; now: number }
  | { type: "REPLAY" };

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

export type PlayerCase = {
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

export type MockCase = PlayerCase & {
  correctAnswerIndex: 0 | 1 | 2;
  truth: string;
};
