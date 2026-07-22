import { toV2PlayerCase } from "@/server/cases/v2-contracts";
import { validateV2Case } from "@/server/cases/v2-validator";
import type {
  CaseFactbookCompiler,
  CaseFactbookJudge,
  VisionObservationProvider,
} from "@/server/providers/types";
import { ProviderError } from "@/server/providers/types";
import type { V2PrivateCase, VisionObservation } from "@/server/cases/v2-contracts";

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
  fallbackCompiler?: CaseFactbookCompiler;
  fallbackJudge?: CaseFactbookJudge;
};

function stableErrorCode(error: unknown) {
  if (error instanceof ProviderError) return error.message;
  if (error instanceof Error && /^[A-Z0-9_]{1,80}$/.test(error.message)) return error.message;
  return "GENERATION_FAILED";
}

async function compilePublishableCase(input: {
  compiler: CaseFactbookCompiler;
  judge: CaseFactbookJudge;
  observation: Extract<VisionObservation, { decision: "PASS" }>;
  imageAspect: number;
  traceId: string;
}) {
  let privateCase = await input.compiler.compileCase({
    observation: input.observation,
    traceId: input.traceId,
  });
  let deterministic = validateV2Case(privateCase, input.observation, input.imageAspect);
  if (!deterministic.publishable || !deterministic.game) throw new Error("CASE_VALIDATION_FAILED");
  privateCase = deterministic.game;

  const semantic = await input.judge.validateCase({ game: privateCase, traceId: input.traceId });
  if (!semantic.valid) {
    privateCase = await input.compiler.repairCase({
      game: privateCase,
      issues: semantic.issues,
      traceId: input.traceId,
    });
    deterministic = validateV2Case(privateCase, input.observation, input.imageAspect);
    if (!deterministic.publishable || !deterministic.game) throw new Error("CASE_VALIDATION_FAILED");
    privateCase = deterministic.game;
    const recheck = await input.judge.validateCase({ game: privateCase, traceId: input.traceId });
    if (!recheck.valid) throw new Error("CASE_SEMANTIC_INVALID");
  }

  return privateCase;
}

function serializeResult(input: {
  privateCase: V2PrivateCase;
  degraded: boolean;
  degradationReason?: string;
}) {
  const { privateCase } = input;
  const correctAnswerIndex = privateCase.suspects.findIndex(
    (suspect) => suspect.id === privateCase.liarSuspectId,
  );
  if (correctAnswerIndex < 0) throw new Error("CASE_SOLUTION_MISSING");

  return {
    case: toV2PlayerCase(privateCase),
    correctAnswerIndex,
    truth: `${privateCase.truth.summary}${privateCase.contradiction.explanation}${privateCase.truth.motive}`,
    degraded: input.degraded,
    degradationReason: input.degradationReason,
  };
}

export async function generateStatelessCase(input: Input, dependencies: Dependencies) {
  const observation = await dependencies.vision.observeScene({
    ...input,
    locale: "zh-CN",
  });
  if (observation.decision !== "PASS") throw new Error(observation.reasonCode);

  try {
    const privateCase = await compilePublishableCase({
      compiler: dependencies.compiler,
      judge: dependencies.judge,
      observation,
      imageAspect: input.imageWidth / input.imageHeight,
      traceId: input.traceId,
    });
    return serializeResult({ privateCase, degraded: false });
  } catch (error) {
    if (!dependencies.fallbackCompiler) throw error;
    const privateCase = await compilePublishableCase({
      compiler: dependencies.fallbackCompiler,
      judge: dependencies.fallbackJudge ?? dependencies.judge,
      observation,
      imageAspect: input.imageWidth / input.imageHeight,
      traceId: input.traceId,
    });
    return serializeResult({
      privateCase,
      degraded: true,
      degradationReason: stableErrorCode(error),
    });
  }
}
