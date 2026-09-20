/** Types for the shared deterministic constraint parser (explicit-constraint-parser.js). */

export type ConstraintStrength = 'required' | 'preferred' | 'context';

export interface ExplicitConstraint {
  strength: ConstraintStrength;
  value: unknown;
}

export interface ExplicitParseResult {
  /** Authoritative: no model output may weaken, strengthen or contradict these. */
  constraints: Record<string, ExplicitConstraint>;
  /**
   * Fields the text positively supports. Not the same as "mentioned": a negated concept is
   * mentioned but unsupported, so a model cannot reintroduce it.
   */
  supported: Set<string>;
}

export declare function parseExplicitTextConstraints(rawText: string): ExplicitParseResult;
export declare function visitDurationFrom(text: string): number | null;
export declare const DEFAULT_STRENGTH: 'preferred';
export declare const CONCEPTS: ReadonlyArray<{ field: string; value: string; pattern: RegExp }>;
