import type {
  VisionAttributeMatch,
  VisionAttributeStatus,
  VisionImageEvidence,
  VisionPrimaryItem,
} from './vision.types';
import { consistencyScore } from './consistency-score';
import { DEFAULT_LOW_CONFIDENCE_THRESHOLD } from './vision.config';

const DECISIONS = new Set(['match', 'mismatch', 'uncertain']);

export type NormalizeSuccess = { ok: true; hit: VisionImageEvidence };
export type NormalizeFailure = {
  ok: false;
  error: { code: 'MALFORMED_RESPONSE'; message: string };
};

const MALFORMED: NormalizeFailure = {
  ok: false,
  error: {
    code: 'MALFORMED_RESPONSE',
    message: 'Roboflow returned an unreadable image-title result',
  },
};

export function normalizeRoboflowBody(
  body: unknown,
  threshold = DEFAULT_LOW_CONFIDENCE_THRESHOLD,
  imageKey?: string,
): NormalizeSuccess | NormalizeFailure {
  const output = firstOutput(body);
  if (!output) return MALFORMED;
  return normalizeWorkflowOutput(output, threshold, imageKey);
}

export function normalizeWorkflowOutput(
  output: Record<string, unknown>,
  threshold = DEFAULT_LOW_CONFIDENCE_THRESHOLD,
  imageKey?: string,
): NormalizeSuccess | NormalizeFailure {
  const modelAnswer = firstString(output, ['model_answer', 'modelAnswer']);
  const parsedModel = modelAnswer ? tryParseModelJson(modelAnswer) : null;
  const primary = parsePrimary(
    output.primary_item ?? output.primary_item_match ?? output.primaryItem,
  );
  const attributes = parseAttributes(
    output.attributes ?? output.attribute_matches ?? output.attributeMatches,
  );
  const descriptionAnswer = firstString(output, [
    'description_answer',
    'descriptionAnswer',
  ]);
  const descriptionAssessed =
    primary != null ||
    attributes.length > 0 ||
    Boolean(descriptionAnswer) ||
    Array.isArray(output.detected_items);

  let modelDecision =
    parseDecision(output.decision) ??
    parsedModel?.decision ??
    decisionFromPrimary(primary) ??
    decisionFromBoolean(output.match);
  if (!modelDecision) return MALFORMED;

  const parsedConfidence =
    parseConfidence(output.confidence) ??
    parsedModel?.confidence ??
    null;
  const blended =
    parsedConfidence == null && (attributes.length > 0 || primary)
      ? consistencyScore({
          titleDecision: modelDecision,
          titleConfidence: primary?.confidence ?? null,
          attributeStatuses: attributes.map((attribute) => attribute.status),
        })
      : null;
  const confidence = parsedConfidence ?? blended?.score ?? null;
  const reason =
    firstString(output, ['reason']) ??
    parsedModel?.reason ??
    fallbackReason(modelDecision);
  const labels = collectLabels(output, parsedModel?.labels ?? []);
  const providerNeedsReview = parseBool(
    output.needs_review ?? output.needsReview,
  );
  const providerReject = parseBool(output.reject);
  const lowConfidence =
    confidence != null &&
    confidence <= threshold &&
    modelDecision !== 'mismatch';
  const decision = lowConfidence ? 'uncertain' : modelDecision;
  const match = modelDecision === 'match' && !lowConfidence;
  const needsReview =
    providerNeedsReview === true ||
    providerReject === true ||
    modelDecision === 'mismatch' ||
    lowConfidence ||
    (providerNeedsReview == null && (blended?.needsReview ?? !match));

  const hit: VisionImageEvidence = {
    imageKey,
    decision,
    modelDecision,
    match,
    needsReview,
    confidence,
    lowConfidence,
    reason: reason.slice(0, 500),
    labels,
  };
  if (modelAnswer) hit.modelAnswer = modelAnswer.slice(0, 2000);
  if (descriptionAnswer) hit.descriptionAnswer = descriptionAnswer.slice(0, 2000);
  if (descriptionAssessed) hit.descriptionAssessed = true;
  if (primary) hit.primaryItem = primary;
  if (attributes.length > 0) hit.attributes = attributes;
  if (providerReject != null) hit.providerReject = providerReject;
  hit.titleMismatch = descriptionAssessed
    ? primary?.match === 'mismatch' ||
      (primary == null &&
        modelDecision === 'mismatch' &&
        !attributes.some((attribute) => attribute.status === 'mismatch'))
    : modelDecision === 'mismatch';
  hit.descriptionMismatch =
    attributes.some((attribute) => attribute.status === 'mismatch') ||
    (descriptionAssessed &&
      modelDecision === 'mismatch' &&
      primary?.match !== 'mismatch');
  return { ok: true, hit };
}

