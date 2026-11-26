#!/usr/bin/env node
/**
 * ReWorth payments dry run — scenario runner.
 *
 *   node scripts/dry-run/runner.mjs --psp mock|paystack
 *
 * Run by run.sh with cwd = apps/api and the dry-run env exported.
 * - User actions go through the real HTTP API (API_BASE).
 * - Time jumps (cover window over, unpaid for 25h) edit the dry-run DB, then
 *   call the same service methods the schedulers call, via a Nest
 *   application context built from apps/api/dist.
 * - Paystack mode: real test-mode calls. Card payments are completed in a
 *   browser (the runner waits, see out/pending-payment.json). Paystack cannot
 *   reach localhost, so refund outcomes are read from Paystack and relayed to
 *   the API as signed webhooks — only real terminal statuses are relayed.
 */
import { createHmac, randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const apiRoot = join(repo, 'apps/api');
const OUT = join(here, 'out');
mkdirSync(OUT, { recursive: true });
const require = createRequire(join(apiRoot, 'package.json'));

const pspArg = process.argv.find((a) => a.startsWith('--psp='));
const PSP = (
  pspArg ? pspArg.split('=')[1] : process.argv[process.argv.indexOf('--psp') + 1] ?? 'mock'
).toLowerCase();
const API = process.env.DRYRUN_API_BASE ?? 'http://localhost:3101/api/v1';
const WEB = process.env.DRYRUN_WEB_BASE ?? 'http://localhost:3100';
const ADMIN_WEB = process.env.DRYRUN_ADMIN_BASE ?? 'http://localhost:3102';
const PAY_WAIT_MS = Number(process.env.DRYRUN_PAY_WAIT_MS ?? 20 * 60_000);

// Root .env, read without printing (Paystack secret for signing relayed webhooks).
const rootEnv = {};
for (const raw of readFileSync(join(repo, '.env'), 'utf8').split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith('#') || !line.includes('=')) continue;
  const i = line.indexOf('=');
  let v = line.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  rootEnv[line.slice(0, i).trim()] = v;
}
const env = (k) => process.env[k] ?? rootEnv[k] ?? '';

// ---------- reporting ----------
const results = [];
let current = null;
const status = (s) =>
  writeFileSync(join(OUT, 'status.txt'), `${new Date().toISOString()} [${PSP}] ${s}\n`);
