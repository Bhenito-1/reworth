import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { STORAGE_PROVIDER, type StorageProvider } from '../providers/storage.provider';
import {
  DEFAULT_VISION_MAX_IMAGES,
  MAX_VISION_IMAGE_BYTES,
  readPositiveNumber,
} from './vision.config';
import { consistencyScore } from './consistency-score';
import { RoboflowService } from './roboflow.service';
import type {
  VisionAnalysisResult,
  VisionAnalyzeInput,
  VisionErrorCode,
  VisionImageEvidence,
  VisionImageInput,
} from './vision.types';

type CheckPart =
  | { kind: 'hit'; hit: VisionImageEvidence }
  | { kind: 'error'; imageKey?: string; error: { code: VisionErrorCode; message: string } };

/**
 * Listing image analysis used by moderation.
 * Roboflow supplies evidence. `needsReview` is a signal for decideFromScores,
 * not an approve / reject outcome.
 */
@Injectable()
export class VisionService {
  private readonly logger = new Logger(VisionService.name);

  constructor(
    private readonly roboflow: RoboflowService,
    private readonly config: ConfigService,
    @Optional()
    @Inject(STORAGE_PROVIDER)
    private readonly storage?: StorageProvider,
  ) {}

  async analyzeListing(input: VisionAnalyzeInput): Promise<VisionAnalysisResult> {
    const workflowId = this.roboflow.workflowId();
    const missing = this.roboflow.missingConfigError();
    if (missing) {
      this.logger.warn({ listingId: input.listingId }, missing.message);
      return visionFailureResult(missing, workflowId);
    }

    const maxImages = Math.floor(
      readPositiveNumber(
        this.config.get<string | number>('VISION_MAX_IMAGES'),
        DEFAULT_VISION_MAX_IMAGES,
      ),
    );
    const selected = input.images.slice(0, maxImages);
    const uncheckedImageCount = Math.max(0, input.images.length - selected.length);

    if (selected.length === 0) {
      return visionFailureResult(
        {
          code: 'INVALID_IMAGE',
          message: 'Listing image is missing or unreadable',
        },
        workflowId,
      );
    }

    const parts = (
      await Promise.all(selected.map((image) => this.checkOne(input, image)))
    ).flat();
    const result = aggregateVisionChecks({
      workflowId,
      parts,
      uncheckedImageCount,
    });
    this.logger.log({
      listingId: input.listingId,
      status: result.status,
      decision: result.decision,
      match: result.match,
      needsReview: result.needsReview,
      confidence: result.confidence,
      error: result.error?.code,
    });
    return result;
  }

  private async checkOne(
    input: VisionAnalyzeInput,
    image: VisionImageInput,
  ): Promise<CheckPart[]> {
    const resolved = await this.resolveImage(image);
    if ('error' in resolved) {
      return [
        {
          kind: 'error',
          imageKey: image.key,
          error: { code: 'INVALID_IMAGE', message: resolved.error },
        },
      ];
    }
    const checked = await this.roboflow.checkImageTitle({
      image: resolved,
      title: input.title,
      description: input.description,
      imageKey: image.key,
    });
    if (!checked.ok) {
      return [{ kind: 'error', imageKey: image.key, error: checked.error }];
    }

    const descriptionText = descriptionToCheck(input.title, input.description);
    if (!descriptionText || checked.hit.descriptionAssessed) {
      return [{ kind: 'hit', hit: checked.hit }];
    }

    const described = await this.roboflow.checkImageTitle({
      image: resolved,
      title: descriptionText,
      description: descriptionText,
      imageKey: image.key,
    });
    if (!described.ok) {
      return [
        { kind: 'hit', hit: checked.hit },
        { kind: 'error', imageKey: image.key, error: described.error },
      ];
    }
    return [{ kind: 'hit', hit: mergeListingClaims(checked.hit, described.hit) }];
  }

  private async resolveImage(
    image: VisionImageInput,
  ): Promise<
    | { type: 'base64'; value: string }
    | { type: 'url'; value: string }
    | { error: string }
  > {
    if (image.base64?.trim()) {
      const value = image.base64
        .trim()
        .replace(/^data:[^;]+;base64,/i, '')
        .trim();
      if (!value) return { error: 'Listing image is missing or unreadable' };
      return { type: 'base64', value };
    }

    if (image.key && this.storage?.getObject) {
      try {
        const bucket = this.config.get<string>('S3_BUCKET') ?? 'reworth-media';
        const buf = await this.storage.getObject(bucket, image.key);
        if (buf && buf.length > 0) {
          if (buf.length > MAX_VISION_IMAGE_BYTES) {
            return { error: 'Listing image exceeds the vision size limit' };
          }
          return { type: 'base64', value: buf.toString('base64') };
        }
      } catch (err) {
        this.logger.warn({ err, key: image.key }, 'Failed to read listing image for vision');
      }
    }

    const url = image.url?.trim();
    if (url && /^https?:\/\//i.test(url)) {
      return { type: 'url', value: url };
    }
    return { error: 'Listing image is missing or unreadable' };
  }
}

export function visionFailureResult(
  error: { code: VisionErrorCode; message: string },
  workflowId = '',
): VisionAnalysisResult {
  const result: VisionAnalysisResult = {
    provider: 'roboflow',
    workflowId,
    status: 'error',
    match: false,
    needsReview: true,
    confidence: null,
    decision: 'unavailable',
    lowConfidence: false,
    reason: error.message,
    labels: [],
    signals: [],
    evidence: [],
    error,
  };
  result.signals = buildVisionSignals(result);
  return result;
}

