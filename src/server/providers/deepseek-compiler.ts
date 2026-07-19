import OpenAI from "openai";

import {
  V2PrivateCaseSchema,
  type V2PrivateCase,
  type VisionObservation,
} from "@/server/cases/v2-contracts";

import type { DeepSeekRequest, DeepSeekTransport } from "./deepseek";
import {
  DEEPSEEK_COMPILER_SYSTEM_PROMPT,
  DEEPSEEK_FACTBOOK_REPAIR_SYSTEM_PROMPT,
} from "./prompts/deepseek-compiler-system";
import {
  ProviderError,
  type CaseFactbookCompiler,
  type ValidationIssue,
} from "./types";

type CompilerOptions = {
  transport: DeepSeekTransport;
  model: string;
  timeoutMs: number;
};

type PassObservation = Extract<VisionObservation, { decision: "PASS" }>;

class OpenAIDeepSeekFactbookTransport implements DeepSeekTransport {
  private readonly client: OpenAI;

  constructor(apiKey: string, baseURL: string) {
    this.client = new OpenAI({ apiKey, baseURL });
  }

  async create(request: DeepSeekRequest, signal: AbortSignal) {
    const completion = await this.client.chat.completions.create(request, { signal });
    return { content: completion.choices[0]?.message.content ?? "" };
  }
}

export function createDeepSeekFactbookTransportFromEnv(): DeepSeekTransport {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY_MISSING");
  return new OpenAIDeepSeekFactbookTransport(
    apiKey,
    process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
  );
}

export function semanticV2Case(game: V2PrivateCase) {
  return {
    version: game.version,
    title: game.title,
    caseNumber: game.caseNumber,
    background: game.background,
    objective: game.objective,
    interactionMode: game.interactionMode,
    visualFacts: game.visualFacts.map((fact) => ({
      id: fact.id,
      objectName: fact.objectName,
      visibleDescription: fact.visibleDescription,
      regionHint: fact.regionHint,
    })),
    evidence: game.evidence.map((evidence) => ({
      id: evidence.id,
      visualFactId: evidence.visualFactId,
      suspectId: evidence.suspectId,
      objectName: evidence.objectName,
      publicDescription: evidence.publicDescription,
      regionHint: evidence.regionHint,
    })),
    suspects: game.suspects.map((suspect) => ({
      id: suspect.id,
      name: suspect.name,
      identity: suspect.identity,
      relation: suspect.relation,
      personalityTags: suspect.personalityTags,
      portraitKey: suspect.portraitKey,
      initialTestimony: suspect.initialTestimony,
      privateAction: suspect.privateAction,
      allowedFactIds: suspect.allowedFactIds,
    })),
    timelineFacts: game.timelineFacts.map((fact) => ({
      id: fact.id,
      timeLabel: fact.timeLabel,
      text: fact.text,
    })),
    claims: game.claims.map((claim) => ({
      id: claim.id,
      suspectId: claim.suspectId,
      text: claim.text,
      factRefs: claim.factRefs,
      evidenceRefs: claim.evidenceRefs,
    })),
    liarSuspectId: game.liarSuspectId,
    contradiction: {
      claimId: game.contradiction.claimId,
      evidenceId: game.contradiction.evidenceId,
      explanation: game.contradiction.explanation,
    },
    wrongAnswerHint: game.wrongAnswerHint,
    truth: {
      summary: game.truth.summary,
      motive: game.truth.motive,
      evidenceChain: game.truth.evidenceChain,
    },
  };
}

