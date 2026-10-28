import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AdminRole } from '@prisma/client';
import { Reflector } from '@nestjs/core';
import { AuditService } from '../audit/audit.service';
import { AdminOnlyGuard } from '../common/guards/admin-only.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { buildKpiShape } from './admin-dashboard.service';

describe('AdminOnlyGuard', () => {
  it('rejects user without roles on /admin/dashboard with 403', async () => {
    const audit = { log: jest.fn().mockResolvedValue(null) };
    const guard = new AdminOnlyGuard(audit as unknown as AuditService);
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: 'consumer-1', roles: [] },
          path: '/api/v1/admin/dashboard/kpis',
        }),
      }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ADMIN_ONLY_DENIED' }),
    );
  });

  it('allows user with admin roles', async () => {
    const audit = { log: jest.fn() };
    const guard = new AdminOnlyGuard(audit as unknown as AuditService);
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: 'admin-1', roles: [AdminRole.OPERATIONS] },
        }),
      }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
});

describe('admin-rbac — CONTENT_MODERATOR', () => {
  function rolesGuard(required: AdminRole[]) {
    const audit = { log: jest.fn().mockResolvedValue(null) };
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(required),
    };
    return {
      guard: new RolesGuard(
        reflector as unknown as Reflector,
        audit as unknown as AuditService,
      ),
      audit,
      reflector,
    };
  }

  const cases: Array<{
    name: string;
    required: AdminRole[];
    roles: AdminRole[];
    expectOk: boolean;
  }> = [
    {
      name: '403 on /admin/orders/:id/refund',
      required: [AdminRole.FINANCE, AdminRole.SUPER_ADMIN],
      roles: [AdminRole.CONTENT_MODERATOR],
      expectOk: false,
    },
    {
      name: '403 on /admin/finance/summary',
      required: [AdminRole.FINANCE, AdminRole.SUPER_ADMIN],
      roles: [AdminRole.CONTENT_MODERATOR],
      expectOk: false,
    },
    {
      name: 'allowed on listings approve',
      required: [
        AdminRole.SUPER_ADMIN,
        AdminRole.OPERATIONS,
        AdminRole.CONTENT_MODERATOR,
      ],
      roles: [AdminRole.CONTENT_MODERATOR],
      expectOk: true,
    },
  ];

  it.each(cases)('$name', async ({ required, roles, expectOk }) => {
    const { guard, audit } = rolesGuard(required);
    const ctx = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: 'mod-1', roles },
          path: '/api/v1/admin/test',
        }),
      }),
    } as unknown as ExecutionContext;

    if (expectOk) {
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    } else {
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'RBAC_DENIED' }),
      );
    }
    expect(audit.log).toBeDefined();
    void ROLES_KEY;
  });
});

/**
 * Table-driven permission matrix — 7 roles × page/action bundles from admin-roles.ts.
 * CONTENT_MODERATOR must fail transactions/finance; RISK_FRAUD succeeds fraud; etc.
 */
