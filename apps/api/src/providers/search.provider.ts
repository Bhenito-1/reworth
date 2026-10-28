import type { PublicListingDto } from '../listings/public-listing.mapper';
import { toPublicListing } from '../listings/public-listing.mapper';
import type { PrismaService } from '../prisma/prisma.service';

export type SearchFilters = {
  q?: string;
  categoryId?: string;
  subcategoryId?: string;
  priceMinKobo?: number;
  priceMaxKobo?: number;
  condition?: string;
  community?: string;
  communityId?: string;
  /** City scope (default Lagos) */
  city?: string;
  /** 2 | 5 | 10 | 25 | undefined = all Lagos */
  radiusKm?: number;
  lat?: number;
  lng?: number;
  verifiedOnly?: boolean;
  deliveryAvailable?: boolean;
  listedAfter?: string;
  sort?: 'newest' | 'price_asc' | 'price_desc' | 'distance';
  cursor?: string;
  limit?: number;
  /** Optional viewer for community visibility gating */
  viewerId?: string | null;
  /** Precomputed Prisma visibility fragment */
  visibilityWhere?: Record<string, unknown>;
};

export type SearchFacets = {
  categories: Array<{ id: string; slug: string; name: string; count: number }>;
  conditions: Array<{ value: string; count: number }>;
  communities: Array<{ value: string; count: number }>;
};

export type SearchProviderResult = {
  items: PublicListingDto[];
  nextCursor?: string;
  facets: SearchFacets;
  tookMs: number;
  total: number;
};

/** Full-text / geo search abstraction (Postgres FTS + OpenSearch). */
export interface SearchProvider {
  readonly name: string;
  search(filters: SearchFilters): Promise<SearchProviderResult>;
  indexDocument?(doc: {
    id: string;
    title: string;
    body: string;
    community?: string;
    categoryId?: string;
    priceKobo?: number;
    geoLat?: number;
    geoLng?: number;
  }): Promise<void>;
}

export const SEARCH_PROVIDER = Symbol('SEARCH_PROVIDER');

const listingInclude = {
  category: true,
  subcategory: true,
  images: { orderBy: { sortOrder: 'asc' as const } },
  estateCommunity: true,
  movingSale: true,
  seller: {
    include: {
      profile: true,
      verifications: true,
    },
  },
} as const;

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function encodeSearchCursor(createdAt: Date, id: string): string {
  return `${createdAt.toISOString()}_${id}`;
}

export function decodeSearchCursor(
  cursor: string,
): { createdAt: Date; id: string } | null {
  const idx = cursor.lastIndexOf('_');
  if (idx <= 0) return null;
  const iso = cursor.slice(0, idx);
  const id = cursor.slice(idx + 1);
  const createdAt = new Date(iso);
  if (Number.isNaN(createdAt.getTime()) || !id) return null;
  return { createdAt, id };
}

type ListingRow = {
  id: string;
  title: string;
  description: string;
  brand: string | null;
  model: string | null;
  condition: string;
  priceKobo: number;
  negotiable: boolean;
  sellingMode: string;
  status: string;
  community: string;
  geoLat: number | null;
  geoLng: number | null;
  fulfilmentPickup: boolean;
  fulfilmentMeet: boolean;
  fulfilmentDelivery: boolean;
  createdAt: Date;
  publishedAt: Date | null;
  vehicle: unknown;
  addressPrivate?: string | null;
  categoryId?: string | null;
  category?: { id: string; slug: string; name: string } | null;
  images?: Array<{
    id: string;
    sortOrder: number;
    variants: unknown;
    width: number | null;
    height: number | null;
    status?: string;
  }>;
  seller?: {
    id: string;
    phone?: string | null;
    email?: string | null;
    profile?: { displayName: string } | null;
    verifications?: Array<{ level: string; status: string }>;
  };
};

function isVerifiedSeller(listing: ListingRow): boolean {
  return Boolean(
    listing.seller?.verifications?.some(
      (v) => v.level === 'L3_IDENTITY' && v.status === 'VERIFIED',
    ),
  );
}

