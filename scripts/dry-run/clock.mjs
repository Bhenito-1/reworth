#!/usr/bin/env node
/**
 * Time machine for manual testing (run via scripts/dry-run/clock.sh).
 * Moves an order's clock in the dry-run database, then runs the same
 * background job the server runs on a timer, so you can watch the result in
 * the web app / admin without waiting days.
 */
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const apiRoot = join(repo, 'apps/api');
const require = createRequire(join(apiRoot, 'package.json'));
const PSP = process.env.PAYMENTS_PROVIDER ?? 'mock';
const API = 'http://localhost:3101/api/v1';

const [cmd = 'help', arg, ...rest] = process.argv.slice(2);
const flags = new Set(rest.concat(arg?.startsWith('--') ? [arg] : []));

const HELP = `
Usage: bash scripts/dry-run/clock.sh <command> [order-ref]

  orders                     Recent orders: reference, status, money state
  receive-silently <ref>     Buyer never confirms: 3 days pass after handover,
                             the order counts as received, protection starts
  end-cover <ref>            The 7-day buyer-protection window ends now, then
                             the payout job runs (seller gets paid)
  end-cover <ref> --fail-transfer
                             Same, but the bank transfer is refused (as if the
                             Paystack balance were empty) -> "Retry payout"
  expire <ref>               24h pass with no payment, then the expiry job runs
  jobs                       Run every money job once (auto-receive, payouts
                             after cover, unpaid expiry, payout reconciliation)
  refund-sync <ref>          Paystack mode: read the refund status from Paystack
                             and deliver it to the app as a signed webhook
  alerts                     Open finance alerts (also on Admin > Finance)

<ref> is the order reference shown on the order page (RW-ORD-...).
Current payment mode: ${PSP}
`;
if (cmd === 'help' || cmd === '--help') {
  console.log(HELP);
  process.exit(0);
}

const env = {};
for (const raw of readFileSync(join(repo, '.env'), 'utf8').split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith('#') || !line.includes('=')) continue;
  const i = line.indexOf('=');
  env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
}

const { NestFactory } = require('@nestjs/core');
const { AppModule } = require(join(apiRoot, 'dist/app.module.js'));
const { OrdersService } = require(join(apiRoot, 'dist/orders/orders.service.js'));
const { PrismaService } = require(join(apiRoot, 'dist/prisma/prisma.service.js'));
const { PspRejectedError } = require(join(apiRoot, 'dist/providers/payment.provider.js'));
const ctx = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
const prisma = ctx.get(PrismaService);
const orders = ctx.get(OrdersService);

const naira = (k) => `₦${((k ?? 0) / 100).toLocaleString('en-NG')}`;
async function findOrder(ref) {
  if (!ref) throw new Error('Give an order reference, e.g. RW-ORD-ABC123 (see: clock.sh orders)');
  const r = ref.trim();
  const order = await prisma.order.findFirst({
    where: { OR: [{ reference: r.toUpperCase() }, ...(r.length === 36 ? [{ id: r }] : [])] },
    include: { payouts: true, refunds: true, payments: true, listing: { select: { title: true } } },
  });
  if (!order) throw new Error(`No order ${r}`);
  return order;
}
async function show(ref, label) {
  const o = await findOrder(ref);
  const pay = o.payments.find((p) => p.id === o.paymentId) ?? o.payments[0];
  console.log(`${label ? `${label}\n` : ''}  ${o.reference}  ${o.listing?.title ?? ''}`);
  console.log(`  order status:   ${o.status}`);
  console.log(`  payment:        ${pay ? `${pay.status} ${naira(pay.amountKobo)}` : 'none'}`);
  if (o.coverageEndsAt) console.log(`  protection to:  ${o.coverageEndsAt.toISOString()}`);
  for (const p of o.payouts) {
    console.log(`  payout:         ${p.status} ${naira(p.netKobo)} ${p.pspReference ?? ''} ${p.failureReason ?? ''}`);
  }
  for (const r of o.refunds) console.log(`  refund:         ${r.status} ${naira(r.amountKobo)} (${r.reason ?? ''})`);
}

