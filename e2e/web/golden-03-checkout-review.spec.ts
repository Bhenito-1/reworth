/**
 * Golden 03 — order initiate → mock pay → hand over → confirm → review.
 */
import { expect, test } from '@playwright/test';
import {
  API_BASE,
  DEMO,
  authHeaders,
  jsonOrThrow,
  login,
  skipUnlessApiUp,
} from './helpers';

test.describe('golden-03 checkout review', () => {
  test('buy now → mock pay → hand over → confirm → review', async ({
    request,
  }) => {
    await skipUnlessApiUp(request);

    const seller = await login(
      request,
      DEMO.seller.email,
      DEMO.seller.password,
    );
    const buyer = await login(
      request,
      DEMO.buyer.email,
      DEMO.buyer.password,
    );
    const sellerHeaders = authHeaders(seller.accessToken);
    const buyerHeaders = authHeaders(buyer.accessToken);

    const catsRes = await request.get(`${API_BASE}/categories`, {
      headers: sellerHeaders,
    });
    const cats = await jsonOrThrow<{ id: string; slug: string }[]>(
      catsRes,
      'categories',
    );
    const cat = cats.find((c) => c.slug === 'home-appliances') ?? cats[0];

    const createRes = await request.post(`${API_BASE}/listings`, {
      headers: sellerHeaders,
      data: {
        title: `E2E Checkout Item ${Date.now()}`,
        description: 'Blender for golden-03 checkout path.',
        categoryId: cat!.id,
        condition: 'VERY_GOOD',
        priceKobo: 18_000_00,
        community: 'Lekki',
      },
    });
    const draft = await jsonOrThrow<{ id: string }>(createRes, 'create');
    const pubRes = await request.post(
      `${API_BASE}/listings/${draft.id}/publish`,
      { headers: sellerHeaders },
    );
    const listing = await jsonOrThrow<{ id: string; status: string }>(
      pubRes,
      'publish',
    );
    test.skip(
      listing.status !== 'LIVE',
      `listing not LIVE (${listing.status})`,
    );

    const orderRes = await request.post(`${API_BASE}/orders`, {
      headers: buyerHeaders,
      data: {
        listingId: listing.id,
        fulfilmentMethod: 'PICKUP',
        buyNow: true,
      },
    });
    const order = await jsonOrThrow<{ id: string; status: string }>(
      orderRes,
      'create order',
    );
    expect(order.status).toBe('PAYMENT_PENDING');

    const payRes = await request.post(`${API_BASE}/payments/initiate`, {
      headers: buyerHeaders,
      data: {
        orderId: order.id,
        idempotencyKey: `e2e-pay-${order.id}`,
      },
    });
    const payment = await jsonOrThrow<{ id: string; reference: string }>(
      payRes,
      'initiate payment',
    );
    expect(payment.reference).toBeTruthy();

    const hookRes = await request.post(`${API_BASE}/webhooks/mock-psp`, {
      data: { reference: payment.reference, event: 'charge.success' },
    });
    expect(hookRes.ok(), await hookRes.text()).toBeTruthy();

    const handRes = await request.post(
      `${API_BASE}/orders/${order.id}/handed-over`,
      { headers: sellerHeaders },
    );
    expect(handRes.ok(), await handRes.text()).toBeTruthy();

    const confirmRes = await request.post(
      `${API_BASE}/orders/${order.id}/confirm-receipt`,
      { headers: buyerHeaders },
    );
    expect(confirmRes.ok(), await confirmRes.text()).toBeTruthy();

    const reviewPayload = {
      overall: 5,
      accuracy: 5,
      communication: 5,
      punctuality: 4,
      transactionExperience: 5,
      body: 'Smooth pickup — golden-03',
    };

    const buyerReview = await request.post(
      `${API_BASE}/orders/${order.id}/reviews`,
      { headers: buyerHeaders, data: reviewPayload },
    );
    const published = await jsonOrThrow<{ status: string }>(
      buyerReview,
      'buyer review',
    );
    expect(published.status).toBe('PUBLISHED');

    const sellerReview = await request.post(
      `${API_BASE}/orders/${order.id}/reviews`,
      {
        headers: sellerHeaders,
        data: { ...reviewPayload, body: 'Great buyer — golden-03' },
      },
    );
    expect(sellerReview.status()).toBe(403);
  });
});