function aggregateVisionChecks(input: {
  workflowId: string;
  parts: CheckPart[];
  uncheckedImageCount?: number;
}): VisionAnalysisResult {
  const hits = input.parts.filter(
    (part): part is { kind: 'hit'; hit: VisionImageEvidence } => part.kind === 'hit',
  );
  const errors = input.parts.filter(
    (part): part is Extract<CheckPart, { kind: 'error' }> => part.kind === 'error',
  );
  const uncheckedImageCount = input.uncheckedImageCount ?? 0;
  const confidences = hits
    .map((part) => part.hit.confidence)
    .filter((n): n is number => n != null);
  const confidence = confidences.length ? Math.min(...confidences) : null;
  const labels = [...new Set(hits.flatMap((part) => part.hit.labels))];
  const lowConfidence = hits.some((part) => part.hit.lowConfidence);
  const anyMismatch = hits.some((part) => part.hit.modelDecision === 'mismatch');
  const anyUncertain = hits.some((part) => part.hit.decision === 'uncertain');
  const match =
    errors.length === 0 &&
    uncheckedImageCount === 0 &&
    hits.length > 0 &&
    hits.every((part) => part.hit.match);

  let decision: VisionAnalysisResult['decision'] = 'unavailable';
  if (anyMismatch) decision = 'mismatch';
  else if (match) decision = 'match';
  else if (hits.length > 0 || anyUncertain) decision = 'uncertain';

  const needsReview =
    !match ||
    hits.some((part) => part.hit.needsReview) ||
    errors.length > 0 ||
    uncheckedImageCount > 0 ||
    hits.length === 0;

  const reason =
    hits.find((part) => part.hit.modelDecision === 'mismatch')?.hit.reason ??
    hits.find((part) => !part.hit.match)?.hit.reason ??
    errors[0]?.error.message ??
    hits[0]?.hit.reason ??
    'Vision check did not return a result';

  const result: VisionAnalysisResult = {
    provider: 'roboflow',
    workflowId: input.workflowId,
    status: errors.length > 0 ? 'error' : 'ok',
    match,
    needsReview,
    confidence,
    decision,
    lowConfidence,
    reason,
    labels,
    signals: [],
    evidence: hits.map((part) => part.hit),
    uncheckedImageCount,
  };
  if (errors[0]) result.error = errors[0].error;
  result.signals = buildVisionSignals(result);
  return result;
}

export function buildVisionSignals(result: VisionAnalysisResult): string[] {
  const signals: string[] = [];
  const titleMismatch = result.evidence.some((item) => item.titleMismatch);
  const descriptionMismatch = result.evidence.some((item) => item.descriptionMismatch);
  if (result.error) signals.push(`VISION_CHECK_FAILED:${result.error.code}`);
  if (result.match && result.decision === 'match') signals.push('VISION_TITLE_MATCH');
  if (titleMismatch) signals.push('VISION_TITLE_MISMATCH');
  if (descriptionMismatch) signals.push('VISION_DESCRIPTION_MISMATCH');
  if (result.decision === 'mismatch' && !titleMismatch && !descriptionMismatch) {
    signals.push('VISION_TITLE_MISMATCH');
  }
  if (result.decision === 'uncertain') signals.push('VISION_UNCERTAIN');
  if (result.lowConfidence) signals.push('VISION_LOW_CONFIDENCE');
  if (result.needsReview) signals.push('VISION_NEEDS_REVIEW');
  return [...new Set(signals)];
}

function descriptionToCheck(
  title: string,
  description?: string | null,
): string | null {
  const text = (description ?? '').replace(/\u0000/g, '').trim();
  if (text.length < 3) return null;
  if (normalizeClaim(text) === normalizeClaim(title)) return null;
  return text;
}

function normalizeClaim(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function mergeListingClaims(
  titleHit: VisionImageEvidence,
  descriptionHit: VisionImageEvidence,
): VisionImageEvidence {
  const titleMismatch = titleHit.modelDecision === 'mismatch';
  const descriptionMismatch =
    descriptionHit.modelDecision === 'mismatch' ||
    (descriptionHit.attributes ?? []).some((attribute) => attribute.status === 'mismatch');
  const scored = consistencyScore({
    titleDecision: titleHit.modelDecision,
    titleConfidence: titleHit.confidence,
    descriptionDecision: descriptionHit.modelDecision,
    descriptionConfidence: descriptionHit.confidence,
  });
  const needsReview = titleHit.needsReview || scored.needsReview;
  const match =
    titleHit.modelDecision === 'match' && titleHit.match && scored.score >= 0.5;
  const decision = titleMismatch ? 'mismatch' : match ? 'match' : 'uncertain';
  const modelDecision = titleMismatch
    ? 'mismatch'
    : titleHit.modelDecision === 'match' && descriptionHit.modelDecision === 'match'
      ? 'match'
      : titleHit.modelDecision;
  return {
    ...titleHit,
    decision,
    modelDecision,
    match,
    needsReview,
    confidence: scored.score,
    lowConfidence:
      !titleMismatch &&
      (scored.score <= 0.5 || titleHit.lowConfidence || descriptionHit.lowConfidence),
    reason: `Title: ${titleHit.reason} Description: ${descriptionHit.reason}`.slice(0, 500),
    labels: [...new Set([...titleHit.labels, ...descriptionHit.labels])],
    descriptionAssessed: true,
    titleMismatch,
    descriptionMismatch,
    attributes: descriptionHit.attributes ?? titleHit.attributes,
    primaryItem: titleHit.primaryItem ?? descriptionHit.primaryItem,
  };
}
