/**
 * ReWorth Prisma seed — Super Admin + categories (PRD §26) + chat scan rules.
 *
 * Env:
 *   ADMIN_SUPER_EMAIL
 *   ADMIN_SUPER_PASSWORD
 */
import { PrismaClient, AdminRole, ChatScanKind, ItemCondition, ListingStatus, SellingMode } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { seedRiskAndModeration } from './seed-risk-moderation';
import { PHASE22_COMMUNITY_SEEDS } from '../src/communities/community-seeds';

/** Load monorepo root `.env` when `apps/api/.env` is absent (local Expo + API). */
function loadRootEnv() {
  if (process.env.DATABASE_URL) return;
  const candidates = [
    path.resolve(__dirname, '../../../.env'),
    path.resolve(process.cwd(), '../../.env'),
    path.resolve(process.cwd(), '.env'),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
    break;
  }
}

loadRootEnv();

const prisma = new PrismaClient();

type CategorySeed = {
  slug: string;
  name: string;
  children: { slug: string; name: string }[];
};

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

async function seedCategories() {
  let sort = 0;
  for (const cat of CATEGORIES) {
    const parentId = randomUUID();
    await prisma.category.upsert({
      where: { slug: cat.slug },
      create: {
        id: parentId,
        slug: cat.slug,
        name: cat.name,
        sortOrder: sort++,
      },
      update: {
        name: cat.name,
        sortOrder: sort - 1,
      },
    });

    const parent = await prisma.category.findUniqueOrThrow({
      where: { slug: cat.slug },
    });

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
    }
  }
  // eslint-disable-next-line no-console
  console.info(`[seed] Categories ready: ${CATEGORIES.length} top-level`);
}

async function seedAdmin() {
  const email = (process.env.ADMIN_SUPER_EMAIL ?? 'admin@example.com')
    .trim()
    .toLowerCase();
  const password =
    process.env.ADMIN_SUPER_PASSWORD ?? 'change-me-strong-password';

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      emailVerifiedAt: new Date(),
      passwordHash,
      status: 'ACTIVE',
      profile: {
        create: {
          displayName: 'Super Admin',
          preferredCommunity: '',
          language: 'en-NG',
          currency: 'NGN',
        },
      },
      roles: {
        create: { role: AdminRole.SUPER_ADMIN },
      },
      verifications: {
        create: {
          level: 'L2_EMAIL',
          status: 'VERIFIED',
          verifiedAt: new Date(),
        },
      },
    },
    update: {
      passwordHash,
      status: 'ACTIVE',
    },
    include: { roles: true },
  });

  const hasSuper = user.roles.some((r) => r.role === AdminRole.SUPER_ADMIN);
  if (!hasSuper) {
    await prisma.userRole.create({
      data: { userId: user.id, role: AdminRole.SUPER_ADMIN },
    });
  }

  // eslint-disable-next-line no-console
  console.info(`[seed] Super Admin ready: ${email} (${user.id})`);
}

const CHAT_SCAN_RULES: { pattern: string; kind: ChatScanKind }[] = [
  { pattern: 'bank account', kind: ChatScanKind.OFF_PLATFORM_PAYMENT },
  { pattern: 'transfer directly', kind: ChatScanKind.OFF_PLATFORM_PAYMENT },
  { pattern: 'pay to my account', kind: ChatScanKind.OFF_PLATFORM_PAYMENT },
  { pattern: 'pay directly', kind: ChatScanKind.OFF_PLATFORM_PAYMENT },
  { pattern: 'https?://', kind: ChatScanKind.EXTERNAL_LINK },
  { pattern: 'whatsapp', kind: ChatScanKind.SCAM_PHRASE },
  { pattern: 'send me money first', kind: ChatScanKind.ADVANCE_PAYMENT },
];

async function seedChatScanRules() {
  for (const rule of CHAT_SCAN_RULES) {
    const existing = await prisma.chatScanRule.findFirst({
      where: { pattern: rule.pattern, kind: rule.kind },
    });
    if (existing) continue;
    await prisma.chatScanRule.create({
      data: {
        id: randomUUID(),
        pattern: rule.pattern,
        kind: rule.kind,
        enabled: true,
      },
    });
  }
  // eslint-disable-next-line no-console
  console.info(`[seed] Chat scan rules ready: ${CHAT_SCAN_RULES.length}`);
}

