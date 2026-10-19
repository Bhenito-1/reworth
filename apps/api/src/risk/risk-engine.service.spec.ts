import {
  DEFAULT_THRESHOLDS,
  firesDeviceFingerprint,
  firesLocationJump,
  firesLowPrice,
  firesOffPlatformChat,
  firesRapidListing,
  firesRepeatedCancel,
  firesReportedUser,
  firesSuspiciousPayment,
  levelFromScore,
  riskScoreAfterApproval,
  sumFiredWeights,
  type FiredRule,
} from './risk-rules.table';

describe('risk-rules.table', () => {
  describe('DUPLICATE_IMAGE / LOW_PRICE helpers', () => {
    it('fires LOW_PRICE when price < 30% of estimate', () => {
      expect(firesLowPrice(50_000_00, 280_000_00)).toBe(true);
      expect(firesLowPrice(100_000_00, 280_000_00)).toBe(false);
      expect(firesLowPrice(10_000, 0)).toBe(false);
    });
  });

  describe('RAPID_LISTING', () => {
    it('fires when >5 listings in last hour', () => {
      expect(firesRapidListing(5)).toBe(false);
      expect(firesRapidListing(6)).toBe(true);
    });
  });

  describe('REPORTED_USER', () => {
    it('fires on open reports or ≥2 in 30d', () => {
      expect(firesReportedUser({ openReports: 1, reportsLast30d: 0 })).toBe(true);
      expect(firesReportedUser({ openReports: 0, reportsLast30d: 2 })).toBe(true);
      expect(firesReportedUser({ openReports: 0, reportsLast30d: 1 })).toBe(false);
    });
  });

  describe('DEVICE_FINGERPRINT', () => {
    it('fires when ≥3 distinct users share device', () => {
      expect(firesDeviceFingerprint(2)).toBe(false);
      expect(firesDeviceFingerprint(3)).toBe(true);
    });
  });

  describe('REPEATED_CANCEL', () => {
    it('fires when cancelled ≥3 in 30d', () => {
      expect(firesRepeatedCancel(2)).toBe(false);
      expect(firesRepeatedCancel(3)).toBe(true);
    });
  });

  describe('SUSPICIOUS_PAYMENT', () => {
    it('fires for new device + high amount', () => {
      expect(
        firesSuspiciousPayment({
          deviceAgeMs: 60 * 60 * 1000,
          amountKobo: 50_000_001,
        }),
      ).toBe(true);
      expect(
        firesSuspiciousPayment({
          deviceAgeMs: 60 * 60 * 1000,
          amountKobo: 1_000_00,
        }),
      ).toBe(false);
      expect(
        firesSuspiciousPayment({
          deviceAgeMs: 48 * 60 * 60 * 1000,
          amountKobo: 50_000_001,
        }),
      ).toBe(false);
      expect(
        firesSuspiciousPayment({
          deviceAgeMs: null,
          amountKobo: 50_000_001,
          hasChargebackFlag: true,
        }),
      ).toBe(true);
    });
  });

  describe('OFF_PLATFORM_CHAT', () => {
    it('fires when CHAT_SCAN_ events exist', () => {
      expect(firesOffPlatformChat(0)).toBe(false);
      expect(firesOffPlatformChat(1)).toBe(true);
    });
  });

  describe('LOCATION_JUMP', () => {
    it('fires when communities differ and both set', () => {
      expect(
        firesLocationJump({
          listingCommunity: 'Lekki',
          preferredCommunity: 'Ikoyi',
        }),
      ).toBe(true);
      expect(
        firesLocationJump({
          listingCommunity: 'Lekki',
          preferredCommunity: 'lekki',
        }),
      ).toBe(false);
      expect(
        firesLocationJump({
          listingCommunity: 'Lekki',
          preferredCommunity: '',
        }),
      ).toBe(false);
    });
  });

  describe('scoring', () => {
    it('maps thresholds LOW / MEDIUM / HIGH', () => {
      expect(levelFromScore(0, DEFAULT_THRESHOLDS)).toBe('LOW');
      expect(levelFromScore(39, DEFAULT_THRESHOLDS)).toBe('LOW');
      expect(levelFromScore(40, DEFAULT_THRESHOLDS)).toBe('MEDIUM');
      expect(levelFromScore(69, DEFAULT_THRESHOLDS)).toBe('MEDIUM');
      expect(levelFromScore(70, DEFAULT_THRESHOLDS)).toBe('HIGH');
    });

    it('an approval lowers a score of 50 below the review line', () => {
      const next = riskScoreAfterApproval(50);
      expect(next).toBe(30);
      expect(levelFromScore(next)).toBe('LOW');
      expect(riskScoreAfterApproval(0)).toBe(0);
      expect(riskScoreAfterApproval(15)).toBe(0);
    });

    it('synthetic bad actor (rapid+low price+duplicate) → HIGH', () => {
      const fired: FiredRule[] = [
        { code: 'DUPLICATE_IMAGE', weight: 30, detail: {} },
        { code: 'LOW_PRICE', weight: 25, detail: {} },
        { code: 'RAPID_LISTING', weight: 20, detail: {} },
      ];
      const score = sumFiredWeights(fired);
      expect(score).toBe(75);
      expect(levelFromScore(score)).toBe('HIGH');
    });
  });
});

