import { BadRequestException, Injectable } from '@nestjs/common';
import type { Address, AddressKind } from '@prisma/client';
import { ADDRESS_KIND } from './address-kind';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { RoutingService } from '../routing/routing.service';
import { normalizeStreetKey } from '../routing/street-key';
import type { SaveDeliveryAddressDto } from '../users/dto/delivery-address.dto';

export type AddressDto = {
  id: string;
  kind: AddressKind;
  line1: string;
  line2: string | null;
  city: string;
  community: string;
  country: string;
  geoLat: number | null;
  geoLng: number | null;
  hasGeo: boolean;
  isDefault: boolean;
};

export type UpsertAddressInput = {
  line1: string;
  line2?: string | null;
  city: string;
  community: string;
  country?: string;
  geoLat?: number | null;
  geoLng?: number | null;
  geocodeSource?: string | null;
};

@Injectable()
export class AddressesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly routing: RoutingService,
    private readonly audit: AuditService,
  ) {}

  pickupLabel(): string {
    return 'pickup';
  }

  deliveryLabel(): string {
    return this.routing.deliveryAddressLabel();
  }

  toDto(row: Address | null): AddressDto | null {
    if (!row) return null;
    return {
      id: row.id,
      kind: row.kind,
      line1: row.line1,
      line2: row.line2,
      city: row.city,
      community: row.community,
      country: row.country,
      geoLat: row.geoLat,
      geoLng: row.geoLng,
      hasGeo: row.geoLat != null && row.geoLng != null,
      isDefault: row.isDefault,
    };
  }

  async listForUser(userId: string, kind?: AddressKind) {
    const rows = await this.prisma.address.findMany({
      where: { userId, ...(kind ? { kind } : {}) },
      orderBy: [{ kind: 'asc' }, { isDefault: 'desc' }, { label: 'asc' }],
    });
    return { addresses: rows.map((r) => this.toDto(r)!).filter(Boolean) };
  }

  async getDefault(userId: string, kind: AddressKind) {
    const row = await this.prisma.address.findFirst({
      where: { userId, kind, isDefault: true },
    });
    return row;
  }

  async upsertDefault(
    userId: string,
    kind: AddressKind,
    input: UpsertAddressInput,
    opts?: { auditAction?: string },
  ): Promise<Address> {
    const line1 = input.line1.trim();
    if (line1.length < 3) {
      throw new BadRequestException('Address line is too short');
    }
    const label =
      kind === ADDRESS_KIND.PICKUP ? this.pickupLabel() : this.deliveryLabel();
    const existing = await this.getDefault(userId, kind);

    const data = {
      kind,
      line1,
      line2: input.line2?.trim() || null,
      city: input.city.trim() || 'Lagos',
      community: input.community.trim() || input.city.trim() || 'Lagos',
      country: (input.country ?? 'NG').trim(),
      geoLat: input.geoLat ?? null,
      geoLng: input.geoLng ?? null,
      streetKey: normalizeStreetKey(line1),
      geocodeSource: input.geocodeSource ?? null,
      label,
      isDefault: true,
      private: true,
    };

    const row = existing
      ? await this.prisma.address.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.address.create({
          data: { userId, ...data },
        });

    if (opts?.auditAction) {
      await this.audit.log({
        actorUserId: userId,
        action: opts.auditAction,
        entityType: 'Address',
        entityId: row.id,
        afterJson: { kind: row.kind, city: row.city, community: row.community },
      });
    }

    return row;
  }

  async saveDeliveryFromDto(userId: string, dto: SaveDeliveryAddressDto) {
    const geocoded = await this.routing.geocodeAddress({
      line1: dto.line1,
      line2: dto.line2,
      city: dto.city,
      community: dto.community,
      country: dto.country ?? 'NG',
    });
    if (!geocoded) {
      throw new BadRequestException(
        'We could not map that address. Check the street and area, or try again later.',
      );
    }

    const row = await this.upsertDefault(
      userId,
      ADDRESS_KIND.DELIVERY,
      {
        line1: dto.line1,
        line2: dto.line2,
        city: dto.city,
        community: dto.community,
        country: dto.country ?? 'NG',
        geoLat: geocoded.lat,
        geoLng: geocoded.lng,
        geocodeSource: geocoded.source,
      },
      { auditAction: 'DELIVERY_ADDRESS_SAVED' },
    );

    return {
      deliveryAddress: this.toDto(row),
    };
  }

  /** Persist buyer delivery at checkout (coords already resolved). */
  async saveDeliveryFromCheckout(
    userId: string,
    input: {
      line1: string;
      community: string;
      city: string;
      geoLat: number;
      geoLng: number;
      country?: string;
    },
  ): Promise<void> {
    if (!Number.isFinite(input.geoLat) || !Number.isFinite(input.geoLng)) return;
    await this.upsertDefault(userId, ADDRESS_KIND.DELIVERY, {
      line1: input.line1,
      community: input.community,
      city: input.city,
      country: input.country ?? 'NG',
      geoLat: input.geoLat,
      geoLng: input.geoLng,
      geocodeSource: 'ors',
    });
  }

  /** Seller pickup text from listing publish flow. */
  async savePickupForSeller(
    sellerId: string,
    input: {
      line1: string;
      community: string;
      city: string;
      geoLat?: number | null;
      geoLng?: number | null;
    },
  ): Promise<Address> {
    const focus =
      input.geoLat != null && input.geoLng != null
        ? { lat: input.geoLat, lng: input.geoLng }
        : undefined;
    const hit = await this.routing.geocodeAddress(
      {
        line1: input.line1,
        community: input.community,
        city: input.city,
        country: 'NG',
      },
      focus,
    );
    const geoLat = hit?.lat ?? input.geoLat ?? null;
    const geoLng = hit?.lng ?? input.geoLng ?? null;
    return this.upsertDefault(sellerId, ADDRESS_KIND.PICKUP, {
      line1: input.line1,
      community: input.community,
      city: input.city,
      country: 'NG',
      geoLat,
      geoLng,
      geocodeSource: hit?.source ?? null,
    });
  }

  parseLooseDeliveryLine(deliveryAddress: string, city = 'Lagos'): {
    line1: string;
    community: string;
    city: string;
  } {
    const parts = deliveryAddress
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length === 0) {
      return { line1: deliveryAddress.trim(), community: city, city };
    }
    if (parts.length === 1) {
      return { line1: parts[0], community: city, city };
    }
    return {
      line1: parts[0],
      community: parts[parts.length - 1],
      city,
    };
  }

  formatLine(row: Pick<Address, 'line1' | 'line2' | 'community' | 'city'>): string {
    return [row.line1, row.line2, row.community, row.city]
      .filter((part): part is string => Boolean(part && part.trim()))
      .join(', ');
  }
}
