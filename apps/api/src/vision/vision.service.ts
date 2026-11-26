import { Injectable } from '@nestjs/common';
import type {
  VisionAnalysisResult,
  VisionAnalyzeInput,
  VisionErrorCode,
} from './vision.types';

/** Listing image-title checks are disabled; moderation uses other signals only. */
export function disabledVisionResult(): VisionAnalysisResult {
  return {
    provider: 'none',
    workflowId: '',
    status: 'ok',
    match: true,
    needsReview: false,
    confidence: null,
    decision: 'match',
    lowConfidence: false,
    reason: 'Image-title check is not enabled',
    labels: [],
    signals: [],
    evidence: [],
  };
}

/** @deprecated Use disabledVisionResult — kept for moderation error fallback. */
export function visionFailureResult(
  _error: { code: VisionErrorCode; message: string },
  _workflowId = '',
): VisionAnalysisResult {
  return disabledVisionResult();
}

@Injectable()
export class VisionService {
  async analyzeListing(_input: VisionAnalyzeInput): Promise<VisionAnalysisResult> {
    return disabledVisionResult();
  }
}