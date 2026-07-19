import type { GeneratedCase, PrivateCase } from "@/server/cases/contracts";
import type { VisionObservation } from "@/server/cases/v2-contracts";

export type ValidationIssue = {
  code: "NON_UNIQUE" | "CONTRADICTION" | "OUTSIDE_EVIDENCE" | "UNSAFE" | "COPY_QUALITY";
  field: string;
  message: string;
};

export type SemanticValidation = {
  valid: boolean;
  confidence: number;
  issues: ValidationIssue[];
};

export interface VisionCaseProvider {
  generateCase(input: {
    imageUrl: string;
    imageWidth: number;
    imageHeight: number;
    locale: "zh-CN";
    traceId: string;
  }): Promise<GeneratedCase>;
}

export interface VisionObservationProvider {
  observeScene(input: {
    imageUrl: string;
    imageWidth: number;
    imageHeight: number;
    locale: "zh-CN";
    traceId: string;
  }): Promise<VisionObservation>;
}

export interface CaseJudgeProvider {
  validateCase(input: {
    game: PrivateCase;
    visibleObjectNames: string[];
    traceId: string;
  }): Promise<SemanticValidation>;
  repairCase(input: {
    game: PrivateCase;
    issues: ValidationIssue[];
    traceId: string;
  }): Promise<PrivateCase>;
}

export type ProviderErrorCode =
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "BAD_OUTPUT"
  | "UNAVAILABLE"
  | "AUTH_FAILED";

export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }

  get retryable() {
    return this.code !== "AUTH_FAILED";
  }
}
