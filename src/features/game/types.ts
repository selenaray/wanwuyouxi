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
  errorCode: "MOCK_TIMEOUT" | null;
};

export type GameEvent =
  | { type: "HYDRATE"; state: GameState }
  | { type: "START" }
  | { type: "USE_SAMPLE" }
  | { type: "SELECT_IMAGE"; imageUrl: string; imageName: string }
  | { type: "CONFIRM_IMAGE" }
  | { type: "SCAN_COMPLETE" }
  | { type: "SCAN_FAILED" }
  | { type: "RETRY_SCAN" }
  | { type: "ENTER_SCENE"; now: number }
  | { type: "OPEN_CLUE"; clueId: string }
  | { type: "CLOSE_CLUE" }
  | { type: "BEGIN_DEDUCTION" }
  | { type: "SELECT_ANSWER"; answerIndex: number }
  | { type: "SUBMIT_ANSWER"; answerIndex: number; now: number }
  | { type: "REPLAY" };

export type MockClue = {
  id: string;
  objectName: string;
  clueText: string;
  regionHint: string;
  x: number;
  y: number;
};

export type MockCase = {
  title: string;
  caseNumber: string;
  background: string;
  objective: string;
  clues: [MockClue, MockClue, MockClue];
  question: string;
  answerOptions: [string, string, string];
  correctAnswerIndex: 0 | 1 | 2;
  wrongAnswerHint: string;
  truth: string;
};
