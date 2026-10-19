/** Evidence from the Roboflow image-title workflow. Not a moderation decision. */

export type VisionDecision = 'match' | 'mismatch' | 'uncertain' | 'unavailable';

export type VisionErrorCode =
  | 'MISSING_CONFIG'
  | 'TIMEOUT'
  | 'INVALID_IMAGE'
  | 'RATE_LIMIT'
  | 'API_ERROR'
  | 'MALFORMED_RESPONSE'
  | 'UNAVAILABLE';

export type VisionImageInput = {
  key?: string;
  /** Public or CDN URL. Used when object bytes are not available. */
  url?: string;
  /** Raw base64 (no data-URI prefix). */
  base64?: string;
};

export type VisionAnalyzeInput = {
  listingId: string;
  title: string;
  description?: string | null;
  images: VisionImageInput[];
};

export type VisionAttributeStatus = 'match' | 'mismatch' | 'unknown';

export type VisionPrimaryItem = {
  expected: string;
  observed: string;
  match: VisionAttributeStatus;
  confidence: number | null;
};

export type VisionAttributeMatch = {
  name: string;
  expected: string;
  observed: string;
  status: VisionAttributeStatus;
  confidence: number | null;
};

export type VisionImageEvidence = {
  imageKey?: string;
  /** Decision after ReWorth normalization. */
  decision: Exclude<VisionDecision, 'unavailable'>;
  /** Decision string returned by the workflow before low-confidence handling. */
  modelDecision: Exclude<VisionDecision, 'unavailable'>;
  match: boolean;
  needsReview: boolean;
  confidence: number | null;
  lowConfidence: boolean;
  reason: string;
  labels: string[];
  /** True when this workflow response already judged the description. */
  descriptionAssessed?: boolean;
  titleMismatch?: boolean;
  descriptionMismatch?: boolean;
  primaryItem?: VisionPrimaryItem;
  attributes?: VisionAttributeMatch[];
  modelAnswer?: string;
  descriptionAnswer?: string;
  /**
   * Roboflow `reject` output when the workflow includes one.
   * Evidence only — ReWorth moderation decides APPROVE / NEEDS_REVIEW / REJECT.
   */
  providerReject?: boolean;
};

export type VisionAnalysisResult = {
  provider: 'roboflow';
  workflowId: string;
  status: 'ok' | 'error';
  /** True only when every checked image confidently supports the title and description. */
  match: boolean;
  /** Review signal for the moderation / risk decision. Never an automatic reject. */
  needsReview: boolean;
  confidence: number | null;
  decision: VisionDecision;
  lowConfidence: boolean;
  reason: string;
  labels: string[];
  signals: string[];
  evidence: VisionImageEvidence[];
  uncheckedImageCount?: number;
  error?: {
    code: VisionErrorCode;
    message: string;
  };
};

export type VisionHttp = (
  url: string,
  init?: RequestInit,
) => Promise<Response>;

export const VISION_HTTP = Symbol('VISION_HTTP');
