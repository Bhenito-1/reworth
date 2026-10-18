/**
 * ReWorth staging seed (Phase 10) — founding-seller density for UAT.
 *
 * Deterministic RNG seed: 20260913
 *
 * Demo accounts (stable — UAT / Playwright):
 *   Seller Ori:  +2348010000001 / ori@demo.reworth.ng  / DemoOri!2026  (Lekki, L2+)
 *   Buyer Ayo:   +2348010000002 / ayo@demo.reworth.ng  / DemoAyo!2026  (Ikoyi)
 *   Risk admin:  risk@demo.reworth.ng / DemoRisk!2026  (RISK_FRAUD)
 *   Super Admin: from main seed (ADMIN_SUPER_EMAIL) — left untouched
 *
 * Env:
 *   SEED_STAGING_SKIP_HEAVY=1  → demo accounts + 50 listings only
 *   DATABASE_URL               → required
 *
 * Idempotent: upserts demos; if listings.count >= 2000, skips bulk and refreshes demos only.
 *
 * Run: pnpm seed:staging  (from repo root) or pnpm --filter @reworth/api seed:staging
 */
import {
  AdminRole,
  ItemCondition,
  ListingEventType,
  ListingImageStatus,
  ListingStatus,
  NotificationChannel,
  OrderStatus,
  PrismaClient,
  SellingMode,
  VerificationLevel,
  VerificationStatus,
} from '@prisma/client';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

const RNG_SEED = 20260913;
const TARGET_USERS = 300;
const TARGET_LISTINGS = 2000;
const LIGHT_LISTINGS = 50;
const ORDER_COUNT_MIN = 200;
const ORDER_COUNT_MAX = 350;
const STAGING_PHONE_PREFIX = '+2348091';
const STAGING_EMAIL_DOMAIN = 'staging.reworth.ng';
/** Marker on listing.brand for staging bulk rows (idempotent cleanup / detection). */
const STAGING_BRAND = 'STAGING_SEED';

const COMMUNITIES = [
  { slug: 'lekki', name: 'Lekki', meetLabel: 'Lekki Ph1', lat: 6.4482, lng: 3.4721 },
  { slug: 'ikoyi', name: 'Ikoyi', meetLabel: 'Ikoyi', lat: 6.4508, lng: 3.4352 },
  { slug: 'victoria-island', name: 'Victoria Island', meetLabel: 'VI', lat: 6.4288, lng: 3.4215 },
  { slug: 'oniru', name: 'Oniru', meetLabel: 'Oniru', lat: 6.4308, lng: 3.4502 },
  { slug: 'vgc', name: 'VGC', meetLabel: 'VGC', lat: 6.4250, lng: 3.5350 },
  { slug: 'chevron', name: 'Chevron', meetLabel: 'Chevron', lat: 6.4480, lng: 3.4900 },
  { slug: 'ajah', name: 'Ajah', meetLabel: 'Ajah', lat: 6.4660, lng: 3.5650 },
] as const;

type CategorySeed = {
  slug: string;
  name: string;
  children: { slug: string; name: string }[];
};

