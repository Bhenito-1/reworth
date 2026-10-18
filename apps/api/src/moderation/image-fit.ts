/**
 * Filename / copy heuristic for image appropriateness.
 * Roboflow image-title evidence is a separate review signal (`visionNeedsReview`)
 * and does not hard-reject a listing.
 * Higher scores = better appropriateness / fit.
 */

const STOP = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'this',
  'that',
  'have',
  'has',
  'are',
  'was',
  'were',
  'you',
  'your',
  'our',
  'sale',
  'sell',
  'selling',
  'used',
  'good',
  'great',
  'new',
  'lagos',
  'nigeria',
  'reworth',
  'item',
  'items',
  'photo',
  'photos',
  'image',
  'images',
  'jpg',
  'jpeg',
  'png',
  'webp',
]);

const MISMATCH_PAIRS: Array<[RegExp, RegExp, string]> = [
  [/sofa|couch|furniture|wardrobe|bed|table|chair/i, /car|vehicle|toyota|honda|benz|engine/i, 'IMAGE_MISMATCH_VEHICLE_VS_FURNITURE'],
  [/iphone|samsung|laptop|macbook|phone|gadget|electronics/i, /dress|shoe|sneaker|fashion|cloth/i, 'IMAGE_MISMATCH_FASHION_VS_ELECTRONICS'],
  [/car|vehicle|toyota|honda|benz|engine|mileage/i, /sofa|couch|wardrobe|dress|shoe/i, 'IMAGE_MISMATCH_NON_VEHICLE_FOR_CAR'],
];

export type ImageFitInput = {
  title: string;
  description: string;
  brand?: string | null;
  categoryName?: string | null;
  categorySlug?: string | null;
  imageKeys: string[];
  /** Images that completed pipeline successfully */
  readyCount: number;
  /** Images marked FAILED */
  failedCount: number;
  nsfw: boolean;
  nsfwReasons: string[];
};

export type ImageFitResult = {
  imageScore: number;
  imageFitScore: number;
  signals: string[];
  policyViolations: string[];
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s/_.-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOP.has(t));
}

export function scoreImageListingFit(input: ImageFitInput): ImageFitResult {
  const signals: string[] = [];
  const policyViolations: string[] = [];

  if (input.nsfw) {
    policyViolations.push(...input.nsfwReasons.map((r) => `NSFW:${r}`));
    signals.push('IMAGE_NSFW');
    return {
      imageScore: 0,
      imageFitScore: 0,
      signals,
      policyViolations,
    };
  }

  if (input.readyCount === 0) {
    policyViolations.push('MISSING_IMAGES');
    signals.push('NO_READY_IMAGES');
    if (input.failedCount > 0) {
      signals.push('IMAGE_PIPELINE_FAILED');
      policyViolations.push('IMAGE_UPLOAD_FAILED');
    }
    return {
      imageScore: 0,
      imageFitScore: 0,
      signals,
      policyViolations,
    };
  }

  if (input.readyCount < 2) {
    signals.push('TOO_FEW_IMAGES');
    policyViolations.push('MIN_PHOTOS_NOT_MET');
  }

  const listingBlob = [
    input.title,
    input.description,
    input.brand ?? '',
    input.categoryName ?? '',
    input.categorySlug ?? '',
  ].join(' ');
  const listingTokens = new Set(tokenize(listingBlob));
  const keyBlob = input.imageKeys.join(' ');
  const keyTokens = new Set(tokenize(keyBlob));

  let overlap = 0;
  for (const t of listingTokens) {
    if (keyTokens.has(t)) overlap += 1;
  }

  let imageFitScore = 55;
  if (listingTokens.size === 0) {
    imageFitScore = 50;
    signals.push('SPARSE_LISTING_COPY');
  } else if (overlap > 0) {
    imageFitScore = Math.min(95, 60 + overlap * 8);
    signals.push(`FILENAME_TOKEN_OVERLAP:${overlap}`);
  } else {
    imageFitScore = 48;
    signals.push('NO_FILENAME_TOKEN_OVERLAP');
  }

  for (const [listingRe, keyRe, code] of MISMATCH_PAIRS) {
    if (listingRe.test(listingBlob) && keyRe.test(keyBlob)) {
      policyViolations.push(code);
      signals.push(code);
      imageFitScore = Math.min(imageFitScore, 25);
    }
  }

  // Presence of real ready images boosts base safety score
  let imageScore = Math.round(
    imageFitScore * 0.7 + Math.min(30, input.readyCount * 10),
  );
  if (input.failedCount > 0) {
    signals.push(`FAILED_IMAGES:${input.failedCount}`);
    imageScore = Math.max(0, imageScore - 15);
  }
  if (input.readyCount >= 2 && policyViolations.length === 0) {
    imageScore = Math.max(imageScore, 70);
  }

  imageScore = Math.max(0, Math.min(100, imageScore));
  imageFitScore = Math.max(0, Math.min(100, imageFitScore));

  return { imageScore, imageFitScore, signals, policyViolations };
}

export function decideFromScores(opts: {
  imageScore: number;
  imageFitScore: number;
  riskScore: number;
  riskForceReview: boolean;
  policyViolations: string[];
  keywordHardReject: boolean;
  keywordSoftReview: boolean;
  /** Image-title vision asked for admin review. Never a hard reject by itself. */
  visionNeedsReview?: boolean;
}): {
  decision: 'PASS' | 'UNDER_REVIEW' | 'REJECTED';
  rejectionReason?: string;
} {
  const hardImage = opts.policyViolations.some(
    (v) =>
      v.startsWith('NSFW:') ||
      v === 'MISSING_IMAGES' ||
      v === 'IMAGE_UPLOAD_FAILED' ||
      v.startsWith('IMAGE_MISMATCH_'),
  );

  if (opts.keywordHardReject || hardImage) {
    const reason =
      opts.policyViolations.find((v) => v.startsWith('NSFW:')) ??
      opts.policyViolations.find((v) => v.startsWith('IMAGE_MISMATCH_')) ??
      opts.policyViolations.find((v) =>
        ['MISSING_IMAGES', 'IMAGE_UPLOAD_FAILED'].includes(v),
      ) ??
      'Policy violation';
    return {
      decision: 'REJECTED',
      rejectionReason: humanRejectionReason(reason),
    };
  }

  if (
    opts.riskForceReview ||
    opts.keywordSoftReview ||
    opts.visionNeedsReview ||
    opts.policyViolations.includes('MIN_PHOTOS_NOT_MET') ||
    opts.imageScore < 55 ||
    opts.imageFitScore < 40 ||
    opts.riskScore >= 40
  ) {
    return { decision: 'UNDER_REVIEW' };
  }

  return { decision: 'PASS' };
}

function humanRejectionReason(code: string): string {
  if (code.startsWith('NSFW:')) {
    return 'One or more photos appear inappropriate for ReWorth.';
  }
  if (code === 'MISSING_IMAGES' || code === 'IMAGE_UPLOAD_FAILED') {
    return 'Photos did not upload successfully. Please re-add clear photos of the item and try again.';
  }
  if (code.startsWith('IMAGE_MISMATCH_')) {
    return 'Photos do not appear to match the item description. Please upload photos of the actual item.';
  }
  return `Listing rejected: ${code}`;
}
