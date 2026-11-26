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
  url?: string;
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
  decision: Exclude<VisionDecision, 'unavailable'>;
  modelDecision: Exclude<VisionDecision, 'unavailable'>;
  match: boolean;
  needsReview: boolean;
  confidence: number | null;
  lowConfidence: boolean;
  reason: string;
  labels: string[];
  descriptionAssessed?: boolean;
  titleMismatch?: boolean;
  descriptionMismatch?: boolean;
  primaryItem?: VisionPrimaryItem;
  attributes?: VisionAttributeMatch[];
  modelAnswer?: string;
  descriptionAnswer?: string;
  providerReject?: boolean;
};

export type VisionAnalysisResult = {
  provider: 'none';
  workflowId: string;
  status: 'ok' | 'error';
  match: boolean;
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