/** Same 16 top-level categories as prisma/seed.ts */
const CATEGORIES: CategorySeed[] = [
  {
    slug: 'home-furniture',
    name: 'Home & Furniture',
    children: [
      { slug: 'sofas', name: 'Sofas' },
      { slug: 'beds', name: 'Beds' },
      { slug: 'tables-desks', name: 'Tables & Desks' },
      { slug: 'storage', name: 'Storage' },
    ],
  },
  {
    slug: 'electronics',
    name: 'Electronics',
    children: [
      { slug: 'tvs', name: 'TVs' },
      { slug: 'audio', name: 'Audio' },
      { slug: 'cameras', name: 'Cameras' },
      { slug: 'gaming', name: 'Gaming' },
    ],
  },
  {
    slug: 'phones-tablets',
    name: 'Phones & Tablets',
    children: [
      { slug: 'smartphones', name: 'Smartphones' },
      { slug: 'tablets', name: 'Tablets' },
      { slug: 'phone-accessories', name: 'Accessories' },
    ],
  },
  {
    slug: 'computers',
    name: 'Computers',
    children: [
      { slug: 'laptops', name: 'Laptops' },
      { slug: 'desktops', name: 'Desktops' },
      { slug: 'monitors', name: 'Monitors' },
      { slug: 'peripherals', name: 'Peripherals' },
    ],
  },
  {
    slug: 'home-appliances',
    name: 'Home Appliances',
    children: [
      { slug: 'kitchen', name: 'Kitchen' },
      { slug: 'laundry', name: 'Laundry' },
      { slug: 'cooling', name: 'Cooling' },
    ],
  },
  {
    slug: 'vehicles',
    name: 'Vehicles',
    children: [
      { slug: 'cars', name: 'Cars' },
      { slug: 'motorcycles', name: 'Motorcycles' },
      { slug: 'parts', name: 'Parts' },
    ],
  },
  {
    slug: 'fashion',
    name: 'Fashion',
    children: [
      { slug: 'mens', name: "Men's" },
      { slug: 'womens', name: "Women's" },
      { slug: 'shoes', name: 'Shoes' },
    ],
  },
  {
    slug: 'luxury',
    name: 'Luxury',
    children: [
      { slug: 'watches', name: 'Watches' },
      { slug: 'bags', name: 'Bags' },
      { slug: 'jewellery', name: 'Jewellery' },
    ],
  },
  {
    slug: 'children-baby',
    name: 'Children & Baby',
    children: [
      { slug: 'toys', name: 'Toys' },
      { slug: 'strollers', name: 'Strollers' },
      { slug: 'kids-clothing', name: 'Clothing' },
    ],
  },
  {
    slug: 'sports-fitness',
    name: 'Sports & Fitness',
    children: [
      { slug: 'gym', name: 'Gym' },
      { slug: 'outdoor', name: 'Outdoor' },
      { slug: 'bikes', name: 'Bikes' },
    ],
  },
  {
    slug: 'office-equipment',
    name: 'Office Equipment',
    children: [
      { slug: 'printers', name: 'Printers' },
      { slug: 'office-furniture', name: 'Furniture' },
      { slug: 'supplies', name: 'Supplies' },
    ],
  },
  {
    slug: 'tools-equipment',
    name: 'Tools & Equipment',
    children: [
      { slug: 'power-tools', name: 'Power Tools' },
      { slug: 'hand-tools', name: 'Hand Tools' },
      { slug: 'generators', name: 'Generators' },
    ],
  },
  {
    slug: 'books',
    name: 'Books',
    children: [
      { slug: 'fiction', name: 'Fiction' },
      { slug: 'non-fiction', name: 'Non-fiction' },
      { slug: 'textbooks', name: 'Textbooks' },
    ],
  },
  {
    slug: 'collectibles',
    name: 'Collectibles',
    children: [
      { slug: 'art', name: 'Art' },
      { slug: 'memorabilia', name: 'Memorabilia' },
      { slug: 'antiques', name: 'Antiques' },
    ],
  },
  {
    slug: 'garden',
    name: 'Garden',
    children: [
      { slug: 'plants', name: 'Plants' },
      { slug: 'outdoor-furniture', name: 'Outdoor Furniture' },
      { slug: 'garden-tools', name: 'Tools' },
    ],
  },
  {
    slug: 'other',
    name: 'Other',
    children: [
      { slug: 'misc', name: 'Miscellaneous' },
      { slug: 'uncategorised', name: 'Uncategorised' },
    ],
  },
];

const MEET_POINTS: {
  community: string;
  name: string;
  landmark: string;
  lat: number;
  lng: number;
}[] = [
  { community: 'Lekki Ph1', name: 'The Palms Shopping Mall', landmark: 'Near Circle Mall / Admiralty', lat: 6.4395, lng: 3.4553 },
  { community: 'Lekki Ph1', name: 'Café Neo Admiralty', landmark: 'Admiralty Way', lat: 6.4482, lng: 3.4721 },
  { community: 'Lekki Ph1', name: 'Spar Lekki', landmark: 'Lekki-Epe Expressway', lat: 6.4410, lng: 3.4680 },
  { community: 'Ikoyi', name: 'Parkview Estate Gate', landmark: 'Parkview', lat: 6.4508, lng: 3.4352 },
  { community: 'Ikoyi', name: 'The Wheatbaker Lobby', landmark: 'Residence Road', lat: 6.4540, lng: 3.4301 },
  { community: 'VI', name: 'Eko Hotel Lobby', landmark: 'Adetokunbo Ademola', lat: 6.4269, lng: 3.4305 },
  { community: 'VI', name: 'Mega Plaza VI', landmark: 'Idowu Martins', lat: 6.4288, lng: 3.4215 },
  { community: 'Oniru', name: 'Novare Mall Oniru', landmark: 'Oniru Estate', lat: 6.4308, lng: 3.4502 },
  { community: 'VGC', name: 'VGC Club House', landmark: 'Main Boulevard', lat: 6.4250, lng: 3.5350 },
  { community: 'Chevron', name: 'Shoprite Chevron', landmark: 'Chevron Drive', lat: 6.4510, lng: 3.4950 },
  { community: 'Ajah', name: 'Shoprite Sangotedo', landmark: 'Abraham Adesanya', lat: 6.4680, lng: 3.5800 },
  { community: 'Ajah', name: 'Ajah Bus Stop Plaza', landmark: 'Addo Road junction', lat: 6.4660, lng: 3.5650 },
];

const FIRST_NAMES = [
  'Ada', 'Bola', 'Chioma', 'Damilola', 'Emeka', 'Funke', 'Gbenga', 'Halima',
  'Ifeanyi', 'Joke', 'Kemi', 'Lanre', 'Musa', 'Ngozi', 'Olu', 'Patience',
  'Qudus', 'Remi', 'Sade', 'Tunde', 'Uche', 'Vera', 'Wale', 'Yetunde', 'Zainab',
];

