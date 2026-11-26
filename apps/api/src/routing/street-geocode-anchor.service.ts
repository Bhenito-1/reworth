import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  estimateFromStreetAnchors,
  normalizeStreetKey,
  parseHouseNumber,
  type NumberedStreetPoint,
} from './street-key';
import type { LatLng } from './openrouteservice.client';

export type StreetAnchorBundle = {
  streetKey: string;
  median: LatLng | null;
  numbered: NumberedStreetPoint[];
  sampleCount: number;
};

@Injectable()
export class StreetGeocodeAnchorService {
  constructor(private readonly prisma: PrismaService) {}

  async findAnchors(input: {
    line1: string;
    community: string;
    city: string;
  }): Promise<StreetAnchorBundle> {
    const streetKey = normalizeStreetKey(input.line1);
    if (!streetKey) {
      return {
        streetKey: '',
        median: null,
        numbered: [],
        sampleCount: 0,
      };
    }

    const community = input.community.trim();
    const city = input.city.trim() || 'Lagos';

    const rows = await this.prisma.address.findMany({
      where: {
        geoLat: { not: null },
        geoLng: { not: null },
        city: { equals: city, mode: 'insensitive' },
        community: { equals: community, mode: 'insensitive' },
        OR: [
          { streetKey },
          {
            streetKey: null,
            line1: { contains: streetKey, mode: 'insensitive' },
          },
        ],
      },
      select: {
        line1: true,
        geoLat: true,
        geoLng: true,
      },
      take: 40,
      orderBy: { id: 'desc' },
    });

    const points: NumberedStreetPoint[] = [];
    for (const row of rows) {
      if (row.geoLat == null || row.geoLng == null) continue;
      const hn = parseHouseNumber(row.line1);
      points.push({
        houseNumber: hn ?? 0,
        lat: row.geoLat,
        lng: row.geoLng,
      });
    }

    if (points.length === 0) {
      return { streetKey, median: null, numbered: [], sampleCount: 0 };
    }

    const lat = points.reduce((s, p) => s + p.lat, 0) / points.length;
    const lng = points.reduce((s, p) => s + p.lng, 0) / points.length;

    return {
      streetKey,
      median: { lat, lng },
      numbered: points.filter((p) => p.houseNumber > 0),
      sampleCount: points.length,
    };
  }

  estimateOnStreet(
    line1: string,
    bundle: StreetAnchorBundle,
    communityCentroid?: LatLng | null,
  ): LatLng | null {
    if (bundle.sampleCount === 0) return null;
    const targetHouse = parseHouseNumber(line1);
    if (bundle.numbered.length > 0) {
      return estimateFromStreetAnchors(
        targetHouse,
        bundle.numbered,
        communityCentroid,
      );
    }
    return bundle.median;
  }
}