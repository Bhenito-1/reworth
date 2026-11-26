import {
  listingMatchesSearchQuery,
  searchQueryTokens,
  tokenVariants,
} from './search-text';

describe('search-text', () => {
  const row = (
    overrides: Partial<Parameters<typeof listingMatchesSearchQuery>[0]> = {},
  ) => ({
    title: 'Table lamp',
    description: 'Wooden finish',
    brand: null,
    model: null,
    category: {
      name: 'Home & Furniture',
      slug: 'home-furniture',
    },
    subcategory: null,
    ...overrides,
  });

  it('tokenizes query', () => {
    expect(searchQueryTokens('  Home   Decors ')).toEqual(['home', 'decors']);
  });

  it('matches category name via any token', () => {
    expect(listingMatchesSearchQuery(row(), 'home decors')).toBe(true);
    expect(listingMatchesSearchQuery(row(), 'furniture')).toBe(true);
  });

  it('matches subcategory slug (fashion shoes)', () => {
    const shoes = row({
      title: 'Nike runners',
      category: { name: 'Fashion', slug: 'fashion' },
      subcategory: { name: 'Shoes', slug: 'fashion--shoes' },
    });
    expect(listingMatchesSearchQuery(shoes, 'shoes')).toBe(true);
    expect(listingMatchesSearchQuery(shoes, 'shoe')).toBe(true);
  });

  it('matches title substring', () => {
    expect(listingMatchesSearchQuery(row({ title: 'Samsung OLED TV' }), 'oled')).toBe(
      true,
    );
  });

  it('plural variants', () => {
    expect(tokenVariants('shoes')).toContain('shoe');
    expect(tokenVariants('decors')).toContain('decor');
  });
});