const CONDITIONS: ItemCondition[] = [
  ItemCondition.NEW,
  ItemCondition.LIKE_NEW,
  ItemCondition.VERY_GOOD,
  ItemCondition.GOOD,
  ItemCondition.FAIR,
];

const LISTING_TITLES = [
  'Solid wood dining table',
  'Samsung 55" Smart TV',
  'iPhone 13 Pro Max',
  'MacBook Air M2',
  'Standing fan (almost new)',
  'Toyota Corolla spare tyre',
  'Ankara two-piece set',
  'Rolex-style dress watch',
  'Baby stroller foldable',
  'Adjustable dumbbells',
  'HP LaserJet printer',
  'Bosch cordless drill',
  'Half of a Yellow Sun (paperback)',
  'Vintage Lagos poster',
  'Outdoor plant pot set',
  'Misc kitchen gadgets',
];

/** Mulberry32 — deterministic PRNG from integer seed. */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

function intBetween(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

function protectionFeeKobo(amountKobo: number): number {
  return Math.min(Math.round(amountKobo * 0.025), 500_000);
}

async function ensureCategories(): Promise<
  { id: string; slug: string; children: { id: string; slug: string }[] }[]
> {
  const result: {
    id: string;
    slug: string;
    children: { id: string; slug: string }[];
  }[] = [];
  let sort = 0;
  for (const cat of CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      create: {
        id: randomUUID(),
        slug: cat.slug,
        name: cat.name,
        sortOrder: sort++,
      },
      update: { name: cat.name, sortOrder: sort - 1 },
    });
    const parent = await prisma.category.findUniqueOrThrow({
      where: { slug: cat.slug },
    });
    const children: { id: string; slug: string }[] = [];
    let childSort = 0;
    for (const child of cat.children) {
      const childSlug = `${cat.slug}--${child.slug}`;
      await prisma.category.upsert({
        where: { slug: childSlug },
        create: {
          id: randomUUID(),
          slug: childSlug,
          name: child.name,
          parentId: parent.id,
          sortOrder: childSort++,
        },
        update: {
          name: child.name,
          parentId: parent.id,
          sortOrder: childSort - 1,
        },
      });
      const row = await prisma.category.findUniqueOrThrow({
        where: { slug: childSlug },
      });
      children.push({ id: row.id, slug: row.slug });
    }
    result.push({ id: parent.id, slug: parent.slug, children });
  }
  // eslint-disable-next-line no-console
  console.info(`[seed-staging] Categories ready: ${result.length} top-level`);
  return result;
}

async function ensureCommunities() {
  for (const c of COMMUNITIES) {
    await prisma.community.upsert({
      where: { slug: c.slug },
      create: {
        id: randomUUID(),
        slug: c.slug,
        name: c.name,
        active: true,
      },
      update: { name: c.name, active: true },
    });
  }
  // eslint-disable-next-line no-console
  console.info(`[seed-staging] Communities ready: ${COMMUNITIES.length}`);
}

async function ensureMeetPoints() {
  for (const mp of MEET_POINTS) {
    const existing = await prisma.meetPoint.findFirst({
      where: { community: mp.community, name: mp.name },
    });
    if (existing) {
      await prisma.meetPoint.update({
        where: { id: existing.id },
        data: {
          landmark: mp.landmark,
          lat: mp.lat,
          lng: mp.lng,
          active: true,
        },
      });
      continue;
    }
    await prisma.meetPoint.create({
      data: {
        id: randomUUID(),
        community: mp.community,
        name: mp.name,
        landmark: mp.landmark,
        lat: mp.lat,
        lng: mp.lng,
        active: true,
      },
    });
  }
  // eslint-disable-next-line no-console
  console.info(`[seed-staging] Meet points ready: ${MEET_POINTS.length}`);
}