const log = (...a) => {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${a.join(' ')}`;
  console.log(line);
  appendFileSync(join(OUT, `runner-${PSP}.log`), line + '\n');
};
async function scenario(id, title, fn) {
  current = { id, title, steps: [], ok: true, error: null, notes: [] };
  results.push(current);
  status(`running ${id} ${title}`);
  log(`=== ${id} ${title}`);
  try {
    if (id !== 'S0' && ori) await refreshTokens();
    await fn();
  } catch (err) {
    current.ok = false;
    current.error = err?.stack?.split('\n').slice(0, 4).join(' | ') ?? String(err);
    log(`!!! ${id} aborted: ${err?.message ?? err}`);
  }
  log(`=== ${id} ${current.ok ? 'PASS' : 'FAIL'}`);
}
function check(name, cond, detail = '') {
  const ok = Boolean(cond);
  current.steps.push({ name, ok, detail: String(detail ?? '').slice(0, 400) });
  if (!ok) current.ok = false;
  log(`${ok ? '  ok ' : '  XX '} ${name}${detail ? ` — ${String(detail).slice(0, 300)}` : ''}`);
  return ok;
}
const note = (s) => {
  current.notes.push(s);
  log(`  .. ${s}`);
};
function must(name, cond, detail) {
  if (!check(name, cond, detail)) throw new Error(`required step failed: ${name}`);
}

// ---------- HTTP ----------
async function api(method, path, { token, body, headers = {}, raw } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body !== undefined || raw !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}
const brief = (r) =>
  `${r.status} ${typeof r.body === 'string' ? r.body.slice(0, 200) : JSON.stringify(r.body)?.slice(0, 220)}`;
const okStatus = (r) => r.status >= 200 && r.status < 300;
const idem = (p) => `${p}_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Nest context (DB + scheduler ticks) ----------
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require(join(apiRoot, 'dist/app.module.js'));
const { OrdersService } = require(join(apiRoot, 'dist/orders/orders.service.js'));
const { PrismaService } = require(join(apiRoot, 'dist/prisma/prisma.service.js'));
const { PspRejectedError } = require(join(apiRoot, 'dist/providers/payment.provider.js'));

log(`dry run psp=${PSP} api=${API}`);
const ctx = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
const prisma = ctx.get(PrismaService);
const orders = ctx.get(OrdersService);

// ---------- fixtures ----------
const ORI = { email: 'ori@demo.reworth.ng', password: 'DemoOri!2026' };
const AYO = { email: 'ayo@demo.reworth.ng', password: 'DemoAyo!2026' };
const ADMIN = { email: env('ADMIN_SUPER_EMAIL'), password: env('ADMIN_SUPER_PASSWORD') };
async function login(u) {
  const r = await api('POST', '/auth/login', { body: { email: u.email, password: u.password } });
  if (!okStatus(r)) throw new Error(`login ${u.email}: ${brief(r)}`);
  return r.body.accessToken;
}
async function adminLogin() {
  const r = await api('POST', '/admin/auth/login', { body: ADMIN });
  if (!okStatus(r) || !r.body.accessToken) throw new Error(`admin login: ${brief(r)}`);
  return r.body.accessToken;
}
let ori;
let ayo;
let admin;
// Access tokens are short-lived; log in again before each scenario and
// while waiting on a browser payment.
let tokensAt = 0;
async function refreshTokens(force = false) {
  if (!force && Date.now() - tokensAt < 10 * 60_000) return;
  tokensAt = Date.now();
  ori = await login(ORI);
  ayo = await login(AYO);
  admin = await adminLogin();
}
let oriId;
let categoryId;

async function newListing(priceKobo, title) {
  return prisma.listing.create({
    data: {
      sellerId: oriId,
      title: `[dry-run] ${title}`,
      description: 'Dry-run fixture listing',
      categoryId,
      priceKobo,
      negotiable: false,
      sellingMode: 'SELL',
      status: 'LIVE',
      community: 'Lekki',
      city: 'Lagos',
      geoLat: 6.4474,
      geoLng: 3.4721,
      fulfilmentDelivery: true,
      quantityTotal: 1,
      quantityAvailable: 1,
      publishedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 86_400_000),
    },
  });
}
async function buy(listing) {
  const r = await api('POST', '/orders', {
    token: ayo,
    body: {
      listingId: listing.id,
      fulfilmentMethod: 'DELIVERY',
      buyNow: true,
      toLat: 6.4541,
      toLng: 3.4316,
      deliveryAddress: '12 Dry Run Close, Ikoyi',
    },
  });
  must('buyer places order', okStatus(r), brief(r));
  return r.body;
}
const getOrder = async (id, token = ayo) => (await api('GET', `/orders/${id}`, { token })).body;
const dbOrder = (id) =>
  prisma.order.findUnique({
    where: { id },
    include: { payouts: true, refunds: true, payments: true },
  });
