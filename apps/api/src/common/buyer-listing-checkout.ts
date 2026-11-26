import { ConflictException } from '@nestjs/common';
import type { Listing, PrismaClient } from '@prisma/client';

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