async function upsertDemoUser(opts: {
  phone?: string;
  email: string;
  password: string;
  displayName: string;
  community: string;
  verificationLevels: VerificationLevel[];
  trustScore?: number;
  trustTier?: string | null;
  role?: AdminRole;
}): Promise<string> {
  const passwordHash = await hashPassword(opts.password);
  const existing = opts.phone
    ? await prisma.user.findFirst({
        where: {
          OR: [{ phone: opts.phone }, { email: opts.email }],
        },
      })
    : await prisma.user.findUnique({ where: { email: opts.email } });

  let userId: string;
  if (existing) {
    userId = existing.id;
    await prisma.user.update({
      where: { id: userId },
      data: {
        phone: opts.phone ?? existing.phone,
        phoneVerifiedAt: opts.phone ? new Date() : existing.phoneVerifiedAt,
        email: opts.email,
        emailVerifiedAt: new Date(),
        passwordHash,
        status: 'ACTIVE',
      },
    });
    await prisma.profile.upsert({
      where: { userId },
      create: {
        id: randomUUID(),
        userId,
        displayName: opts.displayName,
        preferredCommunity: opts.community,
        language: 'en-NG',
        currency: 'NGN',
      },
      update: {
        displayName: opts.displayName,
        preferredCommunity: opts.community,
      },
    });
  } else {
    const created = await prisma.user.create({
      data: {
        id: randomUUID(),
        phone: opts.phone,
        phoneVerifiedAt: opts.phone ? new Date() : null,
        email: opts.email,
        emailVerifiedAt: new Date(),
        passwordHash,
        status: 'ACTIVE',
        profile: {
          create: {
            displayName: opts.displayName,
            preferredCommunity: opts.community,
            language: 'en-NG',
            currency: 'NGN',
          },
        },
      },
    });
    userId = created.id;
  }

  for (const level of opts.verificationLevels) {
    const found = await prisma.verification.findFirst({
      where: { userId, level },
    });
    if (found) {
      await prisma.verification.update({
        where: { id: found.id },
        data: {
          status: VerificationStatus.VERIFIED,
          verifiedAt: new Date(),
        },
      });
    } else {
      await prisma.verification.create({
        data: {
          id: randomUUID(),
          userId,
          level,
          status: VerificationStatus.VERIFIED,
          verifiedAt: new Date(),
        },
      });
    }
  }

  if (opts.trustScore != null) {
    const tier =
      opts.trustTier ??
      (opts.trustScore >= 85
        ? 'TOP_SELLER'
        : opts.trustScore >= 70
          ? 'TRUSTED'
          : null);
    await prisma.trustScore.upsert({
      where: { userId },
      create: {
        id: randomUUID(),
        userId,
        score: opts.trustScore,
        tier,
        completionRate: 0.92,
        avgRating: 4.7,
        medianResponseMinutes: 18,
        cancellationRate: 0.03,
        disputeRate: 0.01,
        accountAgeDays: 180,
        verificationPoints: opts.verificationLevels.length * 20,
      },
      update: {
        score: opts.trustScore,
        tier,
        computedAt: new Date(),
      },
    });
  }

  if (opts.role) {
    await prisma.userRole.upsert({
      where: {
        userId_role: { userId, role: opts.role },
      },
      create: { id: randomUUID(), userId, role: opts.role },
      update: {},
    });
  }

  return userId;
}

async function seedDemoAccounts(): Promise<{
  oriId: string;
  ayoId: string;
  riskId: string;
}> {
  // Demo credentials documented at file header — demo only, not production secrets.
  const oriId = await upsertDemoUser({
    phone: '+2348010000001',
    email: 'ori@demo.reworth.ng',
    password: 'DemoOri!2026',
    displayName: 'Ori',
    community: 'Lekki',
    verificationLevels: [
      VerificationLevel.L1_PHONE,
      VerificationLevel.L2_EMAIL,
      VerificationLevel.L3_IDENTITY,
    ],
    trustScore: 92,
    trustTier: 'TOP_SELLER',
  });

  const ayoId = await upsertDemoUser({
    phone: '+2348010000002',
    email: 'ayo@demo.reworth.ng',
    password: 'DemoAyo!2026',
    displayName: 'Ayo',
    community: 'Ikoyi',
    verificationLevels: [
      VerificationLevel.L1_PHONE,
      VerificationLevel.L2_EMAIL,
    ],
    trustScore: 74,
    trustTier: 'TRUSTED',
  });

  const riskId = await upsertDemoUser({
    email: 'risk@demo.reworth.ng',
    password: 'DemoRisk!2026',
    displayName: 'Risk Analyst',
    community: 'Victoria Island',
    verificationLevels: [VerificationLevel.L2_EMAIL],
    role: AdminRole.RISK_FRAUD,
  });

  // eslint-disable-next-line no-console
  console.info(
    `[seed-staging] Demo accounts ready: Ori=${oriId} Ayo=${ayoId} Risk=${riskId}`,
  );
  return { oriId, ayoId, riskId };
}