function hasUniqueValues(values: string[]) {
  return new Set(values).size === values.length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function restoreOmittedCoordinates(value: unknown, original: V2PrivateCase): unknown {
  if (!isRecord(value)) return value;
  return {
    ...value,
    visualFacts: Array.isArray(value.visualFacts)
      ? value.visualFacts.map((fact, index) => isRecord(fact)
        ? {
            x: original.visualFacts[index]?.x,
            y: original.visualFacts[index]?.y,
            radius: original.visualFacts[index]?.radius,
            confidence: original.visualFacts[index]?.confidence,
            ...fact,
          }
        : fact)
      : value.visualFacts,
    evidence: Array.isArray(value.evidence)
      ? value.evidence.map((evidence, index) => isRecord(evidence)
        ? {
            x: original.evidence[index]?.x,
            y: original.evidence[index]?.y,
            radius: original.evidence[index]?.radius,
            confidence: original.evidence[index]?.confidence,
            ...evidence,
          }
        : evidence)
      : value.evidence,
  };
}

function isGroundedFactbook(game: V2PrivateCase, expectedVisualFacts: PassObservation["visualFacts"]) {
  if (JSON.stringify(game.visualFacts) !== JSON.stringify(expectedVisualFacts)) return false;
  if (!hasUniqueValues(game.suspects.map((suspect) => suspect.portraitKey))) return false;

  const suspectIds = new Set(game.suspects.map((suspect) => suspect.id));
  const timelineIds = new Set(game.timelineFacts.map((fact) => fact.id));
  const evidenceIds = new Set(game.evidence.map((evidence) => evidence.id));
  const claimIds = new Set(game.claims.map((claim) => claim.id));
  if (
    suspectIds.size !== game.suspects.length
    || evidenceIds.size !== game.evidence.length
    || claimIds.size !== game.claims.length
    || !hasUniqueValues(game.evidence.map((evidence) => evidence.visualFactId))
    || !hasUniqueValues(game.evidence.map((evidence) => evidence.suspectId))
    || !hasUniqueValues(game.claims.map((claim) => claim.suspectId))
  ) return false;

  const visualFactsById = new Map(game.visualFacts.map((fact) => [fact.id, fact]));
  for (const evidence of game.evidence) {
    const fact = visualFactsById.get(evidence.visualFactId);
    if (
      !fact
      || !suspectIds.has(evidence.suspectId)
      || evidence.objectName !== fact.objectName
      || evidence.regionHint !== fact.regionHint
      || evidence.x !== fact.x
      || evidence.y !== fact.y
      || evidence.radius !== fact.radius
      || evidence.confidence !== fact.confidence
    ) return false;
  }

  for (const claim of game.claims) {
    if (
      !suspectIds.has(claim.suspectId)
      || claim.factRefs.some((reference) => !timelineIds.has(reference))
      || claim.evidenceRefs.some((reference) => !evidenceIds.has(reference))
    ) return false;
  }

  const contradictionClaim = game.claims.find(
    (claim) => claim.id === game.contradiction.claimId,
  );
  const contradictionEvidence = game.evidence.find(
    (evidence) => evidence.id === game.contradiction.evidenceId,
  );
  return Boolean(
    suspectIds.has(game.liarSuspectId)
    && contradictionClaim
    && contradictionEvidence
    && contradictionClaim.suspectId === game.liarSuspectId
    && contradictionEvidence.suspectId === game.liarSuspectId,
  );
}

function immutableFactbookFields(game: V2PrivateCase) {
  return {
    version: game.version,
    caseNumber: game.caseNumber,
    interactionMode: game.interactionMode,
    visualFacts: game.visualFacts,
    evidence: game.evidence.map((evidence) => ({
      id: evidence.id,
      visualFactId: evidence.visualFactId,
      suspectId: evidence.suspectId,
      objectName: evidence.objectName,
      regionHint: evidence.regionHint,
      x: evidence.x,
      y: evidence.y,
      radius: evidence.radius,
      confidence: evidence.confidence,
    })),
    suspects: game.suspects.map((suspect) => ({
      id: suspect.id,
      portraitKey: suspect.portraitKey,
      privateAction: suspect.privateAction,
      allowedFactIds: suspect.allowedFactIds,
    })),
  };
}

export class DeepSeekFactbookCompiler implements CaseFactbookCompiler {
  constructor(private readonly options: CompilerOptions) {}

  private async request(request: DeepSeekRequest) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      return await this.options.transport.create(request, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) {
        throw new ProviderError("TIMEOUT", "DEEPSEEK_FACTBOOK_TIMEOUT");
      }
      const status = typeof error === "object" && error && "status" in error
        ? Number(error.status)
        : 0;
      if (status === 401 || status === 403) {
        throw new ProviderError("AUTH_FAILED", "DEEPSEEK_FACTBOOK_AUTH_FAILED");
      }
      if (status === 429) {
        throw new ProviderError("RATE_LIMITED", "DEEPSEEK_FACTBOOK_RATE_LIMITED");
      }
      throw new ProviderError("UNAVAILABLE", "DEEPSEEK_FACTBOOK_UNAVAILABLE");
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseFactbook(
    content: string,
    expectedVisualFacts: PassObservation["visualFacts"],
    repairSource?: V2PrivateCase,
  ) {
    try {
      const output = JSON.parse(content);
      const game = V2PrivateCaseSchema.parse(
        repairSource ? restoreOmittedCoordinates(output, repairSource) : output,
      );
      if (!isGroundedFactbook(game, expectedVisualFacts)) throw new Error("ungrounded");
      return game;
    } catch {
      throw new ProviderError("BAD_OUTPUT", "DEEPSEEK_FACTBOOK_OUTPUT_INVALID");
    }
  }

  async compileCase(input: {
    observation: PassObservation;
    traceId: string;
  }): Promise<V2PrivateCase> {
    const response = await this.request({
      model: this.options.model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: DEEPSEEK_COMPILER_SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify({ observation: input.observation }) },
      ],
    });
    return this.parseFactbook(response.content, input.observation.visualFacts);
  }

  async repairCase(input: {
    game: V2PrivateCase;
    issues: ValidationIssue[];
    traceId: string;
  }): Promise<V2PrivateCase> {
    const response = await this.request({
      model: this.options.model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: DEEPSEEK_FACTBOOK_REPAIR_SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({ case: semanticV2Case(input.game), issues: input.issues }),
        },
      ],
    });
    const repaired = this.parseFactbook(
      response.content,
      input.game.visualFacts,
      input.game,
    );
    if (
      JSON.stringify(immutableFactbookFields(repaired))
      !== JSON.stringify(immutableFactbookFields(input.game))
    ) {
      throw new ProviderError("BAD_OUTPUT", "DEEPSEEK_FACTBOOK_OUTPUT_INVALID");
    }
    return repaired;
  }
}

export function createDeepSeekFactbookCompilerFromEnv() {
  return new DeepSeekFactbookCompiler({
    transport: createDeepSeekFactbookTransportFromEnv(),
    model: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash",
    timeoutMs: Number(process.env.GENERATION_TIMEOUT_MS ?? 30_000),
  });
}