/** Lagos meet points — 3–5 per community (mall / café names). */
const MEET_POINTS: {
  community: string;
  name: string;
  landmark: string;
  lat: number;
  lng: number;
}[] = [
  // Lekki Phase 1
  { community: 'Lekki Ph1', name: 'The Palms Shopping Mall', landmark: 'Near Circle Mall / Admiralty', lat: 6.4395, lng: 3.4553 },
  { community: 'Lekki Ph1', name: 'Café Neo Admiralty', landmark: 'Admiralty Way', lat: 6.4482, lng: 3.4721 },
  { community: 'Lekki Ph1', name: 'Spar Lekki', landmark: 'Lekki-Epe Expressway', lat: 6.4410, lng: 3.4680 },
  { community: 'Lekki Ph1', name: 'Jazzhole Café', landmark: 'Off Admiralty Road', lat: 6.4501, lng: 3.4695 },
  // Ikoyi
  { community: 'Ikoyi', name: 'Parkview Estate Gate', landmark: 'Parkview', lat: 6.4508, lng: 3.4352 },
  { community: 'Ikoyi', name: 'The Wheatbaker Lobby', landmark: 'Residence Road', lat: 6.4540, lng: 3.4301 },
  { community: 'Ikoyi', name: 'Ikoyi Club Car Park', landmark: 'Ikoyi Club Road', lat: 6.4565, lng: 3.4278 },
  { community: 'Ikoyi', name: 'Falomo Shopping Complex', landmark: 'Awolowo Road', lat: 6.4489, lng: 3.4210 },
  // Victoria Island
  { community: 'VI', name: 'Eko Hotel Lobby', landmark: 'Adetokunbo Ademola', lat: 6.4269, lng: 3.4305 },
  { community: 'VI', name: 'The Civic Centre', landmark: 'Ozumba Mbadiwe', lat: 6.4335, lng: 3.4240 },
  { community: 'VI', name: 'Mega Plaza VI', landmark: 'Idowu Martins', lat: 6.4288, lng: 3.4215 },
  { community: 'VI', name: 'Cafe Neo Sanusi Fafunwa', landmark: 'Sanusi Fafunwa', lat: 6.4302, lng: 3.4228 },
  { community: 'VI', name: 'Hard Rock Cafe VI', landmark: 'Landmark Beach', lat: 6.4255, lng: 3.4390 },
  // Oniru
  { community: 'Oniru', name: 'Novare Mall Oniru', landmark: 'Oniru Estate', lat: 6.4308, lng: 3.4502 },
  { community: 'Oniru', name: 'The Place Restaurant', landmark: 'Akin Adesola area', lat: 6.4295, lng: 3.4480 },
  { community: 'Oniru', name: 'Oniru Beach Gate', landmark: 'Beach Road', lat: 6.4270, lng: 3.4525 },
  { community: 'Oniru', name: 'Shoprite Oniru', landmark: 'Novare precinct', lat: 6.4312, lng: 3.4495 },
  // VGC
  { community: 'VGC', name: 'VGC Club House', landmark: 'Main Boulevard', lat: 6.4250, lng: 3.5350 },
  { community: 'VGC', name: 'Circle Mall VGC', landmark: 'Near Chevron Drive extension', lat: 6.4280, lng: 3.5280 },
  { community: 'VGC', name: 'Domino\'s VGC', landmark: 'Shopping strip', lat: 6.4265, lng: 3.5310 },
  { community: 'VGC', name: 'VGC Gate 1 Meeting Point', landmark: 'Main Gate', lat: 6.4235, lng: 3.5220 },
  // Chevron
  { community: 'Chevron', name: 'Chevron Toll Gate Area', landmark: 'Chevron Drive', lat: 6.4480, lng: 3.4900 },
  { community: 'Chevron', name: 'Shoprite Chevron', landmark: 'Chevron Drive', lat: 6.4510, lng: 3.4950 },
  { community: 'Chevron', name: 'Café One Chevron', landmark: 'Nearby plazas', lat: 6.4495, lng: 3.4925 },
  { community: 'Chevron', name: 'Lekki Gardens Gate', landmark: 'Off Chevron', lat: 6.4530, lng: 3.4980 },
  // Ajah
  { community: 'Ajah', name: 'Shoprite Sangotedo', landmark: 'Abraham Adesanya', lat: 6.4680, lng: 3.5800 },
  { community: 'Ajah', name: 'Ajah Bus Stop Plaza', landmark: 'Addo Road junction', lat: 6.4660, lng: 3.5650 },
  { community: 'Ajah', name: 'The Palms Ajah / Novare', landmark: 'Sangotedo', lat: 6.4700, lng: 3.5750 },
  { community: 'Ajah', name: 'Debonairs Ajah', landmark: 'Addo Road', lat: 6.4675, lng: 3.5700 },
  { community: 'Ajah', name: 'Market Square Ajah', landmark: 'Near Thomas Estate', lat: 6.4655, lng: 3.5725 },
];

