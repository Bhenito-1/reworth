import {
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_FEE_RATES,
  type FeeRates,
  parseFeeRates,
} from './fee-rates';

@Injectable()
export class FeeConfigService implements OnModuleInit {
  private readonly logger = new Logger(FeeConfigService.name);
  private cached: { id: string; version: number; rates: FeeRates } | null =
    null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit() {
    const maxAttempts = 15;
    const delayMs = 1000;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.ensureDefault();
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const retryable =
          message.includes('recovery mode') ||
          message.includes("Can't reach database server");
        if (!retryable || attempt === maxAttempts) {
          throw err;
        }
        this.logger.warn(
          `Fee config init failed (attempt ${attempt}/${maxAttempts}): ${message}; retrying in ${delayMs}ms`,
        );
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  async ensureDefault() {
    const existing = await this.prisma.feeConfigVersion.findFirst({
      orderBy: { version: 'desc' },
    });
    if (existing) {
      this.cached = {
        id: existing.id,
        version: existing.version,
        rates: parseFeeRates(existing.rates),
      };
      return this.cached;
    }
    const created = await this.prisma.feeConfigVersion.create({
      data: {
        version: 1,
        rates: DEFAULT_FEE_RATES as unknown as Prisma.InputJsonValue,
        note: 'Phase 3.3 default fee schedule',
      },
    });
    this.cached = {
      id: created.id,
      version: 1,
      rates: DEFAULT_FEE_RATES,
    };
    this.logger.log('Seeded FeeConfigVersion v1');
    return this.cached;
  }

  async getActive(): Promise<{
    id: string;
    version: number;
    rates: FeeRates;
  }> {
    if (this.cached) return this.cached;
    return this.ensureDefault();
  }

  async getById(id: string) {
    const row = await this.prisma.feeConfigVersion.findUnique({
      where: { id },
    });
    if (!row) return null;
    return {
      id: row.id,
      version: row.version,
      rates: parseFeeRates(row.rates),
    };
  }

  async publishNew(
    actorUserId: string,
    rates: Partial<FeeRates>,
    note?: string,
  ) {
    const current = await this.getActive();
    const nextRates: FeeRates = {
      ...current.rates,
      ...rates,
      boost: { ...current.rates.boost, ...(rates.boost ?? {}) },
      featured: { ...current.rates.featured, ...(rates.featured ?? {}) },
      promoted: { ...current.rates.promoted, ...(rates.promoted ?? {}) },
      sellerPlus: { ...current.rates.sellerPlus, ...(rates.sellerPlus ?? {}) },
      sellerStarter: {
        ...current.rates.sellerStarter,
        ...(rates.sellerStarter ?? {}),
      },
    };
    const created = await this.prisma.feeConfigVersion.create({
      data: {
        version: current.version + 1,
        rates: nextRates as unknown as Prisma.InputJsonValue,
        createdById: actorUserId,
        note: note ?? null,
      },
    });
    this.cached = {
      id: created.id,
      version: created.version,
      rates: nextRates,
    };
    await this.audit.log({
      actorUserId,
      actorRole: 'ADMIN',
      action: 'FEE_CONFIG_PUBLISHED',
      entityType: 'FeeConfigVersion',
      entityId: created.id,
      afterJson: { version: created.version, note },
    });
    return this.cached;
  }

  async listVersions(take = 20) {
    return this.prisma.feeConfigVersion.findMany({
      orderBy: { version: 'desc' },
      take,
    });
  }
}
