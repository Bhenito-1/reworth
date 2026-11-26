/** Stable address kinds — do not rely on runtime `AddressKind` from an outdated Prisma client. */
export const ADDRESS_KIND = {
  PICKUP: 'PICKUP',
  DELIVERY: 'DELIVERY',
} as const;

export type AddressKindValue = (typeof ADDRESS_KIND)[keyof typeof ADDRESS_KIND];
