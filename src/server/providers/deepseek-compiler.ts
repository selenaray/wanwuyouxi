import OpenAI from "openai";

import {
  V2PrivateCaseSchema,
  type V2PrivateCase,
  type VisionObservation,
} from "@/server/cases/v2-contracts";
import { SUSPECT_ROSTER } from "@/features/game/suspect-roster";

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
  provider?: "deepseek" | "qwen";
};

const DEFAULT_DEEPSEEK_FACTBOOK_TIMEOUT_MS = 60_000;

type PassObservation = Extract<VisionObservation, { decision: "PASS" }>;

function parseJsonObjectContent(content: string) {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const unfenced = trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
    try {
      return JSON.parse(unfenced);
    } catch {
      const start = unfenced.indexOf("{");
      const end = unfenced.lastIndexOf("}");
      if (start >= 0 && end > start) return JSON.parse(unfenced.slice(start, end + 1));
      throw new Error("JSON_OBJECT_NOT_FOUND");
    }
  }
}

class OpenAIDeepSeekFactbookTransport implements DeepSeekTransport {
  private readonly client: OpenAI;

  constructor(apiKey: string, baseURL: string, private readonly disableThinking = false) {
    this.client = new OpenAI({ apiKey, baseURL });
  }

  async create(request: DeepSeekRequest, signal: AbortSignal) {
    const completion = await this.client.chat.completions.create({
      ...request,
      ...(this.disableThinking ? { enable_thinking: false } : {}),
    }, { signal });
    return { content: completion.choices[0]?.message.content ?? "" };
  }
}

export type FactbookRuntimeConfig = {
  provider: "deepseek" | "qwen";
  apiKey: string;
  baseURL: string;
  model: string;
  disableThinking: boolean;
};

export function resolveFactbookRuntimeConfig(env: NodeJS.ProcessEnv = process.env): FactbookRuntimeConfig {
  const provider = env.FACTBOOK_PROVIDER?.trim().toLowerCase() === "qwen" ? "qwen" : "deepseek";
  if (provider === "qwen") {
    const apiKey = env.QWEN_TEXT_API_KEY?.trim() || env.QWEN_API_KEY?.trim();
    const baseURL = env.QWEN_TEXT_BASE_URL?.trim() || env.QWEN_BASE_URL?.trim();
    if (!apiKey) throw new Error("QWEN_TEXT_API_KEY_MISSING");
    if (!baseURL) throw new Error("QWEN_TEXT_BASE_URL_MISSING");
    return {
      provider,
      apiKey,
      baseURL,
      model: env.QWEN_TEXT_MODEL?.trim() || "qwen3.7-plus",
      disableThinking: true,
    };
  }

  const apiKey = env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY_MISSING");
  return {
    provider,
    apiKey,
    baseURL: env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com",
    model: env.DEEPSEEK_MODEL?.trim() || "deepseek-v4-flash",
    disableThinking: false,
  };
}

export function hasFactbookRuntimeConfig(env: NodeJS.ProcessEnv = process.env) {
  const provider = env.FACTBOOK_PROVIDER?.trim().toLowerCase() === "qwen" ? "qwen" : "deepseek";
  return provider === "qwen"
    ? Boolean((env.QWEN_TEXT_API_KEY || env.QWEN_API_KEY)?.trim()
      && (env.QWEN_TEXT_BASE_URL || env.QWEN_BASE_URL)?.trim())
    : Boolean(env.DEEPSEEK_API_KEY?.trim());
}