async function seedBulkUsers(
  rng: () => number,
  count: number,
  sharedPasswordHash: string,
): Promise<string[]> {
  const existing = await prisma.user.count({
    where: { email: { endsWith: `@${STAGING_EMAIL_DOMAIN}` } },
  });
  if (existing >= count) {
    const rows = await prisma.user.findMany({
      where: { email: { endsWith: `@${STAGING_EMAIL_DOMAIN}` } },
      select: { id: true },
      take: count,
    });
    // eslint-disable-next-line no-console
    console.info(`[seed-staging] Bulk users already present: ${rows.length}`);
    return rows.map((r) => r.id);
  }

  const toCreate = count - existing;
  const userIds: string[] = [];
  const BATCH = 50;

  for (let offset = 0; offset < toCreate; offset += BATCH) {
    const n = Math.min(BATCH, toCreate - offset);
    const batchUsers: {
      id: string;
      phone: string;
      email: string;
      community: (typeof COMMUNITIES)[number];
      name: string;
      level: VerificationLevel;
      trust: number;
    }[] = [];

    for (let i = 0; i < n; i++) {
      const idx = existing + offset + i + 1;
      const community = pick(rng, COMMUNITIES);
      const name = `${pick(rng, FIRST_NAMES)} ${idx}`;
      const roll = rng();
      const level =
        roll < 0.35
          ? VerificationLevel.L1_PHONE
          : roll < 0.75
            ? VerificationLevel.L2_EMAIL
            : VerificationLevel.L3_IDENTITY;
      batchUsers.push({
        id: randomUUID(),
        phone: `${STAGING_PHONE_PREFIX}${String(idx).padStart(4, '0')}`,
        email: `user${idx}@${STAGING_EMAIL_DOMAIN}`,
        community,
        name,
        level,
        trust: intBetween(rng, 35, 98),
      });
    }

    await prisma.user.createMany({
      data: batchUsers.map((u) => ({
        id: u.id,
        phone: u.phone,
        phoneVerifiedAt: new Date(),
        email: u.email,
        emailVerifiedAt: new Date(),
        passwordHash: sharedPasswordHash,
        status: 'ACTIVE' as const,
      })),
      skipDuplicates: true,
    });

    await prisma.profile.createMany({
      data: batchUsers.map((u) => ({
        id: randomUUID(),
        userId: u.id,
        displayName: u.name,
        preferredCommunity: u.community.name,
        language: 'en-NG',
        currency: 'NGN',
      })),
      skipDuplicates: true,
    });

    await prisma.verification.createMany({
      data: batchUsers.flatMap((u) => {
        const levels: VerificationLevel[] = [VerificationLevel.L1_PHONE];
        if (
          u.level === VerificationLevel.L2_EMAIL ||
          u.level === VerificationLevel.L3_IDENTITY
        ) {
          levels.push(VerificationLevel.L2_EMAIL);
        }
        if (u.level === VerificationLevel.L3_IDENTITY) {
          levels.push(VerificationLevel.L3_IDENTITY);
        }
        return levels.map((level) => ({
          id: randomUUID(),
          userId: u.id,
          level,
          status: VerificationStatus.VERIFIED,
          verifiedAt: new Date(),
        }));
      }),
    });

    await prisma.trustScore.createMany({
      data: batchUsers.map((u) => ({
        id: randomUUID(),
        userId: u.id,
        score: u.trust,
        tier:
          u.trust >= 85 ? 'TOP_SELLER' : u.trust >= 70 ? 'TRUSTED' : null,
        completionRate: 0.5 + rng() * 0.5,
        avgRating: 3 + rng() * 2,
        medianResponseMinutes: 10 + rng() * 120,
        cancellationRate: rng() * 0.15,
        disputeRate: rng() * 0.08,
        accountAgeDays: intBetween(rng, 7, 400),
        verificationPoints:
          u.level === VerificationLevel.L3_IDENTITY
            ? 60
            : u.level === VerificationLevel.L2_EMAIL
              ? 40
              : 20,
      })),
      skipDuplicates: true,
    });

    userIds.push(...batchUsers.map((u) => u.id));
  }

  const all = await prisma.user.findMany({
    where: { email: { endsWith: `@${STAGING_EMAIL_DOMAIN}` } },
    select: { id: true },
    take: count,
  });
  // eslint-disable-next-line no-console
  console.info(`[seed-staging] Bulk users ready: ${all.length}`);
  return all.map((r) => r.id);
}

