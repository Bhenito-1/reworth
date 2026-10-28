import { Prisma } from '@prisma/client';

/** Shoppers only see listings from accounts that can still trade. */
export const activeSellerWhere: Prisma.ListingWhereInput = {
  seller: { status: 'ACTIVE' },
};
