import { ModerationService } from './moderation.service';
import { MockImageModerationProvider } from './mock-image-moderation.provider';

const SAMPLE_KEYWORDS = [
  { pattern: 'ak-47', category: 'weapons' },
  { pattern: 'glock', category: 'weapons' },
  { pattern: 'ammunition', category: 'weapons' },
  { pattern: 'cocaine', category: 'drugs' },
  { pattern: 'heroin', category: 'drugs' },
  { pattern: 'weed for sale', category: 'drugs' },
  { pattern: 'stolen iphone', category: 'stolen' },
  { pattern: 'hot laptop', category: 'stolen' },
  { pattern: 'ivory', category: 'wildlife' },
  { pattern: 'pangolin', category: 'wildlife' },
  { pattern: 'replica louis', category: 'counterfeit' },
  { pattern: 'fake rolex', category: 'counterfeit' },
  { pattern: 'nsfw', category: 'adult' },
  { pattern: 'xxx video', category: 'adult' },
  { pattern: 'cigarette carton', category: 'tobacco' },
  { pattern: 'tobacco wholesale', category: 'tobacco' },
  { pattern: 'whiskey crate', category: 'alcohol' },
  { pattern: 'beer pallet', category: 'alcohol' },
  { pattern: 'bitcoin wallet sell', category: 'financial_instruments' },
  { pattern: 'gift card dump', category: 'financial_instruments' },
  { pattern: 'organ for sale', category: 'body_parts' },
  { pattern: 'blood plasma sell', category: 'body_parts' },
];

const unusedVision = { analyzeListing: jest.fn() } as never;

describe('ModerationService keyword scan', () => {
  const service = new ModerationService(
    {} as never,
    {} as never,
    new MockImageModerationProvider(),
    unusedVision,
  );

  it.each(SAMPLE_KEYWORDS)(
    'matches $category pattern "$pattern"',
    ({ pattern, category }) => {
      const hits = service.matchKeywords(`Selling ${pattern} today`, [
        { pattern, category },
      ]);
      expect(hits).toHaveLength(1);
      expect(hits[0].category).toBe(category);
    },
  );

  it('does not match clean furniture copy', () => {
    const hits = service.matchKeywords(
      'Gently used sofa in Lekki Phase 1',
      SAMPLE_KEYWORDS,
    );
    expect(hits).toHaveLength(0);
  });

  it('is case-insensitive', () => {
    const hits = service.matchKeywords('AK-47 rifle', SAMPLE_KEYWORDS);
    expect(hits.some((h) => h.pattern === 'ak-47')).toBe(true);
  });

  it('matches multiple prohibited terms', () => {
    const hits = service.matchKeywords(
      'stolen iphone and fake rolex',
      SAMPLE_KEYWORDS,
    );
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });
});

describe('MockImageModerationProvider', () => {
  const provider = new MockImageModerationProvider();

  it.each([
    'uploads/user/nsfw-photo.jpg',
    'media/NSFW_thumb.webp',
    'listings/abc/nsfw_variant.png',
    'path/with-nsfw-in-middle.jpg',
    'nsfw',
  ])('flags NSFW key %s', async (key) => {
    const result = await provider.scan({
      listingId: 'l1',
      imageKeys: [key],
    });
    expect(result.nsfw).toBe(true);
    expect(result.reasons).toContain('IMAGE_NSFW_KEY');
  });

  it('passes clean image keys', async () => {
    const result = await provider.scan({
      listingId: 'l1',
      imageKeys: ['uploads/sofa-front.jpg', 'uploads/sofa-side.jpg'],
    });
    expect(result.nsfw).toBe(false);
  });

  it('flags NSFW meta flag', async () => {
    const result = await provider.scan({
      listingId: 'l1',
      imageKeys: ['clean.jpg'],
      metaFlags: ['nsfw'],
    });
    expect(result.nsfw).toBe(true);
    expect(result.reasons).toContain('IMAGE_NSFW_META');
  });
});

describe('ModerationService edge cases', () => {
  const service = new ModerationService(
    {} as never,
    {} as never,
    new MockImageModerationProvider(),
    unusedVision,
  );

  it('ignores partial word that is not the seeded pattern', () => {
    const hits = service.matchKeywords('I like headphones', [
      { pattern: 'ak-47', category: 'weapons' },
    ]);
    expect(hits).toHaveLength(0);
  });

  it('matches pattern inside longer sentence', () => {
    const hits = service.matchKeywords(
      'Brand new cocaine for party weekend',
      [{ pattern: 'cocaine', category: 'drugs' }],
    );
    expect(hits).toHaveLength(1);
  });

  it('handles empty blob', () => {
    expect(service.matchKeywords('', SAMPLE_KEYWORDS)).toHaveLength(0);
  });
});

function readyListing(overrides?: {
  images?: Array<{
    originalKey: string;
    status: string;
    variants: unknown;
    sortOrder: number;
  }>;
}) {
  return {
    id: 'l1',
    sellerId: 'seller-1',
    title: 'Image of sunglasses',
    description: 'Dark sunglasses, lightly used',
    brand: null,
    category: { name: 'Accessories', slug: 'accessories' },
    subcategory: null,
    images: overrides?.images ?? [
      {
        originalKey: 'uploads/sunglasses-b.jpg',
        status: 'READY',
        variants: { original: 'https://cdn.example/b.jpg' },
        sortOrder: 1,
      },
      {
        originalKey: 'uploads/sunglasses-a.jpg',
        status: 'READY',
        variants: { original: 'https://cdn.example/a.jpg' },
        sortOrder: 0,
      },
      {
        originalKey: 'uploads/sunglasses-pending.jpg',
        status: 'PENDING',
        variants: {},
        sortOrder: 2,
      },
    ],
  };
}