try {
  switch (cmd) {
    case 'orders': {
      const rows = await prisma.order.findMany({
        orderBy: { createdAt: 'desc' },
        take: 15,
        include: { payouts: true, refunds: true, listing: { select: { title: true } } },
      });
      for (const o of rows) {
        const money = [
          o.payouts[0] ? `payout ${o.payouts[0].status}` : '',
          o.refunds[0] ? `refund ${o.refunds[0].status}` : '',
        ].filter(Boolean).join(', ');
        console.log(
          `${o.reference.padEnd(20)} ${o.status.padEnd(16)} ${naira(o.totalKobo).padStart(12)}  ${(o.listing?.title ?? '').slice(0, 30).padEnd(30)} ${money}`,
        );
      }
      break;
    }
    case 'receive-silently': {
      const o = await findOrder(arg);
      if (!['SHIPPED', 'HANDED_OVER', 'DELIVERED'].includes(o.status)) {
        throw new Error(`Order is ${o.status}; the seller has to mark it handed over first.`);
      }
      await prisma.order.update({ where: { id: o.id }, data: { autoReleaseAt: new Date(Date.now() - 60_000) } });
      await orders.autoReleaseDue();
      await show(arg, 'Buyer stayed silent past the auto-receive time:');
      break;
    }
    case 'end-cover': {
      const o = await findOrder(arg);
      if (o.status !== 'RECEIVED') {
        throw new Error(`Order is ${o.status}; it must be RECEIVED (buyer confirmed, or receive-silently).`);
      }
      await prisma.order.update({ where: { id: o.id }, data: { coverageEndsAt: new Date(Date.now() - 60_000) } });
      const psp = orders.psp;
      const real = psp.release.bind(psp);
      if (flags.has('--fail-transfer')) {
        psp.release = async () => {
          throw new PspRejectedError('Paystack release failed: 400 Your balance is not enough to fulfil this request');
        };
      }
      try {
        await orders.releaseAfterCover();
      } finally {
        psp.release = real;
      }
      await show(arg, 'Buyer protection ended; payout job ran:');
      break;
    }
    case 'expire': {
      const o = await findOrder(arg);
      if (o.status !== 'PAYMENT_PENDING') throw new Error(`Order is ${o.status}; only unpaid orders expire.`);
      await prisma.order.update({ where: { id: o.id }, data: { createdAt: new Date(Date.now() - 25 * 3_600_000) } });
      await prisma.orderEvent.updateMany({
        where: { orderId: o.id, type: 'CONFIRMED' },
        data: { createdAt: new Date(Date.now() - 25 * 3_600_000) },
      });
      await orders.expireUnpaid();
      await show(arg, '25 hours passed without payment; expiry job ran:');
      break;
    }
    case 'jobs': {
      console.log('auto-receive:        ', await orders.autoReleaseDue());
      console.log('payouts after cover: ', await orders.releaseAfterCover());
      console.log('unpaid expiry:       ', await orders.expireUnpaid());
      console.log('payout reconcile:    ', await orders.reconcileProcessingPayouts());
      break;
    }
    case 'refund-sync': {
      if (PSP !== 'paystack') throw new Error('Mock refunds settle instantly; refund-sync is for Paystack mode.');
      const o = await findOrder(arg);
      for (const refund of o.refunds) {
        const pay = o.payments.find((p) => p.id === refund.paymentId);
        const trail = (pay?.providerPayload?.refunds ?? []).find((t) => t.refundId === refund.id);
        if (!trail?.providerRef) {
          console.log(`refund ${refund.id}: no Paystack refund id`);
          continue;
        }
        const res = await fetch(`https://api.paystack.co/refund/${trail.providerRef}`, {
          headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` },
        });
        const body = await res.json().catch(() => null);
        const st = body?.data?.status ?? `http ${res.status}`;
        console.log(`Paystack refund ${trail.providerRef}: ${st}`);
        if (!['processed', 'failed', 'needs-attention'].includes(st)) {
          console.log('  still in progress at Paystack; nothing to deliver yet.');
          continue;
        }
        const raw = JSON.stringify({
          event: `refund.${st}`,
          data: {
            id: Number(trail.providerRef) || trail.providerRef,
            status: st,
            transaction_reference: pay.reference,
            amount: String(refund.amountKobo),
            currency: 'NGN',
          },
        });
        const secret = env.PAYSTACK_WEBHOOK_SECRET || env.PAYSTACK_SECRET_KEY;
        const sig = createHmac('sha512', secret).update(raw).digest('hex');
        const w = await fetch(`${API}/webhooks/paystack`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-paystack-signature': sig },
          body: raw,
        });
        console.log(`  delivered refund.${st} webhook → ${w.status}`);
      }
      await show(arg);
      break;
    }
    case 'alerts': {
      const rows = await prisma.financeAlert.findMany({
        where: { resolvedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      if (!rows.length) console.log('No open finance alerts.');
      for (const a of rows) console.log(`${a.createdAt.toISOString()} [${a.severity}] ${a.kind}: ${a.message}`);
      break;
    }
    default:
      console.log(HELP);
      process.exitCode = 1;
  }
} catch (err) {
  console.error(`\n  ${err.message}\n`);
  process.exitCode = 1;
} finally {
  await ctx.close();
}