describe('RiskEngineService.evaluateOnPublish', () => {
  it('HIGH score → forceUnderReview, enhancedVerification, events + assessment', async () => {
    const riskAssessmentCreate = jest.fn().mockResolvedValue({ id: 'ra1' });
    const riskEventCreate = jest.fn().mockResolvedValue({ id: 're1' });
    const userUpdate = jest.fn().mockResolvedValue({});
    const listingUpdate = jest.fn().mockResolvedValue({});
    const supportCreate = jest.fn().mockResolvedValue({ id: 't1' });
    const notify = jest.fn().mockResolvedValue({ created: [], skipped: [] });

    const prisma = {
      listing: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'l1',
          sellerId: 's1',
          priceKobo: 50_000_00,
          community: 'Lekki',
          images: [{ id: 'i1', originalKey: 'a.jpg' }],
          category: { slug: 'electronics' },
          subcategory: null,
          seller: {
            profile: { preferredCommunity: 'Lekki' },
            devices: [],
          },
        }),
        update: listingUpdate,
        count: jest.fn().mockResolvedValue(6),
      },
      riskRule: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      riskAssessment: { create: riskAssessmentCreate },
      riskEvent: {
        create: riskEventCreate,
        count: jest.fn().mockResolvedValue(0),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 's1',
          riskLevel: 'LOW',
          riskScore: 0,
        }),
        update: userUpdate,
      },
      report: {
        count: jest.fn().mockResolvedValue(0),
      },
      order: { count: jest.fn().mockResolvedValue(0) },
      device: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      supportTicket: { create: supportCreate },
    };

    const fraud = {
      evaluateListing: jest.fn().mockResolvedValue({
        flags: ['DUPLICATE_IMAGE'],
        riskEvents: [{ kind: 'DUPLICATE_IMAGE', detail: { hash: 'x' } }],
      }),
      estimateLowKobo: jest.fn().mockReturnValue(280_000_00),
    };

    const { RiskEngineService } = await import('./risk-engine.service');
    const service = new RiskEngineService(
      prisma as never,
      fraud as never,
      { notify } as never,
    );

    const result = await service.evaluateOnPublish('l1', 's1');

    expect(result.level).toBe('HIGH');
    expect(result.forceUnderReview).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.rulesFired.map((r) => r.code)).toEqual(
      expect.arrayContaining([
        'DUPLICATE_IMAGE',
        'LOW_PRICE',
        'RAPID_LISTING',
      ]),
    );
    expect(riskAssessmentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          level: 'HIGH',
          listingId: 'l1',
          userId: 's1',
        }),
      }),
    );
    expect(riskEventCreate).toHaveBeenCalled();
    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          riskLevel: 'HIGH',
          enhancedVerificationRequired: true,
        }),
      }),
    );
    expect(listingUpdate).toHaveBeenCalled();
    expect(notify).toHaveBeenCalled();
  });
});