function decisionFromPrimary(
  primary: VisionPrimaryItem | null,
): VisionImageEvidence['modelDecision'] | null {
  if (!primary) return null;
  if (primary.match === 'match') return 'match';
  if (primary.match === 'mismatch') return 'mismatch';
  return 'uncertain';
}

function decisionFromBoolean(
  value: unknown,
): VisionImageEvidence['modelDecision'] | null {
  if (typeof value !== 'boolean') return null;
  return value ? 'match' : 'mismatch';
}

function parsePrimary(value: unknown): VisionPrimaryItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const match = parseStatus(record.match);
  const expected = typeof record.expected === 'string' ? record.expected.trim() : '';
  const observed = typeof record.observed === 'string' ? record.observed.trim() : '';
  if (!match || !expected || !observed) return null;
  return {
    expected: expected.slice(0, 120),
    observed: observed.slice(0, 120),
    match,
    confidence: parseConfidence(record.confidence),
  };
}

function parseAttributes(value: unknown): VisionAttributeMatch[] {
  if (!Array.isArray(value)) return [];
  const attributes: VisionAttributeMatch[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const status = parseStatus(record.status ?? record.match);
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    const expected = typeof record.expected === 'string' ? record.expected.trim() : '';
    const observed = typeof record.observed === 'string' ? record.observed.trim() : '';
    if (!status || !name || !expected || !observed) continue;
    attributes.push({
      name: name.slice(0, 120),
      expected: expected.slice(0, 120),
      observed: observed.slice(0, 120),
      status,
      confidence: parseConfidence(record.confidence),
    });
  }
  return attributes;
}

function parseStatus(value: unknown): VisionAttributeStatus | null {
  if (value === 'match' || value === 'mismatch' || value === 'unknown') return value;
  return null;
}

function firstOutput(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  const outputs = record.outputs ?? record.output;
  if (Array.isArray(outputs)) {
    const first = outputs.find(
      (item) => item && typeof item === 'object' && !Array.isArray(item),
    );
    return (first as Record<string, unknown> | undefined) ?? null;
  }
  if (outputs && typeof outputs === 'object' && !Array.isArray(outputs)) {
    return outputs as Record<string, unknown>;
  }
  if (parseDecision(record.decision)) return record;
  return null;
}

function parseDecision(
  value: unknown,
): VisionImageEvidence['modelDecision'] | null {
  if (typeof value !== 'string') return null;
  const decision = value.trim().toLowerCase();
  if (!DECISIONS.has(decision)) return null;
  return decision as VisionImageEvidence['modelDecision'];
}

function parseConfidence(value: unknown): number | null {
  if (typeof value === 'boolean' || value == null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1) return null;
  return n;
}

function parseBool(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function firstString(
  output: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = output[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function fallbackReason(
  decision: VisionImageEvidence['modelDecision'],
): string {
  if (decision === 'uncertain') {
    return 'Vision check was uncertain; send for manual review.';
  }
  if (decision === 'mismatch') {
    return 'Image does not appear to support the listing title.';
  }
  return 'Image appears to support the listing title.';
}

function tryParseModelJson(raw: string): {
  decision?: VisionImageEvidence['modelDecision'];
  confidence?: number;
  reason?: string;
  labels?: string[];
} | null {
  let text = raw.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').trim();
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    const labels = collectLabels(record);
    return {
      decision: parseDecision(record.decision) ?? undefined,
      confidence:
        parseConfidence(record.confidence) ??
        parseConfidence(record.match_score) ??
        undefined,
      reason: typeof record.reason === 'string' ? record.reason.trim() : undefined,
      labels,
    };
  } catch {
    return null;
  }
}

function collectLabels(
  output: Record<string, unknown>,
  extra: string[] = [],
): string[] {
  const found = new Set<string>();
  const push = (value: unknown) => {
    if (typeof value !== 'string') return;
    const label = value.trim();
    if (label) found.add(label);
  };
  for (const key of ['predictions', 'detections', 'labels', 'classes', 'detected_items']) {
    const value = output[key];
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (typeof item === 'string') push(item);
      else if (item && typeof item === 'object') {
        const rec = item as Record<string, unknown>;
        push(rec.class);
        push(rec.class_name);
        push(rec.label);
        push(rec.name);
      }
    }
  }
  for (const label of extra) push(label);
  return [...found];
}