async function seedMeetPoints() {
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
  console.info(`[seed] Meet points ready: ${MEET_POINTS.length}`);
}

async function seedCommunities() {
  for (const c of PHASE22_COMMUNITY_SEEDS) {
    await prisma.community.upsert({
      where: { slug: c.slug },
      create: {
        id: randomUUID(),
        slug: c.slug,
        name: c.name,
        type: c.type,
        privacy: c.privacy,
        about: c.about,
        geoLat: c.geoLat,
        geoLng: c.geoLng,
        verified: c.verified ?? false,
        active: true,
      },
      update: {
        name: c.name,
        type: c.type,
        privacy: c.privacy,
        about: c.about,
        geoLat: c.geoLat,
        geoLng: c.geoLng,
        verified: c.verified ?? false,
        active: true,
      },
    });
  }
  // eslint-disable-next-line no-console
  console.info(
    `[seed] Communities ready: ${PHASE22_COMMUNITY_SEEDS.length} PRD examples`,
  );
}

/** Marker so demo catalog upserts stay idempotent across seed runs. */
const DEMO_BRAND = 'DEMO_SEED';

const DEMO_LISTINGS: {
  title: string;
  description: string;
  categorySlug: string;
  subcategorySlug?: string;
  condition: ItemCondition;
  priceKobo: number;
  community: string;
  lat: number;
  lng: number;
  imageSeed: string;
}[] = [
  {
    title: 'IKEA Kivik 3-seater sofa',
    description:
      'Beige fabric sofa, light wear on arms. Smoke-free Lekki home. Pickup preferred.',
    categorySlug: 'home-furniture',
    subcategorySlug: 'sofas',
    condition: ItemCondition.GOOD,
    priceKobo: 185_000_00,
    community: 'Lekki',
    lat: 6.4482,
    lng: 3.4721,
    imageSeed: 'reworth-sofa',
  },
  {
    title: 'Samsung 55" 4K Smart TV',
    description:
      'Crystal UHD, wall-mount kit included. Selling ahead of move to Abuja.',
    categorySlug: 'electronics',
    subcategorySlug: 'tvs',
    condition: ItemCondition.LIKE_NEW,
    priceKobo: 320_000_00,
    community: 'Ikoyi',
    lat: 6.4508,
    lng: 3.4352,
    imageSeed: 'reworth-tv',
  },
  {
    title: 'iPhone 13 128GB — Midnight',
    description:
      'Battery health 89%. Face ID works. Box + cable. No trades.',
    categorySlug: 'phones-tablets',
    subcategorySlug: 'smartphones',
    condition: ItemCondition.GOOD,
    priceKobo: 295_000_00,
    community: 'Victoria Island',
    lat: 6.4288,
    lng: 3.4215,
    imageSeed: 'reworth-phone',
  },
  {
    title: 'MacBook Air M1 8/256',
    description:
      'Personal use only. Charger included. Minor scuff near ports.',
    categorySlug: 'computers',
    subcategorySlug: 'laptops',
    condition: ItemCondition.GOOD,
    priceKobo: 410_000_00,
    community: 'Oniru',
    lat: 6.4308,
    lng: 3.4502,
    imageSeed: 'reworth-laptop',
  },
  {
    title: 'Hisense 200L fridge',
    description: 'Working perfectly. Moving sale — must go this weekend.',
    categorySlug: 'home-appliances',
    subcategorySlug: 'kitchen',
    condition: ItemCondition.GOOD,
    priceKobo: 95_000_00,
    community: 'VGC',
    lat: 6.425,
    lng: 3.535,
    imageSeed: 'reworth-fridge',
  },
  {
    title: 'Dining table + 4 chairs',
    description: 'Solid wood set. Chairs recently reupholstered.',
    categorySlug: 'home-furniture',
    subcategorySlug: 'tables-desks',
    condition: ItemCondition.GOOD,
    priceKobo: 140_000_00,
    community: 'Chevron',
    lat: 6.448,
    lng: 3.49,
    imageSeed: 'reworth-dining',
  },
  {
    title: 'PS5 Disc + DualSense',
    description: 'Console + 1 pad + FIFA. No box. Meet at Circle Mall.',
    categorySlug: 'electronics',
    subcategorySlug: 'gaming',
    condition: ItemCondition.LIKE_NEW,
    priceKobo: 380_000_00,
    community: 'Ajah',
    lat: 6.466,
    lng: 3.565,
    imageSeed: 'reworth-ps5',
  },
  {
    title: 'Baby stroller — Chicco',
    description: 'Used for 8 months. Clean, folds flat. Give-away price.',
    categorySlug: 'children-baby',
    subcategorySlug: 'strollers',
    condition: ItemCondition.GOOD,
    priceKobo: 45_000_00,
    community: 'Lekki',
    lat: 6.449,
    lng: 3.475,
    imageSeed: 'reworth-stroller',
  },
  {
    title: 'Men’s Nike Air Force 1 — 43',
    description: 'Worn twice. White/white. Receipt available.',
    categorySlug: 'fashion',
    subcategorySlug: 'shoes',
    condition: ItemCondition.LIKE_NEW,
    priceKobo: 55_000_00,
    community: 'Ikoyi',
    lat: 6.452,
    lng: 3.438,
    imageSeed: 'reworth-sneakers',
  },
  {
    title: 'Standing fan — Ox',
    description: 'Quiet motor. Remote included. Moving out of estate.',
    categorySlug: 'home-appliances',
    subcategorySlug: 'cooling',
    condition: ItemCondition.GOOD,
    priceKobo: 22_000_00,
    community: 'Victoria Island',
    lat: 6.43,
    lng: 3.424,
    imageSeed: 'reworth-fan',
  },
  {
    title: 'Office swivel chair',
    description: 'Ergonomic mesh back. Slight armrest wear.',
    categorySlug: 'home-furniture',
    subcategorySlug: 'storage',
    condition: ItemCondition.FAIR,
    priceKobo: 35_000_00,
    community: 'Oniru',
    lat: 6.432,
    lng: 3.451,
    imageSeed: 'reworth-chair',
  },
  {
    title: 'Canon EOS 2000D + kit lens',
    description: 'Hobby camera. ~4k shutter. Bag included.',
    categorySlug: 'electronics',
    subcategorySlug: 'cameras',
    condition: ItemCondition.GOOD,
    priceKobo: 175_000_00,
    community: 'VGC',
    lat: 6.426,
    lng: 3.532,
    imageSeed: 'reworth-camera',
  },
  {
    title: 'Queen mattress — 6 inch',
    description: 'Orthopaedic foam. Clean cover. Buyer collects.',
    categorySlug: 'home-furniture',
    subcategorySlug: 'beds',
    condition: ItemCondition.GOOD,
    priceKobo: 70_000_00,
    community: 'Chevron',
    lat: 6.45,
    lng: 3.492,
    imageSeed: 'reworth-mattress',
  },
  {
    title: 'iPad 9th gen 64GB Wi‑Fi',
    description: 'Pencil marks on case only. Screen protector on.',
    categorySlug: 'phones-tablets',
    subcategorySlug: 'tablets',
    condition: ItemCondition.LIKE_NEW,
    priceKobo: 210_000_00,
    community: 'Ajah',
    lat: 6.468,
    lng: 3.57,
    imageSeed: 'reworth-ipad',
  },
  {
    title: 'Yamaha acoustic guitar',
    description: 'Beginner-friendly. New strings. Soft case.',
    categorySlug: 'electronics',
    subcategorySlug: 'audio',
    condition: ItemCondition.GOOD,
    priceKobo: 48_000_00,
    community: 'Lekki',
    lat: 6.447,
    lng: 3.47,
    imageSeed: 'reworth-guitar',
  },
  {
    title: 'LG 7kg washing machine',
    description: 'Front loader. Needs drain hose (included spare).',
    categorySlug: 'home-appliances',
    subcategorySlug: 'laundry',
    condition: ItemCondition.FAIR,
    priceKobo: 110_000_00,
    community: 'Ikoyi',
    lat: 6.449,
    lng: 3.433,
    imageSeed: 'reworth-washer',
  },
  {
    title: 'Women’s Ankara 2-piece — M',
    description: 'Worn once to a wedding. Dry-cleaned.',
    categorySlug: 'fashion',
    subcategorySlug: 'womens',
    condition: ItemCondition.LIKE_NEW,
    priceKobo: 18_000_00,
    community: 'Victoria Island',
    lat: 6.427,
    lng: 3.42,
    imageSeed: 'reworth-ankara',
  },
  {
    title: 'Treadmill — folding',
    description: 'Home gym clear-out. Works; belt needs wax.',
    categorySlug: 'sports-fitness',
    subcategorySlug: 'gym',
    condition: ItemCondition.FAIR,
    priceKobo: 160_000_00,
    community: 'Oniru',
    lat: 6.429,
    lng: 3.448,
    imageSeed: 'reworth-treadmill',
  },
  {
    title: 'Study desk + lamp',
    description: 'White laminate desk. LED lamp included.',
    categorySlug: 'home-furniture',
    subcategorySlug: 'tables-desks',
    condition: ItemCondition.GOOD,
    priceKobo: 42_000_00,
    community: 'VGC',
    lat: 6.424,
    lng: 3.53,
    imageSeed: 'reworth-desk',
  },
  {
    title: 'AirPods Pro (2nd gen)',
    description: 'ANC works. Tips + MagSafe case. Box gone.',
    categorySlug: 'phones-tablets',
    subcategorySlug: 'phone-accessories',
    condition: ItemCondition.GOOD,
    priceKobo: 125_000_00,
    community: 'Chevron',
    lat: 6.451,
    lng: 3.495,
    imageSeed: 'reworth-airpods',
  },
  {
    title: 'Kids bicycle 16"',
    description: 'Training wheels removable. Helmet free.',
    categorySlug: 'children-baby',
    subcategorySlug: 'toys',
    condition: ItemCondition.GOOD,
    priceKobo: 28_000_00,
    community: 'Ajah',
    lat: 6.465,
    lng: 3.568,
    imageSeed: 'reworth-bike',
  },
];