async function seedListings(opts: {
  rng: () => number;
  sellerIds: string[];
  oriId: string;
  categories: Awaited<ReturnType<typeof ensureCategories>>;
  count: number;
}): Promise<string[]> {
  const { rng, sellerIds, oriId, categories, count } = opts;
  const vehiclesCat = categories.find((c) => c.slug === 'vehicles')!;
  const nonVehicle = categories.filter((c) => c.slug !== 'vehicles');

  const listingIds: string[] = [];
  const BATCH = 100;
  const now = Date.now();

  for (let offset = 0; offset < count; offset += BATCH) {
    const n = Math.min(BATCH, count - offset);
    const rows: {
      id: string;
      sellerId: string;
      title: string;
      description: string;
      categoryId: string;
      subcategoryId: string | null;
      condition: ItemCondition;
      priceKobo: number;
      originalPriceKobo: number;
      status: ListingStatus;
      community: string;
      geoLat: number;
      geoLng: number;
      vehicle: object | null;
      riskFlags: string[];
      publishedAt: Date | null;
      priceDrop: boolean;
      fulfilmentDelivery: boolean;
      views: number;
    }[] = [];

    for (let i = 0; i < n; i++) {
      const idx = offset + i;
      const isVehicle = rng() < 0.1;
      const cat = isVehicle ? vehiclesCat : pick(rng, nonVehicle);
      const sub = cat.children.length ? pick(rng, cat.children) : null;
      const community = pick(rng, COMMUNITIES);
      const underReviewOrFlagged = rng() < 0.05;
      const priceKobo = isVehicle
        ? intBetween(rng, 1_500_000_00, 12_000_000_00)
        : intBetween(rng, 5_000_00, 850_000_00);
      const dropped = rng() < 0.15;
      const originalPriceKobo = dropped
        ? Math.round(priceKobo * (1.1 + rng() * 0.4))
        : priceKobo;
      const riskFlags = underReviewOrFlagged
        ? [pick(rng, ['LOW_PRICE', 'RAPID_LISTING', 'REPORTED_USER', 'DUPLICATE_IMAGE'])]
        : [];
      const status = underReviewOrFlagged
        ? ListingStatus.UNDER_REVIEW
        : ListingStatus.LIVE;
      const sellerId =
        idx < 8 ? oriId : pick(rng, sellerIds.length ? sellerIds : [oriId]);

      rows.push({
        id: randomUUID(),
        sellerId,
        title: `${LISTING_TITLES[idx % LISTING_TITLES.length]} #${idx + 1}`,
        description: `Staging seed listing ${idx + 1} in ${community.name}. Good condition, Lagos meetup preferred.`,
        categoryId: cat.id,
        subcategoryId: sub?.id ?? null,
        condition: pick(rng, CONDITIONS),
        priceKobo,
        originalPriceKobo,
        status,
        community: community.name,
        geoLat: community.lat + (rng() - 0.5) * 0.02,
        geoLng: community.lng + (rng() - 0.5) * 0.02,
        vehicle: isVehicle
          ? {
              make: pick(rng, ['Toyota', 'Honda', 'Lexus', 'Mercedes']),
              model: pick(rng, ['Corolla', 'Camry', 'Accord', 'C-Class']),
              year: intBetween(rng, 2008, 2024),
              mileageKm: intBetween(rng, 12_000, 180_000),
            }
          : null,
        riskFlags,
        publishedAt:
          status === ListingStatus.LIVE
            ? new Date(now - intBetween(rng, 0, 30) * 86_400_000)
            : null,
        priceDrop: dropped,
        fulfilmentDelivery: rng() > 0.7,
        views: intBetween(rng, 0, 500),
      });
    }

    await prisma.listing.createMany({
      data: rows.map((r) => ({
        id: r.id,
        sellerId: r.sellerId,
        title: r.title,
        description: r.description,
        categoryId: r.categoryId,
        subcategoryId: r.subcategoryId,
        brand: STAGING_BRAND,
        condition: r.condition,
        originalPriceKobo: r.originalPriceKobo,
        priceKobo: r.priceKobo,
        negotiable: true,
        sellingMode: SellingMode.SELL,
        status: r.status,
        community: r.community,
        geoLat: r.geoLat,
        geoLng: r.geoLng,
        fulfilmentPickup: true,
        fulfilmentMeet: true,
        fulfilmentDelivery: r.fulfilmentDelivery,
        vehicle: r.vehicle ?? undefined,
        riskFlags: r.riskFlags,
        publishedAt: r.publishedAt,
        expiresAt: r.publishedAt
          ? new Date(r.publishedAt.getTime() + 60 * 86_400_000)
          : null,
        views: r.views,
      })),
    });

    const priceEvents = rows
      .filter((r) => r.priceDrop)
      .map((r) => ({
        id: randomUUID(),
        listingId: r.id,
        type: ListingEventType.PRICE_CHANGED,
        actorUserId: r.sellerId,
        payload: {
          fromKobo: r.originalPriceKobo,
          toKobo: r.priceKobo,
          source: 'staging-seed',
        },
        createdAt: new Date(
          (r.publishedAt?.getTime() ?? now) - intBetween(rng, 1, 10) * 86_400_000,
        ),
      }));

    if (priceEvents.length) {
      await prisma.listingEvent.createMany({ data: priceEvents });
    }

    listingIds.push(...rows.map((r) => r.id));
    // eslint-disable-next-line no-console
    console.info(
      `[seed-staging] Listings batch ${offset + n}/${count}`,
    );
  }

  return listingIds;
}

/** Public CDN placeholders — staging visuals do not require adobe/s3mock. */
function stagingImageVariants(seed: string) {
  const base = `https://picsum.photos/seed/rw-${seed}`;
  return {
    original: `${base}/1200/900`,
    w640: { webp: `${base}/640/480` },
    w1080: { webp: `${base}/1080/810` },
    w1600: { webp: `${base}/1600/1200` },
  };
}

