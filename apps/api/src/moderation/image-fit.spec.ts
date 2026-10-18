import {
  decideFromScores,
  scoreImageListingFit,
} from './image-fit';

describe('scoreImageListingFit', () => {
  it('rejects when no ready images', () => {
    const r = scoreImageListingFit({
      title: 'Sofa',
      description: 'Nice sofa',
      imageKeys: [],
      readyCount: 0,
      failedCount: 1,
      nsfw: false,
      nsfwReasons: [],
    });
    expect(r.imageScore).toBe(0);
    expect(r.policyViolations).toContain('MISSING_IMAGES');
  });

  it('flags nsfw as zero score', () => {
    const r = scoreImageListingFit({
      title: 'Item',
      description: 'desc',
      imageKeys: ['uploads/u/nsfw.jpg'],
      readyCount: 2,
      failedCount: 0,
      nsfw: true,
      nsfwReasons: ['IMAGE_NSFW_KEY'],
    });
    expect(r.imageScore).toBe(0);
    expect(r.policyViolations.some((v) => v.startsWith('NSFW:'))).toBe(true);
  });

  it('scores clean multi-photo listing well', () => {
    const r = scoreImageListingFit({
      title: 'IKEA sofa Lekki',
      description: 'Gently used grey sofa',
      brand: 'IKEA',
      categoryName: 'Furniture',
      imageKeys: ['uploads/u/sofa-front.jpg', 'uploads/u/sofa-side.jpg'],
      readyCount: 2,
      failedCount: 0,
      nsfw: false,
      nsfwReasons: [],
    });
    expect(r.imageScore).toBeGreaterThanOrEqual(70);
    expect(r.policyViolations).not.toContain('MISSING_IMAGES');
  });
});

describe('decideFromScores', () => {
  it('rejects hard policy violations', () => {
    const d = decideFromScores({
      imageScore: 0,
      imageFitScore: 0,
      riskScore: 0,
      riskForceReview: false,
      policyViolations: ['MISSING_IMAGES'],
      keywordHardReject: false,
      keywordSoftReview: false,
    });
    expect(d.decision).toBe('REJECTED');
  });

  it('sends borderline to under review', () => {
    const d = decideFromScores({
      imageScore: 50,
      imageFitScore: 48,
      riskScore: 10,
      riskForceReview: false,
      policyViolations: [],
      keywordHardReject: false,
      keywordSoftReview: false,
    });
    expect(d.decision).toBe('UNDER_REVIEW');
  });

  it('passes clean low-risk listings', () => {
    const d = decideFromScores({
      imageScore: 80,
      imageFitScore: 70,
      riskScore: 5,
      riskForceReview: false,
      policyViolations: [],
      keywordHardReject: false,
      keywordSoftReview: false,
    });
    expect(d.decision).toBe('PASS');
  });

  it('sends vision review signals to admin review', () => {
    const d = decideFromScores({
      imageScore: 90,
      imageFitScore: 90,
      riskScore: 0,
      riskForceReview: false,
      policyViolations: [],
      keywordHardReject: false,
      keywordSoftReview: false,
      visionNeedsReview: true,
    });
    expect(d.decision).toBe('UNDER_REVIEW');
  });

  it('keeps hard policy rejects ahead of a vision review signal', () => {
    const d = decideFromScores({
      imageScore: 0,
      imageFitScore: 0,
      riskScore: 0,
      riskForceReview: false,
      policyViolations: ['NSFW:IMAGE_NSFW_KEY'],
      keywordHardReject: true,
      keywordSoftReview: false,
      visionNeedsReview: true,
    });
    expect(d.decision).toBe('REJECTED');
  });
});