function matchesKeyword(listing: ListingRow, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = [
    listing.title,
    listing.description,
    listing.brand ?? '',
    listing.model ?? '',
    listing.category?.name ?? '',
    listing.category?.slug ?? '',
  ]
    .join(' ')
    .toLowerCase();
  return needle.split(/\s+/).every((token) => hay.includes(token));
}

function buildFacets(rows: ListingRow[]): SearchFacets {
  const catMap = new Map<
    string,
    { id: string; slug: string; name: string; count: number }
  >();
  const condMap = new Map<string, number>();
  const commMap = new Map<string, number>();

  for (const row of rows) {
    if (row.category) {
      const prev = catMap.get(row.category.id);
      if (prev) prev.count += 1;
      else
        catMap.set(row.category.id, {
          id: row.category.id,
          slug: row.category.slug,
          name: row.category.name,
          count: 1,
        });
    }
    condMap.set(row.condition, (condMap.get(row.condition) ?? 0) + 1);
    if (row.community) {
      commMap.set(row.community, (commMap.get(row.community) ?? 0) + 1);
    }
  }

  return {
    categories: [...catMap.values()].sort((a, b) => b.count - a.count),
    conditions: [...condMap.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count),
    communities: [...commMap.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count),
  };
}

/**
 * Postgres-backed discovery search (ILIKE / in-memory FTS-style match).
 * Query-time filtering — no generated tsvector column required.
 */
export class PostgresFullTextSearchProvider implements SearchProvider {
  readonly name = 'postgres-fts';

  constructor(private readonly prisma: PrismaService) {}

  async search(filters: SearchFilters): Promise<SearchProviderResult> {
    const started = Date.now();
    const limit = Math.min(Math.max(filters.limit ?? 20, 1), 50);

    const where: Record<string, unknown> = {
      status: 'LIVE',
      quantityAvailable: { gt: 0 },
      NOT: { riskFlags: { has: 'swap-response' } },
      seller: { status: 'ACTIVE' },
    };

    if (filters.visibilityWhere) {
      where.AND = [filters.visibilityWhere];
    }

    if (filters.categoryId) where.categoryId = filters.categoryId;
    if (filters.subcategoryId) where.subcategoryId = filters.subcategoryId;
    if (filters.condition) where.condition = filters.condition;
    if (filters.communityId) where.communityId = filters.communityId;
    if (filters.city) where.city = filters.city;
    if (filters.deliveryAvailable) where.fulfilmentDelivery = true;
    const priceMin = filters.priceMinKobo;
    const priceMax = filters.priceMaxKobo;
    if (priceMin != null || priceMax != null) {
      where.priceKobo = {
        ...(priceMin != null ? { gte: priceMin } : {}),
        ...(priceMax != null ? { lte: priceMax } : {}),
      };
    }
    if (filters.community) {
      where.community = {
        equals: filters.community,
        mode: 'insensitive',
      };
    }
    if (filters.listedAfter) {
      where.publishedAt = { gte: new Date(filters.listedAfter) };
    }
    if (filters.q?.trim()) {
      const q = filters.q.trim();
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { brand: { contains: q, mode: 'insensitive' } },
        { model: { contains: q, mode: 'insensitive' } },
      ];
    }

    const rows = (await this.prisma.listing.findMany({
      where,
      include: listingInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 500,
    })) as unknown as ListingRow[];

    let filtered = rows.filter((row) => {
      if (filters.q && !matchesKeyword(row, filters.q)) return false;
      if (filters.verifiedOnly && !isVerifiedSeller(row)) return false;
      return true;
    });

    const withDistance = filtered.map((row) => {
      let distanceKm: number | null = null;
      if (
        filters.lat != null &&
        filters.lng != null &&
        row.geoLat != null &&
        row.geoLng != null
      ) {
        distanceKm = haversineKm(
          filters.lat,
          filters.lng,
          row.geoLat,
          row.geoLng,
        );
      }
      return { row, distanceKm };
    });

    let geoFiltered = withDistance;
    if (
      filters.radiusKm != null &&
      filters.lat != null &&
      filters.lng != null
    ) {
      geoFiltered = withDistance.filter(
        (x) => x.distanceKm != null && x.distanceKm <= filters.radiusKm!,
      );
    }

