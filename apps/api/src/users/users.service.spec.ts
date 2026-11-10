import { UsersService } from './users.service';

describe('UsersService profile privacy', () => {
  it('hides fullName when showFullName is false', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'u1',
          memberReference: 'RW-MBR-TESTUSER01',
          phone: '+2348012345678',
          email: null,
          status: 'ACTIVE',
          riskLevel: 'LOW',
          riskScore: 0,
          enhancedVerificationRequired: false,
          phoneVerifiedAt: new Date(),
          emailVerifiedAt: null,
          createdAt: new Date(),
          profile: {
            displayName: 'Ada',
            fullName: 'Ada Lovelace',
            avatarUrl: null,
            bio: null,
            birthYear: 1990,
            preferredCommunity: 'Lekki',
            language: 'en-NG',
            currency: 'NGN',
            showFullName: false,
          },
          verifications: [],
          roles: [],
        }),
      },
    };
    const audit = { log: jest.fn() };
    const service = new UsersService(prisma as never, audit as never);
    const me = await service.getMe('u1');
    expect(me.profile?.fullName).toBeNull();
    expect(me.profile?.showFullName).toBe(false);
    expect(me.profile?.displayName).toBe('Ada');
  });

  it('exposes fullName when showFullName is true', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'u1',
          memberReference: 'RW-MBR-TESTUSER02',
          phone: null,
          email: 'a@b.com',
          status: 'ACTIVE',
          riskLevel: 'LOW',
          riskScore: 0,
          enhancedVerificationRequired: false,
          phoneVerifiedAt: null,
          emailVerifiedAt: new Date(),
          createdAt: new Date(),
          profile: {
            displayName: 'Ada',
            fullName: 'Ada Lovelace',
            avatarUrl: null,
            bio: null,
            birthYear: null,
            preferredCommunity: '',
            language: 'en-NG',
            currency: 'NGN',
            showFullName: true,
          },
          verifications: [],
          roles: [],
        }),
      },
    };
    const service = new UsersService(prisma as never, { log: jest.fn() } as never);
    const me = await service.getMe('u1');
    expect(me.profile?.fullName).toBe('Ada Lovelace');
  });
});
