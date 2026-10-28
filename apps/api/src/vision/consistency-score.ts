/**
 * Same weights as the ReWorth Image-Title Check workflow.
 * The title (primary item) is 70% of the consistency score.
 * Description attributes are 30%.
 * A title mismatch ignores attributes and caps the score at 0.20.
 * Review when the score is below 0.50.
 */
export const TITLE_SCORE_WEIGHT = 0.7;
export const ATTRIBUTE_SCORE_WEIGHT = 0.3;
export const CONSISTENCY_REVIEW_BELOW = 0.5;
const TITLE_MISMATCH_CAP = 0.2;
const UNKNOWN_PRIMARY_SUPPORT = 0.35;
const UNKNOWN_ATTRIBUTE_SUPPORT = 0.8;

export type ConsistencyClaim = 'match' | 'mismatch' | 'uncertain';
export type AttributeStatus = 'match' | 'mismatch' | 'unknown';

export type ConsistencyScoreInput = {
  titleDecision: ConsistencyClaim;
  titleConfidence: number | null;
  /** Per-attribute statuses from the workflow. Takes precedence over a description verdict. */
  attributeStatuses?: AttributeStatus[];
  descriptionDecision?: ConsistencyClaim | null;
  descriptionConfidence?: number | null;
};

export type ConsistencyScore = {
  score: number;
  /** True when the weighted score is below 0.50, or the title itself is uncertain or low-confidence. */
  needsReview: boolean;
};

export function consistencyScore(input: ConsistencyScoreInput): ConsistencyScore {
  if (input.titleDecision === 'mismatch') {
    const confidence = clamp(input.titleConfidence ?? 1);
    const score = round2(Math.min(TITLE_MISMATCH_CAP, TITLE_MISMATCH_CAP * (1 - confidence)));
    return { score, needsReview: true };
  }

  const primary =
    input.titleDecision === 'match'
      ? clamp(input.titleConfidence ?? 1)
      : UNKNOWN_PRIMARY_SUPPORT;

  const attributes = input.attributeStatuses ?? [];
  let score: number;
  if (attributes.length > 0) {
    const attributeSupport =
      attributes.reduce((sum, status) => sum + attributeStatusSupport(status), 0) /
      attributes.length;
    score = round2(TITLE_SCORE_WEIGHT * primary + ATTRIBUTE_SCORE_WEIGHT * attributeSupport);
  } else if (input.descriptionDecision) {
    const descriptionSupport = descriptionClaimSupport(
      input.descriptionDecision,
      input.descriptionConfidence ?? null,
    );
    score = round2(
      TITLE_SCORE_WEIGHT * primary + ATTRIBUTE_SCORE_WEIGHT * descriptionSupport,
    );
  } else {
    score = round2(primary);
  }

  const titleLowConfidence =
    input.titleDecision === 'match' &&
    input.titleConfidence != null &&
    input.titleConfidence <= CONSISTENCY_REVIEW_BELOW;
  return {
    score,
    needsReview:
      score < CONSISTENCY_REVIEW_BELOW ||
      input.titleDecision === 'uncertain' ||
      titleLowConfidence,
  };
}

function attributeStatusSupport(status: AttributeStatus): number {
  if (status === 'match') return 1;
  if (status === 'mismatch') return 0;
  return UNKNOWN_ATTRIBUTE_SUPPORT;
}

function descriptionClaimSupport(
  decision: ConsistencyClaim,
  confidence: number | null,
): number {
  if (decision === 'mismatch') return 0;
  if (decision === 'uncertain') return UNKNOWN_ATTRIBUTE_SUPPORT;
  return clamp(confidence ?? 1);
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