describe('admin-rbac — 7-role × area matrix', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const rolesMod = require('./admin-roles') as typeof import('./admin-roles');

  const areas: Array<{ area: string; required: readonly AdminRole[] }> = [
    { area: 'dashboard', required: rolesMod.DASHBOARD },
    { area: 'users_read', required: rolesMod.USERS_READ },
    { area: 'listings_mod', required: rolesMod.LISTINGS_MOD },
    { area: 'orders_read', required: rolesMod.ORDERS_READ },
    { area: 'orders_refund', required: rolesMod.FINANCE },
    { area: 'disputes', required: rolesMod.DISPUTES },
    { area: 'verifications', required: rolesMod.VERIFICATIONS },
    { area: 'reports', required: rolesMod.REPORTS },
    { area: 'fraud', required: rolesMod.FRAUD },
    { area: 'support', required: rolesMod.SUPPORT },
    { area: 'catalog', required: rolesMod.CATALOG },
    { area: 'promotions', required: rolesMod.PROMOTIONS },
    { area: 'analytics', required: rolesMod.ANALYTICS },
    { area: 'audit', required: rolesMod.AUDIT },
    { area: 'finance', required: rolesMod.FINANCE },
  ];

  const allRoles = Object.values(AdminRole);

  function can(role: AdminRole, required: readonly AdminRole[]): boolean {
    if (role === AdminRole.SUPER_ADMIN) return true;
    return required.includes(role);
  }

  it.each(
    allRoles.flatMap((role) =>
      areas.map((a) => ({
        role,
        area: a.area,
        required: a.required,
        expectOk: can(role, a.required),
      })),
    ),
  )('$role on $area → $expectOk', async ({ role, required, expectOk }) => {
    const audit = { log: jest.fn().mockResolvedValue(null) };
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([...required]),
    };
    const guard = new RolesGuard(
      reflector as unknown as Reflector,
      audit as unknown as AuditService,
    );
    const ctx = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: `u-${role}`, roles: [role] },
          path: '/api/v1/admin/matrix',
        }),
      }),
    } as unknown as ExecutionContext;

    if (expectOk) {
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    } else {
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'RBAC_DENIED' }),
      );
    }
  });

  it('CONTENT_MODERATOR denied on Transactions (orders refund) with audit', async () => {
    const audit = { log: jest.fn().mockResolvedValue(null) };
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([...rolesMod.FINANCE]),
    };
    const guard = new RolesGuard(
      reflector as unknown as Reflector,
      audit as unknown as AuditService,
    );
    await expect(
      guard.canActivate({
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({
            user: { id: 'mod', roles: [AdminRole.CONTENT_MODERATOR] },
            path: '/api/v1/admin/orders/x/refund',
          }),
        }),
      } as unknown as ExecutionContext),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'RBAC_DENIED' }),
    );
  });
});

describe('audit — dispute resolve completeness', () => {
  it('DISPUTE_RESOLVED audit row is required for resolve()', async () => {
    const auditLog = jest.fn().mockResolvedValue({ id: 'a-d1' });
    const notify = jest.fn().mockResolvedValue({ created: [], skipped: [] });
    const psp = {
      refund: jest.fn().mockResolvedValue({
        status: 'refunded',
        providerReference: 'psp-r1',
      }),
    };
    const order = {
      id: 'o1',
      buyerId: 'b1',
      sellerId: 's1',
      totalKobo: 10_000,
      status: 'DISPUTE_HOLD',
    };
    const dispute = {
      id: 'd1',
      status: 'AWAITING_ADMIN',
      resolution: null,
      order,
    };
    const payment = {
      id: 'p1',
      reference: 'ref-1',
      status: 'SUCCESS',
    };
    const prisma = {
      dispute: {
        findUnique: jest.fn().mockResolvedValue(dispute),
        update: jest.fn().mockImplementation(async ({ data }: { data: object }) => ({
          ...dispute,
          ...data,
        })),
      },
      payment: {
        findFirst: jest.fn().mockResolvedValue(payment),
        update: jest.fn(),
      },
      refund: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      order: { update: jest.fn() },
      orderEvent: { create: jest.fn() },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          refund: { create: jest.fn() },
          payment: { update: jest.fn() },
          order: { update: jest.fn() },
          orderEvent: { create: jest.fn() },
        }),
      ),
    };
    const { DisputesService } = await import('../disputes/disputes.service');
    const service = new DisputesService(
      prisma as never,
      {} as never,
      { notify, log: jest.fn() } as never,
      { log: auditLog } as never,
      psp as never,
    );
    await service.resolve('d1', 'admin-1', {
      resolution: 'PARTIAL_REFUND',
      amountKobo: 4000,
      note: 'partial',
    });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DISPUTE_RESOLVED',
        entityType: 'Dispute',
        entityId: 'd1',
        beforeJson: expect.any(Object),
        afterJson: expect.objectContaining({ resolution: 'PARTIAL_REFUND' }),
      }),
    );
    expect(psp.refund).toHaveBeenCalled();
    expect(notify).toHaveBeenCalled();
  });
});