async function initiate(orderId) {
  const r = await api('POST', '/payments/initiate', {
    token: ayo,
    body: { orderId, idempotencyKey: idem('pay') },
  });
  must('payment initiated', okStatus(r), brief(r));
  return r.body;
}
async function payMock(order) {
  const pay = await initiate(order.id);
  const w = await api('POST', '/webhooks/mock-psp', { body: { reference: pay.reference } });
  must('mock charge webhook accepted', okStatus(w), brief(w));
  const o = await getOrder(order.id);
  must('order FUNDED', o.status === 'FUNDED', o.status);
  return pay;
}
async function handOver(orderId) {
  const r = await api('POST', `/orders/${orderId}/handed-over`, { token: ori });
  must('seller hands over (SHIPPED)', okStatus(r) && r.body.status === 'SHIPPED', brief(r));
}
async function receive(orderId) {
  const r = await api('POST', `/orders/${orderId}/confirm-receipt`, { token: ayo });
  must('buyer confirms receipt → RECEIVED', okStatus(r) && r.body.status === 'RECEIVED', brief(r));
}
async function endCover(orderId) {
  await prisma.order.update({
    where: { id: orderId },
    data: { coverageEndsAt: new Date(Date.now() - 60_000) },
  });
}
function verifyBank() {
  return api('POST', '/sellers/payout-account/verify', {
    token: ori,
    body: {
      accountNumber: '0123456789',
      bankCode: '058',
      firstName: 'Adewale',
      middleName: 'Chinedu',
      lastName: 'Okonkwo',
    },
  });
}
function signPaystack(rawBody) {
  const secret =
    env('PAYSTACK_WEBHOOK_SECRET') || env('PAYSTACK_SECRET_KEY') || 'mock-webhook-secret';
  return createHmac('sha512', secret).update(rawBody).digest('hex');
}
function relayWebhook(payload) {
  const raw = JSON.stringify(payload);
  return api('POST', '/webhooks/paystack', {
    raw,
    headers: { 'x-paystack-signature': signPaystack(raw) },
  });
}
async function paystack(path) {
  const res = await fetch(`https://api.paystack.co${path}`, {
    headers: { Authorization: `Bearer ${env('PAYSTACK_SECRET_KEY')}` },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

// Paystack mode: wait for someone to pay the checkout in a browser.
async function waitForBrowserPayment(label, payment, as = 'buyer') {
  const file = join(OUT, 'pending-payment.json');
  writeFileSync(
    file,
    JSON.stringify(
      {
        label,
        url: payment.checkoutUrl,
        reference: payment.reference,
        amountKobo: payment.amountKobo,
        since: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  status(`WAITING_FOR_PAYMENT ${label} ${payment.checkoutUrl}`);
  log(`  >> pay in a browser: ${payment.checkoutUrl}`);
  const deadline = Date.now() + PAY_WAIT_MS;
  let last = null;
  let lastLogin = Date.now();
  while (Date.now() < deadline) {
    if (Date.now() - lastLogin > 5 * 60_000) {
      await refreshTokens(true);
      lastLogin = Date.now();
    }
    const r = await api('POST', '/payments/confirm', {
      token: as === 'seller' ? ori : ayo,
      body: { reference: payment.reference },
    });
    last = r;
    if (okStatus(r) && r.body?.status && r.body.status !== 'PENDING') break;
    await sleep(5000);
  }
  writeFileSync(
    file,
    JSON.stringify({ done: true, label, reference: payment.reference, at: new Date().toISOString() }),
  );
  status(`payment wait over ${label}: ${last ? brief(last) : 'none'}`);
  await refreshTokens();
  return last;
}

// ---------- setup ----------
await scenario('S0', 'Setup: health, logins, seller bank account', async () => {
  const h = await api('GET', '/healthz');
  must('API healthy', okStatus(h), brief(h));
  await refreshTokens(true);
  check('seller, buyer and admin can log in', ori && ayo && admin);
  oriId = (await prisma.user.findUnique({ where: { email: ORI.email } })).id;
  const cat =
    (await prisma.category.findFirst({ where: { slug: 'sofas' } })) ??
    (await prisma.category.findFirst({ where: { NOT: { slug: { contains: 'luxury' } } } }));
  categoryId = cat?.id ?? null;
  check('fixture category found', categoryId, cat?.slug);
  const b = await verifyBank();
  check('seller saves payout bank account', okStatus(b), brief(b));
  const verified = await prisma.sellerPayoutAccount.findUnique({ where: { userId: oriId } });
  check('payout account stored as verified', verified?.verifiedAt);
  note(
    'FINDING: /sellers/payout-account/verify saves any account as verified; no name enquiry runs (the Paystack/NIBSS adapters exist but are never called).',
  );
  if (PSP === 'paystack') {
    must(
      'Paystack key is a TEST key',
      env('PAYSTACK_SECRET_KEY').startsWith('sk_test_'),
      'refusing to run with a live key',
    );
    // Paystack signs with the secret key; a correctly signed event must get
    // past signature checks (unknown reference → 200 {ok:false}, not 401).
    const probe = await relayWebhook({
      event: 'charge.success',
      data: { reference: 'RW-PAY-DRYRUNPROBE', status: 'success' },
    });
    check('correctly signed Paystack webhook passes the signature check', probe.status !== 401, brief(probe));
  }
});

if (PSP === 'mock') {
  await scenario('M1', 'Buy → pay → handover → receive → payout only after cover', async () => {
    const listing = await newListing(150_000_00, 'Happy path sofa');
    const order = await buy(listing);
    check('order awaits payment', order.status === 'PAYMENT_PENDING', order.status);
    const p1 = await initiate(order.id);
    const p2 = await initiate(order.id);
    check(
      'second Pay click reuses the open checkout',
      p1.reference === p2.reference,
      `${p1.reference} / ${p2.reference}`,
    );
    const w = await api('POST', '/webhooks/mock-psp', { body: { reference: p1.reference } });
    must('charge webhook', okStatus(w), brief(w));
    await api('POST', '/webhooks/mock-psp', { body: { reference: p1.reference } });
    let db = await dbOrder(order.id);
    check(
      'order FUNDED once (webhook replay harmless)',
      db.status === 'FUNDED' && db.payments.filter((p) => p.status === 'SUCCESS').length === 1,
      db.status,
    );
    check(
      'order linked to the funding payment',
      db.paymentId === db.payments.find((p) => p.status === 'SUCCESS')?.id,
    );
    const l = await prisma.listing.findUnique({ where: { id: listing.id } });
    check(
      'stock moved to sold',
      l.quantitySold === 1 && l.quantityAvailable === 0,
      JSON.stringify({ a: l.quantityAvailable, s: l.quantitySold, st: l.status }),
    );
    await handOver(order.id);
    await receive(order.id);
    db = await dbOrder(order.id);
    check('no payout at receipt (held for buyer protection)', db.payouts.length === 0);
    check(
      'cover window set ~7 days out',
      db.coverageEndsAt && db.coverageEndsAt.getTime() > Date.now() + 6 * 86_400_000,
      db.coverageEndsAt?.toISOString(),
    );
    await orders.releaseAfterCover();
    check('job does not pay before cover ends', (await dbOrder(order.id)).payouts.length === 0);
    await endCover(order.id);
    await orders.releaseAfterCover();
    db = await dbOrder(order.id);
    check('order COMPLETED after cover', db.status === 'COMPLETED', db.status);
    check(
      'payout PAID for item price',
      db.payouts[0]?.status === 'PAID' && db.payouts[0]?.netKobo === order.amountKobo,
      JSON.stringify(db.payouts[0] ?? null),
    );
    check(
      'transfer reference is Paystack-format',
      /^[a-z0-9_-]{16,50}$/.test(db.payouts[0]?.pspReference ?? ''),
      db.payouts[0]?.pspReference,
    );
    const wallet = await api('GET', '/orders/wallet', { token: ori });
    check(
      'seller wallet shows it withdrawn',
      okStatus(wallet) && wallet.body.withdrawnKobo >= order.amountKobo,
      brief(wallet),
    );
    const late = await api('POST', `/orders/${order.id}/disputes`, {
      token: ayo,
      body: { reason: 'MATERIALLY_DIFFERENT' },
    });
    check('dispute after cover is refused', late.status === 409, brief(late));
  });

  await scenario('M2', 'Unpaid order: buyer cancels; another expires after 24h', async () => {
    const l1 = await newListing(20_000_00, 'Cancel before paying');
    const o1 = await buy(l1);
    await initiate(o1.id);
    const c = await api('POST', `/orders/${o1.id}/cancel`, { token: ayo, body: {} });
    check('buyer cancels unpaid order', okStatus(c) && c.body.status === 'CANCELLED', brief(c));
    const db1 = await dbOrder(o1.id);
    check(
      'open checkout closed',
      db1.payments.every((p) => p.status === 'FAILED'),
      db1.payments.map((p) => p.status).join(','),
    );
    const s1 = await prisma.listing.findUnique({ where: { id: l1.id } });
    check(
      'reserved unit released',
      s1.quantityAvailable === 1 && s1.quantityReserved === 0,
      JSON.stringify({ a: s1.quantityAvailable, r: s1.quantityReserved }),
    );

    const l2 = await newListing(20_000_00, 'Expires unpaid');
    const o2 = await buy(l2);
    const dto = await getOrder(o2.id);
    check('order shows a pay-by time', Boolean(dto.paymentDueAt), dto.paymentDueAt);
    await orders.expireUnpaid();
    check('not expired inside the window', (await dbOrder(o2.id)).status === 'PAYMENT_PENDING');
    await prisma.order.update({
      where: { id: o2.id },
      data: { createdAt: new Date(Date.now() - 25 * 3_600_000) },
    });
    await orders.expireUnpaid();
    const db2 = await dbOrder(o2.id);
    check('expired after 24h', db2.status === 'CANCELLED', db2.status);
    const ev = await prisma.orderEvent.findFirst({
      where: { orderId: o2.id, type: 'PAYMENT_EXPIRED' },
    });
    check('PAYMENT_EXPIRED event', ev);
    const s2 = await prisma.listing.findUnique({ where: { id: l2.id } });
    check(
      'stock back on sale',
      s2.quantityAvailable === 1 && s2.status === 'LIVE',
      JSON.stringify({ a: s2.quantityAvailable, st: s2.status }),
    );
  });

  await scenario('M3', 'Paid order cancelled by seller → full refund, units back', async () => {
    const listing = await newListing(80_000_00, 'Seller cancels');
    const order = await buy(listing);
    await payMock(order);
    const c = await api('POST', `/orders/${order.id}/cancel`, {
      token: ori,
      body: { reason: 'Item got damaged' },
    });
    check('seller cancels paid order', okStatus(c) && c.body.status === 'CANCELLED', brief(c));
    const db = await dbOrder(order.id);
    const funded = db.payments.find((p) => p.id === db.paymentId);
    check(
      'refund of the full charge',
      db.refunds.length === 1 && db.refunds[0].amountKobo === funded.amountKobo,
      JSON.stringify(db.refunds.map((r) => [r.amountKobo, r.status])),
    );
    check('refund settled (mock settles instantly)', db.refunds[0]?.status === 'REFUNDED', db.refunds[0]?.status);
    check('payment REFUNDED', funded.status === 'REFUNDED', funded.status);
    const l = await prisma.listing.findUnique({ where: { id: listing.id } });
    check(
      'listing LIVE again with its unit',
      l.status === 'LIVE' && l.quantityAvailable === 1 && l.quantitySold === 0,
      JSON.stringify({ st: l.status, a: l.quantityAvailable, s: l.quantitySold }),
    );
    check('order page shows refund', (await getOrder(order.id)).refunds?.length === 1);
    const again = await api('POST', `/orders/${order.id}/cancel`, { token: ori, body: {} });
    check(
      'second cancel refused, no second refund',
      again.status >= 400 && (await dbOrder(order.id)).refunds.length === 1,
      brief(again),
    );
  });

  await scenario('M4', 'Buyer cannot cancel after handover', async () => {
    const listing = await newListing(30_000_00, 'Late cancel');
    const order = await buy(listing);
    await payMock(order);
    const before = await api('GET', `/orders/${order.id}`, { token: ayo });
    check('paid order offers Cancel and refund before handover', before.body.paidCancellable === true);
    await handOver(order.id);
    const c = await api('POST', `/orders/${order.id}/cancel`, { token: ayo, body: {} });
    check('cancel refused after handover', c.status === 409, brief(c));
    check('no refund', (await dbOrder(order.id)).refunds.length === 0);
  });

  async function disputeFlow(title, resolution, amountKobo) {
    const listing = await newListing(100_000_00, title);
    const order = await buy(listing);
    await payMock(order);
    await handOver(order.id);
    await receive(order.id);
    const d = await api('POST', `/orders/${order.id}/disputes`, {
      token: ayo,
      body: { reason: 'MATERIALLY_DIFFERENT', detail: 'dry run' },
    });
    must('buyer opens dispute inside cover', okStatus(d), brief(d));
    const resp = await api('POST', `/disputes/${d.body.id}/response`, {
      token: ori,
      body: { text: 'It was as described' },
    });
    check('seller responds', okStatus(resp), brief(resp));
    await endCover(order.id);
    await orders.releaseAfterCover();
    check('job does not pay a disputed order', (await dbOrder(order.id)).payouts.length === 0);
    const r = await api('POST', `/admin/disputes/${d.body.id}/resolution`, {
      token: admin,
      body: { resolution, ...(amountKobo ? { amountKobo } : {}), note: 'dry run' },
    });
    check(`admin resolves ${resolution}`, okStatus(r), brief(r));
    return { order, listing, db: await dbOrder(order.id) };
  }

  await scenario('M5', 'Dispute PARTIAL refund comes out of seller share', async () => {
    const { order, db } = await disputeFlow('Partial dispute', 'PARTIAL_REFUND', 30_000_00);
    check(
      'buyer refunded ₦30,000',
      db.refunds.length === 1 && db.refunds[0].amountKobo === 30_000_00,
      JSON.stringify(db.refunds.map((r) => r.amountKobo)),
    );
    check(
      'seller paid ₦70,000 straight away',
      db.payouts[0]?.netKobo === order.amountKobo - 30_000_00 && db.payouts[0]?.status === 'PAID',
      JSON.stringify(db.payouts[0] ?? null),
    );
    check('order COMPLETED', db.status === 'COMPLETED', db.status);
    check(
      'payment PARTIALLY_REFUNDED',
      db.payments.find((p) => p.id === db.paymentId)?.status === 'PARTIALLY_REFUNDED',
    );
  });

  await scenario('M6', 'Dispute CANCEL → full refund, units back on sale', async () => {
    const { listing, db } = await disputeFlow('Cancel dispute', 'CANCEL');
    const funded = db.payments.find((p) => p.id === db.paymentId);
    check('order CANCELLED', db.status === 'CANCELLED', db.status);
    check(
      'full charge refunded',
      db.refunds[0]?.amountKobo === funded.amountKobo,
      JSON.stringify(db.refunds.map((r) => r.amountKobo)),
    );
    check('no payout', db.payouts.length === 0);
    const l = await prisma.listing.findUnique({ where: { id: listing.id } });
    check(
      'listing back on sale',
      l.status === 'LIVE' && l.quantityAvailable === 1,
      JSON.stringify({ st: l.status, a: l.quantityAvailable }),
    );
  });

  await scenario('M7', 'Dispute FULL refund → REFUND_ISSUED, no payout', async () => {
    const { db } = await disputeFlow('Full refund dispute', 'FULL_REFUND');
    check('order REFUND_ISSUED', db.status === 'REFUND_ISSUED', db.status);
    check('no payout', db.payouts.length === 0);
    check(
      'refund equals the charge',
      db.refunds[0]?.amountKobo === db.payments.find((p) => p.id === db.paymentId)?.amountKobo,
    );
  });

  await scenario('M8', 'Payout waits for a bank account; seller nudged once', async () => {
    const saved = await prisma.sellerPayoutAccount.findUnique({ where: { userId: oriId } });
    await prisma.sellerPayoutAccount.delete({ where: { userId: oriId } });
    try {
      const listing = await newListing(40_000_00, 'No bank account');
      const order = await buy(listing);
      await payMock(order);
      await handOver(order.id);
      await receive(order.id);
      await endCover(order.id);
      await orders.releaseAfterCover();
      await orders.releaseAfterCover();
      await orders.releaseAfterCover();
      let db = await dbOrder(order.id);
      check('no payout without bank account', db.payouts.length === 0 && db.status === 'RECEIVED', db.status);
      const nudges = await prisma.orderEvent.count({
        where: { orderId: order.id, type: 'PAYOUT_BLOCKED' },
      });
      check('seller nudged once, not every run', nudges === 1, `nudges=${nudges}`);
      const b = await verifyBank();
      check('seller adds bank account', okStatus(b), brief(b));
      await orders.releaseAfterCover();
      db = await dbOrder(order.id);
      check(
        'payout PAID after account added',
        db.payouts[0]?.status === 'PAID' && db.status === 'COMPLETED',
        JSON.stringify({ st: db.status, p: db.payouts[0]?.status }),
      );
    } finally {
      const now = await prisma.sellerPayoutAccount.findUnique({ where: { userId: oriId } });
      if (!now && saved) await prisma.sellerPayoutAccount.create({ data: saved });
    }
  });

  await scenario('M9', 'Transfer rejected → FAILED; seller retry pays once', async () => {
    const listing = await newListing(25_000_00, 'Transfer retry');
    const order = await buy(listing);
    await payMock(order);
    await handOver(order.id);
    await receive(order.id);
    await endCover(order.id);
    const psp = orders.psp;
    const realRelease = psp.release.bind(psp);
    psp.release = async () => {
      throw new PspRejectedError(
        'Paystack release failed: 400 Your balance is not enough to fulfil this request',
      );
    };
    try {
      await orders.releaseAfterCover();
    } finally {
      psp.release = realRelease;
    }
    let db = await dbOrder(order.id);
    check(
      'payout FAILED, order COMPLETED (retry button)',
      db.payouts[0]?.status === 'FAILED' && db.status === 'COMPLETED',
      JSON.stringify({ st: db.status, p: db.payouts[0] }),
    );
    const alert = await prisma.financeAlert.findFirst({
      where: { kind: 'PAYOUT_FAILED' },
      orderBy: { createdAt: 'desc' },
    });
    check('finance alerted', alert);
    const [r1, r2] = await Promise.all([
      api('POST', `/orders/${order.id}/retry-payout`, { token: ori }),
      api('POST', `/orders/${order.id}/retry-payout`, { token: ori }),
    ]);
    check(
      'double-tapped retry: one succeeds, one refused',
      [r1, r2].filter(okStatus).length === 1,
      `${brief(r1)} || ${brief(r2)}`,
    );
    db = await dbOrder(order.id);
    check(
      'payout PAID under a new reference',
      db.payouts[0]?.status === 'PAID' && /_2$/.test(db.payouts[0]?.pspReference ?? ''),
      JSON.stringify(db.payouts[0]),
    );
  });

  await scenario('M10', 'Webhook signature + boost + Seller Plus', async () => {
    const bad = await api('POST', '/webhooks/paystack', {
      raw: JSON.stringify({ event: 'charge.success', data: { reference: 'x' } }),
      headers: { 'x-paystack-signature': 'nope' },
    });
    check('unsigned webhook rejected', bad.status === 401, brief(bad));
    const listing = await newListing(10_000_00, 'Boost me');
    const b = await api('POST', '/monetization/boost', {
      token: ori,
      body: { listingId: listing.id, hours: 24, idempotencyKey: idem('boost') },
    });
    check('boost purchased (mock settles instantly)', okStatus(b) && b.body.paymentStatus === 'SUCCESS', brief(b));
    const promos = await api('GET', `/listings/${listing.id}/promotions`, { token: ori });
    check('boost active on listing', okStatus(promos) && JSON.stringify(promos.body).includes('BOOST'), brief(promos));
    const p = await api('POST', '/me/seller-plan/plus', {
      token: ori,
      body: { idempotencyKey: idem('plus') },
    });
    check('Seller Plus checkout', okStatus(p), brief(p));
    const plan = await api('GET', '/me/seller-plan', { token: ori });
    check('Seller Plus active', JSON.stringify(plan.body).includes('"PLUS"'), brief(plan));
  });

  await scenario('M11', 'Web and admin apps respond', async () => {
    for (const [name, url] of [
      ['web home', `${WEB}/`],
      ['web orders page', `${WEB}/orders`],
      ['admin', `${ADMIN_WEB}/`],
    ]) {
      try {
        const r = await fetch(url, { redirect: 'manual' });
        check(`${name} responds`, r.status < 500, `${url} → ${r.status}`);
      } catch (err) {
        check(`${name} responds`, false, `${url} → ${err.message}`);
      }
    }
  });
}

if (PSP === 'paystack') {
  let paidOrder;
  await scenario('P1', 'Real Paystack test checkout funds an order', async () => {
    const listing = await newListing(2_000_00, 'Paystack test chair');
    const order = await buy(listing);
    const pay = await initiate(order.id);
    check(
      'Paystack checkout URL returned',
      /^https:\/\/checkout\.paystack\.com\//.test(pay.checkoutUrl ?? ''),
      pay.checkoutUrl,
    );
    const again = await initiate(order.id);
    check('second Pay click reuses the Paystack checkout', again.reference === pay.reference);
    const r = await waitForBrowserPayment('P1 order payment', pay);
    must('buyer return confirms the charge with Paystack', okStatus(r) && r.body.status === 'SUCCESS', brief(r));
    const db = await dbOrder(order.id);
    check('order FUNDED', db.status === 'FUNDED', db.status);
    const v = await paystack(`/transaction/verify/${encodeURIComponent(pay.reference)}`);
    check(
      'Paystack amount matches order total',
      v.body?.data?.amount === db.totalKobo,
      `${v.body?.data?.amount} vs ${db.totalKobo}`,
    );
    const replay = await relayWebhook({
      event: 'charge.success',
      data: { reference: pay.reference, status: 'success', amount: db.totalKobo },
    });
    check(
      'signed charge.success replay accepted and harmless',
      okStatus(replay) && (await dbOrder(order.id)).status === 'FUNDED',
      brief(replay),
    );
    paidOrder = { order, pay };
  });

  await scenario('P2', 'Seller cancels → real Paystack refund', async () => {
    if (!paidOrder) throw new Error('P1 did not fund an order');
    const c = await api('POST', `/orders/${paidOrder.order.id}/cancel`, {
      token: ori,
      body: { reason: 'dry run' },
    });
    check('seller cancels paid order', okStatus(c) && c.body.status === 'CANCELLED', brief(c));
    let db = await dbOrder(paidOrder.order.id);
    const refund = db.refunds[0];
    check('refund requested at Paystack', refund, JSON.stringify(db.refunds));
    const payment = db.payments.find((p) => p.id === db.paymentId);
    const trail = payment?.providerPayload?.refunds?.[0];
    check('Paystack refund id stored', trail?.providerRef, JSON.stringify(trail));
    note(`refund row status right after request: ${refund?.status}`);
    if (!trail?.providerRef) return;
    let psStatus = null;
    const until = Date.now() + 4 * 60_000;
    while (Date.now() < until) {
      const r = await paystack(`/refund/${trail.providerRef}`);
      psStatus = r.body?.data?.status ?? `http ${r.status}`;
      if (['processed', 'failed', 'needs-attention'].includes(psStatus)) break;
      await sleep(15000);
    }
    note(`Paystack refund status: ${psStatus}`);
    if (['processed', 'failed', 'needs-attention'].includes(psStatus)) {
      const w = await relayWebhook({
        event: `refund.${psStatus}`,
        data: {
          id: Number(trail.providerRef) || trail.providerRef,
          status: psStatus,
          transaction_reference: paidOrder.pay.reference,
          amount: String(refund.amountKobo),
          currency: 'NGN',
        },
      });
      check(`refund.${psStatus} webhook applied`, okStatus(w), brief(w));
      db = await dbOrder(paidOrder.order.id);
      const want = psStatus === 'processed' ? 'REFUNDED' : psStatus === 'failed' ? 'FAILED' : 'PENDING';
      check(`refund row ${want}`, db.refunds[0]?.status === want, db.refunds[0]?.status);
    } else {
      note('Refund still pending at Paystack after 4 min; webhook path not exercised against a real status.');
    }
  });

  await scenario('P3', 'Real payout transfer after cover (Paystack test mode)', async () => {
    const listing = await newListing(1_500_00, 'Paystack payout lamp');
    const order = await buy(listing);
    const pay = await initiate(order.id);
    const r = await waitForBrowserPayment('P3 order payment', pay);
    must('order paid', okStatus(r) && r.body.status === 'SUCCESS', brief(r));
    await handOver(order.id);
    await receive(order.id);
    await endCover(order.id);
    try {
      await orders.releaseAfterCover();
    } catch (err) {
      note(`releaseAfterCover threw: ${err.message}`);
    }
    let db = await dbOrder(order.id);
    const payout = db.payouts[0];
    check('payout recorded (write-ahead)', payout, JSON.stringify(db.payouts));
    note(`payout after first attempt: ${payout?.status} ${payout?.pspReference} ${payout?.failureReason ?? ''}`);
    check('order COMPLETED', db.status === 'COMPLETED', db.status);
    if (payout?.pspReference) {
      const v = await paystack(`/transfer/verify/${encodeURIComponent(payout.pspReference)}`);
      note(
        `Paystack transfer verify: http ${v.status} status=${v.body?.data?.status ?? '-'} msg=${v.body?.message ?? ''}`,
      );
    }
    if (payout?.status === 'FAILED') {
      const rr = await api('POST', `/orders/${order.id}/retry-payout`, { token: ori });
      note(`seller retry → ${brief(rr)}`);
      db = await dbOrder(order.id);
      note(`payout after retry: ${db.payouts[0]?.status} ${db.payouts[0]?.pspReference} ${db.payouts[0]?.failureReason ?? ''}`);
      const alert = await prisma.financeAlert.findFirst({
        where: { kind: 'PAYOUT_FAILED' },
        orderBy: { createdAt: 'desc' },
      });
      check('finance alerted about the failed payout', alert, alert?.message);
    }
    if (db.payouts[0]?.status === 'PROCESSING') {
      await prisma.payout.update({
        where: { id: db.payouts[0].id },
        data: { createdAt: new Date(Date.now() - 10 * 60_000) },
      });
      const n = await orders.reconcileProcessingPayouts();
      db = await dbOrder(order.id);
      note(`reconciler settled ${n}; payout now ${db.payouts[0]?.status}`);
    }
    check('no duplicate payout rows', db.payouts.length === 1, `${db.payouts.length}`);
  });

  await scenario('P4', 'Boost paid through Paystack checkout', async () => {
    const listing = await newListing(5_000_00, 'Paystack boost');
    const b = await api('POST', '/monetization/boost', {
      token: ori,
      body: { listingId: listing.id, hours: 24, idempotencyKey: idem('boost') },
    });
    check(
      'boost pending with checkout URL',
      okStatus(b) && b.body.paymentStatus === 'PENDING' && b.body.checkoutUrl,
      brief(b),
    );
    let promos = await api('GET', `/listings/${listing.id}/promotions`, { token: ori });
    check('boost not active before payment', !JSON.stringify(promos.body).includes('BOOST'), brief(promos));
    if (!b.body?.checkoutUrl) return;
    const r = await waitForBrowserPayment(
      'P4 boost payment',
      { checkoutUrl: b.body.checkoutUrl, reference: b.body.pspReference, amountKobo: b.body.feeKobo },
      'seller',
    );
    check(
      'return page confirms boost',
      okStatus(r) && r.body.status === 'SUCCESS' && r.body.purpose === 'BOOST',
      brief(r),
    );
    promos = await api('GET', `/listings/${listing.id}/promotions`, { token: ori });
    check('boost active after payment', JSON.stringify(promos.body).includes('BOOST'), brief(promos));
  });
}

// ---------- report ----------
await ctx.close();
const passed = results.filter((r) => r.ok).length;
writeFileSync(join(OUT, `report-${PSP}.json`), JSON.stringify(results, null, 2));
let md = `## ${PSP === 'mock' ? 'Mock PSP' : 'Paystack test mode'} — ${passed}/${results.length} scenarios passed\n\n`;
for (const r of results) {
  md += `### ${r.ok ? '✅' : '❌'} ${r.id} ${r.title}\n`;
  for (const s of r.steps) {
    md += `- ${s.ok ? '✓' : '✗'} ${s.name}${s.ok || !s.detail ? '' : ` — \`${s.detail.replace(/`/g, "'")}\``}\n`;
  }
  for (const n of r.notes) md += `- ℹ ${n}\n`;
  if (r.error) md += `- **aborted:** \`${r.error.replace(/`/g, "'")}\`\n`;
  md += '\n';
}
writeFileSync(join(OUT, `report-${PSP}.md`), md);
status(`DONE ${passed}/${results.length}`);
log(`DONE ${passed}/${results.length}`);
process.exit(passed === results.length ? 0 : 1);
