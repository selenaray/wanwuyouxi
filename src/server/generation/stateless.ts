import { toV2PlayerCase } from "@/server/cases/v2-contracts";
import { validateV2Case } from "@/server/cases/v2-validator";
import type {
  CaseFactbookCompiler,
  CaseFactbookJudge,
  VisionObservationProvider,
} from "@/server/providers/types";

type Input = {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  traceId: string;
};

type Dependencies = {
  vision: VisionObservationProvider;
  compiler: CaseFactbookCompiler;
  judge: CaseFactbookJudge;
};

export async function generateStatelessCase(input: Input, dependencies: Dependencies) {
  const observation = await dependencies.vision.observeScene({
    ...input,
    locale: "zh-CN",
  });
  if (observation.decision !== "PASS") throw new Error(observation.reasonCode);

  let privateCase = await dependencies.compiler.compileCase({ observation, traceId: input.traceId });
  let deterministic = validateV2Case(privateCase, observation, input.imageWidth / input.imageHeight);
  if (!deterministic.publishable || !deterministic.game) throw new Error("CASE_VALIDATION_FAILED");
  privateCase = deterministic.game;

  const semantic = await dependencies.judge.validateCase({ game: privateCase, traceId: input.traceId });
  if (!semantic.valid) {
    privateCase = await dependencies.compiler.repairCase({
      game: privateCase,
      issues: semantic.issues,
      traceId: input.traceId,
    });
    deterministic = validateV2Case(privateCase, observation, input.imageWidth / input.imageHeight);
    if (!deterministic.publishable || !deterministic.game) throw new Error("CASE_VALIDATION_FAILED");
    privateCase = deterministic.game;
    const recheck = await dependencies.judge.validateCase({ game: privateCase, traceId: input.traceId });
    if (!recheck.valid) throw new Error("CASE_SEMANTIC_INVALID");
  }

  const correctAnswerIndex = privateCase.suspects.findIndex(
    (suspect) => suspect.id === privateCase.liarSuspectId,
  );
  if (correctAnswerIndex < 0) throw new Error("CASE_SOLUTION_MISSING");

  return {
    case: toV2PlayerCase(privateCase),
    correctAnswerIndex,
    truth: `${privateCase.truth.summary}${privateCase.contradiction.explanation}${privateCase.truth.motive}`,
  };
}