async function seedDemoSeller() {
  const email = 'demo.seller@reworth.ng';
  const passwordHash = await argon2.hash('DemoSeller!2026', {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      phone: '+2348010999001',
      emailVerifiedAt: new Date(),
      phoneVerifiedAt: new Date(),
      passwordHash,
      status: 'ACTIVE',
      profile: {
        create: {
          displayName: 'Ada Demo',
          preferredCommunity: 'Lekki',
          language: 'en-NG',
          currency: 'NGN',
          bio: 'Lagos demo seller — seed inventory for Home rails.',
        },
      },
    },
    update: {
      passwordHash,
      status: 'ACTIVE',
      phoneVerifiedAt: new Date(),
      emailVerifiedAt: new Date(),
    },
  });

  for (const level of ['L2_EMAIL', 'L3_IDENTITY'] as const) {
    const existing = await prisma.verification.findFirst({
      where: { userId: user.id, level },
    });
    if (existing) {
      await prisma.verification.update({
        where: { id: existing.id },
        data: { status: 'VERIFIED', verifiedAt: new Date() },
      });
    } else {
      await prisma.verification.create({
        data: {
          userId: user.id,
          level,
          status: 'VERIFIED',
          verifiedAt: new Date(),
        },
      });
    }
  }

  await prisma.trustScore.upsert({
    where: { userId: user.id },
    create: {
      id: randomUUID(),
      userId: user.id,
      score: 92,
      tier: 'TRUSTED',
      completionRate: 0.94,
      avgRating: 4.8,
      medianResponseMinutes: 15,
      cancellationRate: 0.02,
      disputeRate: 0.01,
      accountAgeDays: 200,
      verificationPoints: 40,
    },
    update: {
      score: 92,
      tier: 'TRUSTED',
      computedAt: new Date(),
    },
  });

  return user.id;
}