describe('audit — suspend user', () => {
  it('creates AuditLog on suspend', async () => {
    const auditLog = jest.fn().mockResolvedValue({ id: 'a1' });
    const notify = jest.fn().mockResolvedValue({ created: [], skipped: [] });
    const revoke = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'u1',
          status: 'ACTIVE',
        }),
        update: jest.fn().mockResolvedValue({ id: 'u1', status: 'SUSPENDED' }),
      },
      order: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn(),
      },
      orderEvent: { createMany: jest.fn() },
      listing: { findMany: jest.fn().mockResolvedValue([]) },
      cartItem: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      $executeRaw: jest.fn().mockResolvedValue(0),
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<void>) =>
        fn(prisma),
      ),
    };

    const { AdminPortalService } = await import('./admin-portal.service');
    const service = new AdminPortalService(
      prisma as never,
      { revokeAllRefreshTokens: revoke } as never,
      { log: auditLog } as never,
      { notify } as never,
      {} as never, // ModerationService
      {} as never, // PaymentProvider
    );

    await service.suspendUser(
      { id: 'admin-1', roles: [AdminRole.RISK_FRAUD] },
      'u1',
      'fraud',
      '127.0.0.1',
    );

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Account suspended',
        body: expect.stringContaining('Reason for suspension: fraud'),
      }),
    );
    expect(revoke).toHaveBeenCalledWith('u1');
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'USER_SUSPENDED',
        entityType: 'User',
        entityId: 'u1',
      }),
    );
  });
});

describe('AdminDashboardService KPI shape', () => {
  it('returns KPI shape with fixture aggregates', () => {
    const shape = buildKpiShape({
      days: 30,
      mau: 12,
      newListings: 5,
      activeListings: 40,
      transactionsCompleted: 3,
      gmvKobo: 150_000_00,
      sellThroughRate: 0.25,
      medianTimeToSaleHours: 48,
      fraudRate: 0.02,
      openDisputes: 1,
      byCommunity: [{ community: 'Lekki', listings: 10, gmvKobo: 50_000_00 }],
    });

    expect(shape).toEqual(
      expect.objectContaining({
        days: 30,
        mau: 12,
        newListings: 5,
        activeListings: 40,
        transactionsCompleted: 3,
        gmvKobo: 150_000_00,
        sellThroughRate: 0.25,
        medianTimeToSaleHours: 48,
        fraudRate: 0.02,
        openDisputes: 1,
        byCommunity: expect.any(Array),
      }),
    );
  });

  it('kpis() aggregates distinct actors without loading every row', async () => {
    const prisma = {
      listingEvent: {
        groupBy: jest.fn().mockResolvedValue([{ actorUserId: 'a' }]),
      },
      order: {
        groupBy: jest.fn().mockImplementation(({ by }: { by: string[] }) => {
          if (by[0] === 'buyerId') return [{ buyerId: 'b' }];
          return [{ sellerId: 's' }];
        }),
        findMany: jest.fn().mockResolvedValue([
          {
            totalKobo: 1100,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            completedAt: new Date('2026-01-03T00:00:00.000Z'),
            listing: { community: 'Lekki' },
          },
        ]),
      },
      message: {
        groupBy: jest.fn().mockResolvedValue([{ senderId: 'm' }]),
      },
      listing: {
        count: jest
          .fn()
          .mockResolvedValueOnce(5)
          .mockResolvedValueOnce(40)
          .mockResolvedValueOnce(8)
          .mockResolvedValueOnce(2),
        groupBy: jest
          .fn()
          .mockResolvedValue([{ community: 'Lekki', _count: { _all: 5 } }]),
      },
      dispute: { count: jest.fn().mockResolvedValue(1) },
      riskEvent: { count: jest.fn().mockResolvedValue(1) },
    };

    const { AdminDashboardService } = await import('./admin-dashboard.service');
    const service = new AdminDashboardService(prisma as never);
    const first = service.kpis(30);
    const second = service.kpis(30);
    const [result, again] = await Promise.all([first, second]);

    expect(again).toBe(result);
    expect(prisma.listing.count).toHaveBeenCalledTimes(4);
    expect(result).toEqual({
      days: 30,
      mau: 4,
      newListings: 5,
      activeListings: 40,
      transactionsCompleted: 1,
      gmvKobo: 1100,
      sellThroughRate: 0.25,
      medianTimeToSaleHours: 48,
      fraudRate: 0.2,
      openDisputes: 1,
      byCommunity: [{ community: 'Lekki', listings: 5, gmvKobo: 1100 }],
    });
  });
});