async function seedListingImages(listingIds: string[]) {
  let ids = listingIds;
  if (!ids.length) {
    const existing = await prisma.listing.findMany({
      where: { brand: STAGING_BRAND },
      select: { id: true },
      take: 5000,
    });
    ids = existing.map((l) => l.id);
  }
  if (!ids.length) return;

  const already = await prisma.listingImage.findMany({
    where: { listingId: { in: ids } },
    select: { listingId: true },
    distinct: ['listingId'],
  });
  const has = new Set(already.map((r) => r.listingId));
  const need = ids.filter((id) => !has.has(id));
  if (!need.length) {
    // eslint-disable-next-line no-console
    console.info('[seed-staging] Listing images already present; skipping');
    return;
  }

  const BATCH = 200;
  for (let offset = 0; offset < need.length; offset += BATCH) {
    const slice = need.slice(offset, offset + BATCH);
    await prisma.listingImage.createMany({
      data: slice.map((listingId, i) => {
        const seed = `${listingId.slice(0, 8)}-${offset + i}`;
        return {
          id: randomUUID(),
          listingId,
          sortOrder: 0,
          originalKey: `staging/${seed}.jpg`,
          variants: stagingImageVariants(seed),
          width: 1200,
          height: 900,
          mime: 'image/jpeg',
          status: ListingImageStatus.READY,
          exifStripped: true,
        };
      }),
    });
    // eslint-disable-next-line no-console
    console.info(
      `[seed-staging] Listing images ${Math.min(offset + BATCH, need.length)}/${need.length}`,
    );
  }
}

async function seedOrdersAndNotifications(opts: {
  rng: () => number;
  oriId: string;
  ayoId: string;
  sellerIds: string[];
  listingIds: string[];
  orderCount: number;
}) {
  const { rng, oriId, ayoId, sellerIds, listingIds, orderCount } = opts;
  const existingStagingOrders = await prisma.order.count({
    where: {
      OR: [{ buyerId: ayoId }, { sellerId: oriId }],
      createdAt: { gte: new Date(Date.now() - 40 * 86_400_000) },
    },
  });
  if (existingStagingOrders >= ORDER_COUNT_MIN) {
    // eslint-disable-next-line no-console
    console.info(
      `[seed-staging] Orders already present (~${existingStagingOrders}); skipping order bulk`,
    );
    return;
  }

  const liveListings = await prisma.listing.findMany({
    where: {
      id: { in: listingIds.slice(0, Math.min(listingIds.length, 800)) },
      status: ListingStatus.LIVE,
      priceKobo: { gt: 0 },
    },
    select: { id: true, sellerId: true, priceKobo: true },
    take: 800,
  });

  if (!liveListings.length) {
    // eslint-disable-next-line no-console
    console.warn('[seed-staging] No LIVE listings for orders; skipping');
    return;
  }

  const buyers = [ayoId, ...sellerIds.filter((id) => id !== oriId)].slice(
    0,
    80,
  );
  const statuses: OrderStatus[] = [
    OrderStatus.COMPLETED,
    OrderStatus.COMPLETED,
    OrderStatus.COMPLETED,
    OrderStatus.CANCELLED,
    OrderStatus.DISPUTE_HOLD,
    OrderStatus.COMPLETED,
  ];

  const BATCH = 40;
  const notifRows: {
    id: string;
    userId: string;
    category: string;
    channel: NotificationChannel;
    title: string;
    body: string;
    deepLink: string | null;
    createdAt: Date;
  }[] = [];

  for (let offset = 0; offset < orderCount; offset += BATCH) {
    const n = Math.min(BATCH, orderCount - offset);
    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < n; i++) {
        const listing = pick(rng, liveListings);
        let buyerId = pick(rng, buyers);
        if (buyerId === listing.sellerId) {
          buyerId = buyerId === ayoId ? oriId : ayoId;
          if (buyerId === listing.sellerId) continue;
        }
        const status = pick(rng, statuses);
        const amountKobo = listing.priceKobo;
        const fee = protectionFeeKobo(amountKobo);
        const total = amountKobo + fee;
        const daysAgo = intBetween(rng, 0, 29);
        const createdAt = new Date(Date.now() - daysAgo * 86_400_000);
        const orderId = randomUUID();

        await tx.order.create({
          data: {
            id: orderId,
            listingId: listing.id,
            buyerId,
            sellerId: listing.sellerId,
            amountKobo,
            protectionFeeKobo: fee,
            deliveryFeeKobo: 0,
            totalKobo: total,
            fulfilmentMethod: 'MEET_POINT',
            status,
            buyerProtection: true,
            fundedAt:
              status === OrderStatus.CANCELLED
                ? null
                : new Date(createdAt.getTime() + 3_600_000),
            completedAt:
              status === OrderStatus.COMPLETED
                ? new Date(createdAt.getTime() + 2 * 86_400_000)
                : null,
            createdAt,
            updatedAt: createdAt,
          },
        });

        await tx.orderEvent.create({
          data: {
            id: randomUUID(),
            orderId,
            type: 'CREATED',
            actorUserId: buyerId,
            createdAt,
          },
        });

        if (status !== OrderStatus.CANCELLED) {
          notifRows.push({
            id: randomUUID(),
            userId: listing.sellerId,
            category: 'PAYMENT_RECEIVED',
            channel: NotificationChannel.IN_APP,
            title: 'Payment received',
            body: `Order funded for ₦${(total / 100).toLocaleString('en-NG')}`,
            deepLink: `/orders/${orderId}`,
            createdAt: new Date(createdAt.getTime() + 3_600_000),
          });
          notifRows.push({
            id: randomUUID(),
            userId: buyerId,
            category: 'ORDER_UPDATE',
            channel: NotificationChannel.IN_APP,
            title: 'Order update',
            body: `Your order is now ${status}`,
            deepLink: `/orders/${orderId}`,
            createdAt: new Date(createdAt.getTime() + 7_200_000),
          });
        }
      }
    });
  }

  // Ensure demo pair has a few visible orders + notifs
  const oriListing = await prisma.listing.findFirst({
    where: { sellerId: oriId, status: ListingStatus.LIVE },
    select: { id: true, priceKobo: true },
  });
  if (oriListing) {
    const demoOrderId = randomUUID();
    const amount = oriListing.priceKobo;
    const fee = protectionFeeKobo(amount);
    await prisma.order.create({
      data: {
        id: demoOrderId,
        listingId: oriListing.id,
        buyerId: ayoId,
        sellerId: oriId,
        amountKobo: amount,
        protectionFeeKobo: fee,
        deliveryFeeKobo: 0,
        totalKobo: amount + fee,
        fulfilmentMethod: 'PICKUP',
        status: OrderStatus.COMPLETED,
        buyerProtection: true,
        fundedAt: new Date(Date.now() - 5 * 86_400_000),
        completedAt: new Date(Date.now() - 3 * 86_400_000),
        createdAt: new Date(Date.now() - 6 * 86_400_000),
      },
    });
    notifRows.push(
      {
        id: randomUUID(),
        userId: oriId,
        category: 'PAYMENT_RECEIVED',
        channel: NotificationChannel.IN_APP,
        title: 'Ayo paid for your listing',
        body: 'Demo funded order — ready for meetup.',
        deepLink: `/orders/${demoOrderId}`,
        createdAt: new Date(),
      },
      {
        id: randomUUID(),
        userId: ayoId,
        category: 'ORDER_UPDATE',
        channel: NotificationChannel.IN_APP,
        title: 'Order completed',
        body: 'Leave a review for Ori when ready.',
        deepLink: `/orders/${demoOrderId}`,
        createdAt: new Date(),
      },
    );
  }

  if (notifRows.length) {
    const NOTIF_BATCH = 200;
    for (let i = 0; i < notifRows.length; i += NOTIF_BATCH) {
      await prisma.notification.createMany({
        data: notifRows.slice(i, i + NOTIF_BATCH),
      });
    }
  }

  // eslint-disable-next-line no-console
  console.info(
    `[seed-staging] Orders seeded (~${orderCount}) + notifications (${notifRows.length})`,
  );
}

