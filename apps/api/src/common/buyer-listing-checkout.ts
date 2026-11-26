import { ConflictException } from '@nestjs/common';
import type { Listing, PrismaClient } from '@prisma/client';
import { tracksQuantity } from '../inventory/inventory.service';

type CheckoutStock = Pick<
  Listing,
  | 'id'
  | 'status'
  | 'quantityAvailable'
  | 'quantityReserved'
  | 'quantityTotal'
  | 'quantitySold'
>;

/** Buyer may propose or accept meetup while checkout is in progress (offer reserve). */
export async function assertBuyerCanMeetupOnListing(
  prisma: Pick<PrismaClient, 'offer' | 'orderIntent'>,
  listing: Pick<Listing, 'id' | 'status'>,
  buyerId: string,
): Promise<void> {
  if (listing.status === 'LIVE') return;
  if (listing.status !== 'RESERVED') {
    throw new ConflictException('Listing is not available');
  }
  const now = new Date();
  const [acceptedOffer, pendingIntent] = await Promise.all([
    prisma.offer.findFirst({
      where: { listingId: listing.id, buyerId, status: 'ACCEPTED' },
      select: { id: true },
    }),
    prisma.orderIntent.findFirst({
      where: {
        listingId: listing.id,
        buyerId,
        status: 'PENDING',
        reservedUntil: { gt: now },
      },
      select: { id: true },
    }),
  ]);
  if (!acceptedOffer && !pendingIntent) {
    throw new ConflictException('Listing is not available');
  }
}

export async function negotiatedUnitKoboForBuyer(
  prisma: Pick<PrismaClient, 'offer'>,
  listingId: string,
  buyerId: string,
  listPriceKobo: number,
): Promise<{ amountKobo: number; offerId: string | null }> {
  const offer = await prisma.offer.findFirst({
    where: { listingId, buyerId, status: 'ACCEPTED' },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, amountKobo: true },
  });
  if (!offer) {
    return { amountKobo: listPriceKobo, offerId: null };
  }
  return { amountKobo: offer.amountKobo, offerId: offer.id };
}

/** Whether this buyer may still check out on a RESERVED listing (accepted offer / intent). */
export async function buyerCanCheckoutOnListing(
  prisma: Pick<PrismaClient, 'offer' | 'orderIntent'>,
  listing: Pick<Listing, 'id' | 'status'>,
  buyerId: string,
): Promise<boolean> {
  if (listing.status === 'LIVE') return true;
  if (listing.status !== 'RESERVED') return false;
  try {
    await assertBuyerCanMeetupOnListing(prisma, listing, buyerId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Units this buyer may still place on a new order. Returns 0 when they should
 * pay an existing unpaid order instead (`openOrderId` set).
 */
export async function buyerCheckoutUnitCap(
  prisma: Pick<PrismaClient, 'offer' | 'orderIntent' | 'order'>,
  listing: CheckoutStock,
  buyerId: string,
  opts: { negotiated: boolean },
): Promise<{ cap: number; openOrderId: string | null }> {
  const openOrder = await prisma.order.findFirst({
    where: {
      listingId: listing.id,
      buyerId,
      status: { in: ['CREATED', 'PAYMENT_PENDING'] },
    },
    select: { id: true },
    orderBy: { createdAt: 'desc' },
  });
  if (openOrder) {
    return { cap: 0, openOrderId: openOrder.id };
  }

  let available = listing.quantityAvailable ?? 0;
  if (tracksQuantity(listing)) {
    const total = listing.quantityTotal ?? 0;
    const sold = listing.quantitySold ?? 0;
    const reserved = listing.quantityReserved ?? 0;
    const expected = Math.max(0, total - sold - reserved);
    if (expected > available) available = expected;
  }

  if (available >= 1) {
    return { cap: available, openOrderId: null };
  }

  if (!opts.negotiated) {
    return { cap: available, openOrderId: null };
  }

  const lane = await buyerCanCheckoutOnListing(prisma, listing, buyerId);
  if (!lane) {
    return { cap: available, openOrderId: null };
  }

  // Accepted-offer reserve: status RESERVED without moving quantityReserved yet.
  const reserved = listing.quantityReserved ?? 0;
  if (available < 1 && reserved < 1 && listing.status === 'RESERVED') {
    return { cap: Math.min(listing.quantityTotal ?? 1, 1), openOrderId: null };
  }

  return { cap: available, openOrderId: null };
}