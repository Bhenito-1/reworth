/** Listing fields consulted for keyword search (in-memory + Prisma OR clauses). */
export type SearchableListing = {
  title: string;
  description: string;
  brand?: string | null;
  model?: string | null;
  category?: { name: string; slug: string } | null;
  subcategory?: { name: string; slug: string } | null;
};

export function searchQueryTokens(q: string): string[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  return needle.split(/\s+/).filter(Boolean);
}

/** Substring variants for plural / simple suffixes (shoe ↔ shoes, decor ↔ decors). */
export function tokenVariants(token: string): string[] {
  const t = token.toLowerCase();
  const out = new Set<string>([t]);
  if (t.length > 3 && t.endsWith('es')) out.add(t.slice(0, -2));
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) {
    out.add(t.slice(0, -1));
  }
  return [...out];
}

export function listingSearchHaystack(row: SearchableListing): string {
  return [
    row.title,
    row.description,
    row.brand ?? '',
    row.model ?? '',
    row.category?.name ?? '',
    row.category?.slug ?? '',
    row.subcategory?.name ?? '',
    row.subcategory?.slug ?? '',
  ]
    .join(' ')
    .toLowerCase();
}

function variantHitsHaystack(hay: string, token: string): boolean {
  return tokenVariants(token).some((v) => v.length > 0 && hay.includes(v));
}

/**
 * Match when the full phrase appears in the haystack, or any query token
 * (including variants) matches a substring in title, description, brand,
 * model, or category / subcategory names and slugs.
 */
export function listingMatchesSearchQuery(
  row: SearchableListing,
  q: string,
): boolean {
  const phrase = q.trim().toLowerCase();
  if (!phrase) return true;
  const hay = listingSearchHaystack(row);
  if (hay.includes(phrase)) return true;
  const tokens = searchQueryTokens(q);
  if (tokens.length === 0) return true;
  return tokens.some((token) => variantHitsHaystack(hay, token));
}

const TEXT_FIELD = 'insensitive' as const;

/** Prisma fragment: `(field OR field OR …)` for all token variants — one DB round trip. */
export function buildListingTextSearchOrClause(
  q: string,
): { OR: Record<string, unknown>[] } | null {
  const tokens = searchQueryTokens(q);
  if (tokens.length === 0) return null;
  const variants = [
    ...new Set(tokens.flatMap((t) => tokenVariants(t)).filter(Boolean)),
  ];
  const OR: Record<string, unknown>[] = [];
  for (const token of variants) {
    OR.push(
      { title: { contains: token, mode: TEXT_FIELD } },
      { description: { contains: token, mode: TEXT_FIELD } },
      { brand: { contains: token, mode: TEXT_FIELD } },
      { model: { contains: token, mode: TEXT_FIELD } },
      { category: { is: { name: { contains: token, mode: TEXT_FIELD } } } },
      { category: { is: { slug: { contains: token, mode: TEXT_FIELD } } } },
      {
        subcategory: { is: { name: { contains: token, mode: TEXT_FIELD } } },
      },
      {
        subcategory: { is: { slug: { contains: token, mode: TEXT_FIELD } } },
      },
    );
  }
  return { OR };
}