function visionEvidence(overrides: Record<string, unknown>) {
  return {
    provider: 'roboflow',
    workflowId: 'reworth-image-title-check-1790810818816',
    status: 'ok',
    match: true,
    needsReview: false,
    confidence: 0.91,
    decision: 'match',
    lowConfidence: false,
    reason: 'The image shows sunglasses.',
    labels: ['sunglasses'],
    signals: ['VISION_TITLE_MATCH'],
    evidence: [],
    ...overrides,
  };
}

describe('ModerationService vision review signal', () => {
  function harness(listing = readyListing()) {
    const prisma = {
      listing: {
        findUnique: jest.fn().mockResolvedValue(listing),
        update: jest.fn().mockResolvedValue({}),
      },
      moderationKeyword: { findMany: jest.fn().mockResolvedValue([]) },
      moderationDecision: { create: jest.fn().mockResolvedValue({ id: 'd1' }) },
      listingModeration: { create: jest.fn().mockResolvedValue({ id: 'm1' }) },
    };
    const vision = { analyzeListing: jest.fn() };
    const notifications = { notify: jest.fn() };
    const service = new ModerationService(
      prisma as never,
      notifications as never,
      new MockImageModerationProvider(),
      vision as never,
    );
    return { service, prisma, vision };
  }

  it('sends a title mismatch to admin review instead of rejecting', async () => {
    const { service, prisma, vision } = harness();
    vision.analyzeListing.mockResolvedValue(
      visionEvidence({
        match: false,
        needsReview: true,
        confidence: 0.08,
        decision: 'mismatch',
        reason: 'The image shows books and globes, not sunglasses.',
        signals: ['VISION_TITLE_MISMATCH', 'VISION_NEEDS_REVIEW'],
        evidence: [{ providerReject: true }],
      }),
    );

    const result = await service.evaluateOnPublish('l1');

    expect(result.outcome).toBe('UNDER_REVIEW');
    expect(result.visionNeedsReview).toBe(true);
    expect(result.signals).toEqual(
      expect.arrayContaining(['VISION_TITLE_MISMATCH', 'VISION_NEEDS_REVIEW']),
    );
    expect(result.detail.vision).toEqual(
      expect.objectContaining({ match: false, needsReview: true }),
    );
    expect(prisma.listing.update).not.toHaveBeenCalled();
    expect(vision.analyzeListing).toHaveBeenCalledWith(
      expect.objectContaining({
        listingId: 'l1',
        title: 'Image of sunglasses',
        description: 'Dark sunglasses, lightly used',
        images: [
          expect.objectContaining({
            key: 'uploads/sunglasses-a.jpg',
            url: 'https://cdn.example/a.jpg',
          }),
          expect.objectContaining({ key: 'uploads/sunglasses-b.jpg' }),
        ],
      }),
    );
    const called = vision.analyzeListing.mock.calls[0][0] as {
      images: Array<{ key: string }>;
    };
    expect(called.images.map((image) => image.key)).not.toContain(
      'uploads/sunglasses-pending.jpg',
    );
  });

  it('keeps a confident vision match on the existing pass path', async () => {
    const { service, vision } = harness();
    vision.analyzeListing.mockResolvedValue(visionEvidence({}));

    const result = await service.evaluateOnPublish('l1');

    expect(result.outcome).toBe('PASS');
    expect(result.visionNeedsReview).toBe(false);
  });

  it('does not approve when the vision check could not run', async () => {
    const { service, prisma, vision } = harness();
    vision.analyzeListing.mockResolvedValue(
      visionEvidence({
        status: 'error',
        match: false,
        needsReview: true,
        confidence: null,
        decision: 'unavailable',
        reason: 'Roboflow image-title check is unavailable',
        labels: [],
        signals: ['VISION_CHECK_FAILED:UNAVAILABLE', 'VISION_NEEDS_REVIEW'],
        error: {
          code: 'UNAVAILABLE',
          message: 'Roboflow image-title check is unavailable',
        },
      }),
    );

    const result = await service.evaluateOnPublish('l1');

    expect(result.outcome).toBe('UNDER_REVIEW');
    expect(result.visionNeedsReview).toBe(true);
    expect(prisma.listing.update).not.toHaveBeenCalled();
  });

  it('still hard-rejects NSFW when vision only asks for review', async () => {
    const { service, prisma, vision } = harness(
      readyListing({
        images: [
          {
            originalKey: 'uploads/nsfw-photo.jpg',
            status: 'READY',
            variants: {},
            sortOrder: 0,
          },
          {
            originalKey: 'uploads/nsfw-side.jpg',
            status: 'READY',
            variants: {},
            sortOrder: 1,
          },
        ],
      }),
    );
    vision.analyzeListing.mockResolvedValue(
      visionEvidence({
        match: false,
        needsReview: true,
        decision: 'uncertain',
        signals: ['VISION_NEEDS_REVIEW'],
      }),
    );

    const result = await service.evaluateOnPublish('l1');

    expect(result.outcome).toBe('REJECTED');
    expect(prisma.listing.update).toHaveBeenCalled();
  });
});