export function createDeepSeekFactbookTransportFromEnv(): DeepSeekTransport {
  const config = resolveFactbookRuntimeConfig();
  return new OpenAIDeepSeekFactbookTransport(
    config.apiKey,
    config.baseURL,
    config.disableThinking,
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
      gender: suspect.gender,
      age: suspect.age,
      relation: suspect.relation,
      personalityTags: suspect.personalityTags,
      portraitKey: suspect.portraitKey,
      initialTestimony: suspect.initialTestimony,
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

function restoreOmittedImmutableFields(value: unknown, original: V2PrivateCase): unknown {
  if (!isRecord(value)) return value;
  const visualFactsById = new Map(original.visualFacts.map((fact) => [fact.id, fact]));
  const evidenceById = new Map(original.evidence.map((evidence) => [evidence.id, evidence]));
  const suspectsById = new Map(original.suspects.map((suspect) => [suspect.id, suspect]));
  return {
    ...value,
    visualFacts: restoreVisualFacts(value.visualFacts, visualFactsById),
    evidence: restoreEvidence(value.evidence, evidenceById),
    suspects: restoreSuspects(value.suspects, suspectsById),
  };
}

function restoreVisualFacts(
  value: unknown,
  originals: Map<string, V2PrivateCase["visualFacts"][number]>,
) {
  if (!Array.isArray(value)) return value;
  return value.map((fact) => {
    if (!isRecord(fact) || typeof fact.id !== "string") return fact;
    const original = originals.get(fact.id);
    return original ? {
      x: original.x,
      y: original.y,
      radius: original.radius,
      confidence: original.confidence,
      ...fact,
    } : fact;
  });
}

function restoreEvidence(
  value: unknown,
  originals: Map<string, V2PrivateCase["evidence"][number]>,
) {
  if (!Array.isArray(value)) return value;
  return value.map((evidence) => {
    if (!isRecord(evidence) || typeof evidence.id !== "string") return evidence;
    const original = originals.get(evidence.id);
    return original ? {
      x: original.x,
      y: original.y,
      radius: original.radius,
      confidence: original.confidence,
      ...evidence,
    } : evidence;
  });
}

function restoreSuspects(
  value: unknown,
  originals: Map<string, V2PrivateCase["suspects"][number]>,
) {
  if (!Array.isArray(value)) return value;
  return value.map((suspect) => {
    if (!isRecord(suspect) || typeof suspect.id !== "string") return suspect;
    const original = originals.get(suspect.id);
    return original ? {
      privateAction: original.privateAction,
      allowedFactIds: original.allowedFactIds,
      ...suspect,
    } : suspect;
  });
}

function isGroundedFactbook(game: V2PrivateCase, expectedVisualFacts: PassObservation["visualFacts"]) {
  if (JSON.stringify(game.visualFacts) !== JSON.stringify(expectedVisualFacts)) return false;
  if (!hasUniqueValues(game.suspects.map((suspect) => suspect.portraitKey))) return false;

  const suspectIds = new Set(game.suspects.map((suspect) => suspect.id));
  const timelineIds = new Set(game.timelineFacts.map((fact) => fact.id));
  const evidenceIds = new Set(game.evidence.map((evidence) => evidence.id));
  const claimIds = new Set(game.claims.map((claim) => claim.id));
  const allowedFactIds = new Set([...timelineIds, ...claimIds]);
  if (
    suspectIds.size !== game.suspects.length
    || timelineIds.size !== game.timelineFacts.length
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

  if (game.suspects.some(
    (suspect) => suspect.allowedFactIds.some((reference) => !allowedFactIds.has(reference)),
  )) return false;

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
    timelineFacts: game.timelineFacts.map((fact) => ({ id: fact.id })),
    claims: game.claims.map((claim) => ({
      id: claim.id,
      suspectId: claim.suspectId,
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
    const provider = this.options.provider ?? "deepseek";
    const errorPrefix = provider === "qwen" ? "QWEN_TEXT" : "DEEPSEEK";
    let output: unknown;
    try {
      output = parseJsonObjectContent(content);
    } catch {
      console.warn("FACTBOOK_JSON_INVALID", JSON.stringify({ provider, contentLength: content.length }));
      throw new ProviderError("BAD_OUTPUT", `${errorPrefix}_FACTBOOK_OUTPUT_INVALID`);
    }
    const parsed = V2PrivateCaseSchema.safeParse(
      repairSource ? restoreOmittedImmutableFields(output, repairSource) : output,
    );
    if (!parsed.success) {
      console.warn("FACTBOOK_SCHEMA_INVALID", JSON.stringify({
        provider,
        issues: parsed.error.issues.slice(0, 12).map((issue) => ({
          path: issue.path.join("."),
          code: issue.code,
          message: issue.message,
        })),
      }));
      throw new ProviderError("BAD_OUTPUT", `${errorPrefix}_FACTBOOK_OUTPUT_INVALID`);
    }
    if (!isGroundedFactbook(parsed.data, expectedVisualFacts)) {
      console.warn("FACTBOOK_GROUNDING_INVALID", JSON.stringify({ provider }));
      throw new ProviderError("BAD_OUTPUT", `${errorPrefix}_FACTBOOK_OUTPUT_INVALID`);
    }
    return parsed.data;
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
        { role: "user", content: JSON.stringify({ observation: input.observation, suspectRoster: SUSPECT_ROSTER }) },
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
      const prefix = this.options.provider === "qwen" ? "QWEN_TEXT" : "DEEPSEEK";
      throw new ProviderError("BAD_OUTPUT", `${prefix}_FACTBOOK_OUTPUT_INVALID`);
    }
    return repaired;
  }
}

export function createDeepSeekFactbookCompilerFromEnv() {
  const config = resolveFactbookRuntimeConfig();
  return new DeepSeekFactbookCompiler({
    transport: new OpenAIDeepSeekFactbookTransport(
      config.apiKey,
      config.baseURL,
      config.disableThinking,
    ),
    model: config.model,
    timeoutMs: readFactbookTimeoutMs(process.env.DEEPSEEK_FACTBOOK_TIMEOUT_MS),
    provider: config.provider,
  });
}

function readFactbookTimeoutMs(value: string | undefined) {
  const parsed = typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed >= 10_000
    ? parsed
    : DEFAULT_DEEPSEEK_FACTBOOK_TIMEOUT_MS;
}