async function main() {
  const rng = mulberry32(RNG_SEED);
  const skipHeavy = process.env.SEED_STAGING_SKIP_HEAVY === '1';

  // eslint-disable-next-line no-console
  console.info(
    `[seed-staging] start seed=${RNG_SEED} skipHeavy=${skipHeavy}`,
  );

  await ensureCommunities();
  const categories = await ensureCategories();
  await ensureMeetPoints();
  const demos = await seedDemoAccounts();

  const listingCount = await prisma.listing.count();
  if (listingCount >= TARGET_LISTINGS && !skipHeavy) {
    // eslint-disable-next-line no-console
    console.info(
      `[seed-staging] listings=${listingCount} >= ${TARGET_LISTINGS}; refreshing demos + images only`,
    );
    await seedListingImages([]);
    return;
  }

  const sharedHash = await hashPassword('StagingUser!2026');
  const bulkUserCount = skipHeavy ? 20 : TARGET_USERS;
  const sellerIds = await seedBulkUsers(rng, bulkUserCount, sharedHash);
  const allSellers = [demos.oriId, ...sellerIds];

  const listingTarget = skipHeavy ? LIGHT_LISTINGS : TARGET_LISTINGS;
  const stillNeed = Math.max(0, listingTarget - listingCount);
  let listingIds: string[] = [];
  if (stillNeed > 0) {
    listingIds = await seedListings({
      rng,
      sellerIds: allSellers,
      oriId: demos.oriId,
      categories,
      count: stillNeed,
    });
  } else {
    const existing = await prisma.listing.findMany({
      where: { brand: STAGING_BRAND },
      select: { id: true },
      take: 800,
    });
    listingIds = existing.map((l) => l.id);
  }

  await seedListingImages(listingIds);

  if (!skipHeavy) {
    const orderCount = intBetween(rng, ORDER_COUNT_MIN, ORDER_COUNT_MAX);
    await seedOrdersAndNotifications({
      rng,
      oriId: demos.oriId,
      ayoId: demos.ayoId,
      sellerIds: allSellers,
      listingIds,
      orderCount,
    });
  } else {
    // Light mode: a couple of Ori listings for demos if we just created 50
    await seedOrdersAndNotifications({
      rng,
      oriId: demos.oriId,
      ayoId: demos.ayoId,
      sellerIds: allSellers,
      listingIds,
      orderCount: 12,
    });
  }

  // eslint-disable-next-line no-console
  console.info('[seed-staging] done');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