    const sort = filters.sort ?? (filters.lat != null ? 'distance' : 'newest');
    geoFiltered.sort((a, b) => {
      if (sort === 'price_asc') return a.row.priceKobo - b.row.priceKobo;
      if (sort === 'price_desc') return b.row.priceKobo - a.row.priceKobo;
      if (sort === 'distance') {
        const da = a.distanceKm ?? Number.POSITIVE_INFINITY;
        const db = b.distanceKm ?? Number.POSITIVE_INFINITY;
        if (da !== db) return da - db;
        return b.row.createdAt.getTime() - a.row.createdAt.getTime();
      }
      // newest
      const t = b.row.createdAt.getTime() - a.row.createdAt.getTime();
      if (t !== 0) return t;
      return b.row.id.localeCompare(a.row.id);
    });

    const facets = buildFacets(geoFiltered.map((x) => x.row));

    let startIdx = 0;
    if (filters.cursor) {
      const decoded = decodeSearchCursor(filters.cursor);
      if (decoded) {
        const found = geoFiltered.findIndex(
          (x) =>
            x.row.createdAt.getTime() === decoded.createdAt.getTime() &&
            x.row.id === decoded.id,
        );
        startIdx = found >= 0 ? found + 1 : 0;
      }
    }

    const page = geoFiltered.slice(startIdx, startIdx + limit);
    const items = page.map(({ row }) =>
      toPublicListing(row, {
        viewerLat: filters.lat,
        viewerLng: filters.lng,
      }),
    );

    const last = page[page.length - 1];
    const nextCursor =
      page.length === limit && last
        ? encodeSearchCursor(last.row.createdAt, last.row.id)
        : undefined;

    return {
      items,
      nextCursor,
      facets,
      tookMs: Date.now() - started,
      total: geoFiltered.length,
    };
  }
}

/**
 * OpenSearch adapter stub — delegates to Postgres when fallback is enabled,
 * otherwise throws until OpenSearch wiring lands.
 */
export class OpenSearchSearchProvider implements SearchProvider {
  readonly name = 'opensearch';

  constructor(
    private readonly fallback: PostgresFullTextSearchProvider,
    private readonly useFallback: boolean,
  ) {}

  async search(filters: SearchFilters): Promise<SearchProviderResult> {
    if (this.useFallback) {
      return this.fallback.search(filters);
    }
    throw new Error(
      'OpenSearch is not configured. Set SEARCH_USE_POSTGRES_FTS_FALLBACK=true or SEARCH_PROVIDER=postgres.',
    );
  }

  async indexDocument(): Promise<void> {
    // no-op stub until OpenSearch client is wired
  }
}

/** @deprecated Phase 0 stub — prefer PostgresFullTextSearchProvider */
export type SearchHit = {
  id: string;
  score: number;
  title: string;
  snippet?: string;
};

/** @deprecated */
export type SearchQuery = {
  q: string;
  community?: string;
  limit?: number;
  offset?: number;
};

/** @deprecated */
export type SearchResult = {
  total: number;
  hits: SearchHit[];
};

/** @deprecated in-memory stub kept for any legacy callers */
export class PostgresFtsStub implements SearchProvider {
  readonly name = 'postgres-fts-stub';
  private readonly docs: Array<{
    id: string;
    title: string;
    body: string;
    community?: string;
  }> = [];

  async indexDocument(doc: {
    id: string;
    title: string;
    body: string;
    community?: string;
  }): Promise<void> {
    const idx = this.docs.findIndex((d) => d.id === doc.id);
    if (idx >= 0) this.docs[idx] = doc;
    else this.docs.push(doc);
  }

  async search(filters: SearchFilters): Promise<SearchProviderResult> {
    const q = (filters.q ?? '').trim().toLowerCase();
    const filtered = this.docs.filter((d) => {
      const hay = `${d.title} ${d.body}`.toLowerCase();
      const matchesQ = !q || hay.includes(q);
      const matchesCommunity =
        !filters.community || d.community === filters.community;
      return matchesQ && matchesCommunity;
    });
    return {
      items: [],
      facets: { categories: [], conditions: [], communities: [] },
      tookMs: 0,
      total: filtered.length,
      nextCursor: undefined,
    };
  }
}