async function seedDemoCatalog() {
  const sellerId = await seedDemoSeller();
  const existing = await prisma.listing.count({
    where: { brand: DEMO_BRAND, status: ListingStatus.LIVE },
  });
  if (existing >= DEMO_LISTINGS.length) {
    // eslint-disable-next-line no-console
    console.info(
      `[seed] Demo catalog already present (${existing} LIVE) — skipping`,
    );
    return;
  }

  // Remove partial demo rows so re-seed is clean
  await prisma.listing.deleteMany({ where: { brand: DEMO_BRAND } });

  const parents = await prisma.category.findMany({
    where: { parentId: null },
    include: { children: true },
  });
  const bySlug = new Map(parents.map((p) => [p.slug, p]));

  const now = Date.now();
  for (let i = 0; i < DEMO_LISTINGS.length; i++) {
    const d = DEMO_LISTINGS[i];
    const cat = bySlug.get(d.categorySlug);
    if (!cat) continue;
    const sub =
      d.subcategorySlug != null
        ? cat.children.find((c) => c.slug === d.subcategorySlug) ?? null
        : null;
    const listingId = randomUUID();
    const publishedAt = new Date(now - i * 3_600_000);
    const imgUrl = `https://picsum.photos/seed/${d.imageSeed}/640/640`;

    await prisma.listing.create({
      data: {
        id: listingId,
        sellerId,
        title: d.title,
        description: d.description,
        categoryId: cat.id,
        subcategoryId: sub?.id ?? null,
        brand: DEMO_BRAND,
        condition: d.condition,
        priceKobo: d.priceKobo,
        originalPriceKobo: Math.round(d.priceKobo * 1.12),
        negotiable: true,
        sellingMode: SellingMode.SELL,
        status: ListingStatus.LIVE,
        community: d.community,
        city: 'Lagos',
        geoLat: d.lat,
        geoLng: d.lng,
        fulfilmentPickup: true,
        fulfilmentMeet: true,
        fulfilmentDelivery: i % 3 === 0,
        publishedAt,
        expiresAt: new Date(publishedAt.getTime() + 21 * 86_400_000),
        views: 12 + i * 7,
        images: {
          create: {
            sortOrder: 0,
            originalKey: `demo/${d.imageSeed}.jpg`,
            mime: 'image/jpeg',
            width: 640,
            height: 640,
            status: 'READY',
            exifStripped: true,
            variants: {
              original: imgUrl,
              w640: { webp: imgUrl },
              w1080: { webp: imgUrl },
            },
          },
        },
      },
    });
  }

  // eslint-disable-next-line no-console
  console.info(
    `[seed] Demo catalog ready: ${DEMO_LISTINGS.length} LIVE Lagos listings (seller Ada Demo)`,
  );
}

async function main() {
  await seedAdmin();
  await seedCategories();
  await seedChatScanRules();
  await seedMeetPoints();
  await seedCommunities();
  await seedRiskAndModeration(prisma);
  await seedDemoCatalog();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
