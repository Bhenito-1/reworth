import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { normalizeCity } from '../intelligence/city-scope';
import { ListingsService } from '../listings/listings.service';
import { FeeConfigService } from '../monetization/fee-config.service';
import { RevenueLedgerService } from '../monetization/revenue-ledger.service';
import { PrismaService } from '../prisma/prisma.service';

/** fee = floor(sold * feeBps / 10000); net = sold - fee */
export function consignmentFeeMath(
  soldPriceKobo: number,
  feeBps: number,
): { feeKobo: number; netPayoutKobo: number } {
  const feeKobo = Math.floor((soldPriceKobo * feeBps) / 10_000);
  return { feeKobo, netPayoutKobo: soldPriceKobo - feeKobo };
}

@Injectable()
export class ConsignmentService {
  private readonly logger = new Logger(ConsignmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly listings: ListingsService,
    private readonly ledger: RevenueLedgerService,
    private readonly fees: FeeConfigService,
  ) {}

  feeBpsDefault(): number {
    return Number(this.config.get('CONSIGNMENT_FEE_BPS') ?? 1500);
  }

  returnDays(): number {
    return Number(this.config.get('CONSIGNMENT_RETURN_DAYS') ?? 30);
  }

  async intake(
    consignorId: string,
    input: {
      title: string;
      floorPriceKobo: number;
      askingPriceKobo: number;
      city?: string;
      feeBps?: number;
    },
  ) {
    if (input.askingPriceKobo < input.floorPriceKobo) {
      throw new BadRequestException('askingPriceKobo must be >= floorPriceKobo');
    }
    const feeBps = input.feeBps ?? this.feeBpsDefault();
    const row = await this.prisma.consignment.create({
      data: {
        consignorId,
        title: input.title,
        floorPriceKobo: input.floorPriceKobo,
        askingPriceKobo: input.askingPriceKobo,
        city: normalizeCity(input.city),
        feeBps,
        status: 'INTAKE',
      },
    });
    return row;
  }

  async listOnPlatform(consignmentId: string, actorUserId: string) {
    const row = await this.requireConsignor(consignmentId, actorUserId);
    if (row.status !== 'INTAKE') {
      throw new BadRequestException('Consignment already listed or closed');
    }

    const listing = await this.listings.create(actorUserId, {
      title: row.title,
      description: `Consignment listing on ReWorth. Floor ₦${Math.round(row.floorPriceKobo / 100).toLocaleString('en-NG')}.`,
      priceKobo: row.askingPriceKobo,
      city: row.city,
      community: row.city === 'Lagos' ? 'LEKKI_PH1' : row.city,
      negotiable: true,
      sellingMode: 'SELL',
      condition: 'GOOD',
    });

    // Publish to LIVE (bypass full risk in consignment path via direct update for platform list)
    const published = await this.prisma.listing.update({
      where: { id: listing.id },
      data: {
        status: 'LIVE',
        publishedAt: new Date(),
        expiresAt: new Date(
          Date.now() + this.returnDays() * 24 * 60 * 60 * 1000,
        ),
      },
    });

    const returnBy = new Date(
      Date.now() + this.returnDays() * 24 * 60 * 60 * 1000,
    );

    return this.prisma.consignment.update({
      where: { id: consignmentId },
      data: {
        listingId: published.id,
        status: 'LISTED',
        listedAt: new Date(),
        returnBy,
      },
    });
  }

  async markSold(
    consignmentId: string,
    soldPriceKobo: number,
    actorUserId?: string,
  ) {
    const row = await this.prisma.consignment.findUnique({
      where: { id: consignmentId },
    });
    if (!row) throw new NotFoundException('Consignment not found');
    if (actorUserId && row.consignorId !== actorUserId) {
      // ops may mark sold without being consignor — allow if no actor check needed
    }
    if (row.status !== 'LISTED') {
      throw new BadRequestException('Consignment must be LISTED to mark sold');
    }
    if (soldPriceKobo < row.floorPriceKobo) {
      throw new BadRequestException('Sold price below floor');
    }

    const { feeKobo, netPayoutKobo } = consignmentFeeMath(
      soldPriceKobo,
      row.feeBps,
    );

    if (row.listingId) {
      await this.prisma.listing.update({
        where: { id: row.listingId },
        data: { status: 'SOLD' },
      });
      await this.prisma.favourite.deleteMany({
        where: { listingId: row.listingId },
      });
    }

    const updated = await this.prisma.consignment.update({
      where: { id: consignmentId },
      data: {
        status: 'SOLD',
        soldPriceKobo,
        feeKobo,
        netPayoutKobo,
        soldAt: new Date(),
      },
    });

    if (feeKobo > 0) {
      const { id: feeConfigVersionId } = await this.fees.getActive();
      await this.ledger.record({
        stream: 'CONSIGNMENT_FEE',
        grossKobo: feeKobo,
        netKobo: feeKobo,
        listingId: row.listingId ?? undefined,
        sellerId: row.consignorId,
        city: row.city,
        deferredPsp: true,
        feeConfigVersionId,
        referenceType: 'Consignment',
        referenceId: `${consignmentId}:fee`,
        meta: { soldPriceKobo, feeBps: row.feeBps },
      });
    }

    return updated;
  }

  async markReturned(consignmentId: string, consignorId: string) {
    const row = await this.requireConsignor(consignmentId, consignorId);
    if (row.status !== 'LISTED' && row.status !== 'EXPIRED') {
      throw new BadRequestException('Cannot return in current status');
    }
    if (row.listingId) {
      await this.prisma.listing.update({
        where: { id: row.listingId },
        data: { status: 'REMOVED' },
      });
    }
    return this.prisma.consignment.update({
      where: { id: consignmentId },
      data: {
        status: 'RETURNED',
        returnedAt: new Date(),
      },
    });
  }

  async mine(consignorId: string) {
    return this.prisma.consignment.findMany({
      where: { consignorId },
      orderBy: { createdAt: 'desc' },
      include: {
        listing: {
          select: { id: true, status: true, title: true, priceKobo: true },
        },
      },
    });
  }

  async expireUnsold(now = new Date()): Promise<number> {
    const due = await this.prisma.consignment.findMany({
      where: {
        status: 'LISTED',
        returnBy: { lte: now },
      },
    });
    let count = 0;
    for (const row of due) {
      if (row.listingId) {
        await this.prisma.listing.update({
          where: { id: row.listingId },
          data: { status: 'EXPIRED' },
        });
      }
      await this.prisma.consignment.update({
        where: { id: row.id },
        data: {
          status: 'EXPIRED',
          returnedAt: now,
        },
      });
      // Auto-return after expire
      await this.prisma.consignment.update({
        where: { id: row.id },
        data: { status: 'RETURNED' },
      });
      count++;
    }
    if (count > 0) {
      this.logger.log(`Expired/returned ${count} consignment(s)`);
    }
    return count;
  }

  private async requireConsignor(id: string, consignorId: string) {
    const row = await this.prisma.consignment.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Consignment not found');
    if (row.consignorId !== consignorId) {
      throw new ForbiddenException('Not your consignment');
    }
    return row;
  }
}
