import type { AddressesService } from '../addresses/addresses.service';

export function mockAddressesService(): AddressesService {
  return {
    getDefault: jest.fn().mockResolvedValue(null),
    formatLine: jest.fn(
      (row: { line1: string }) => row.line1,
    ),
    saveDeliveryFromCheckout: jest.fn().mockResolvedValue(undefined),
    parseLooseDeliveryLine: jest.fn(() => ({
      line1: 'Test street',
      community: 'Lekki',
      city: 'Lagos',
    })),
    savePickupForSeller: jest.fn(),
    toDto: jest.fn(() => null),
    listForUser: jest.fn(),
    saveDeliveryFromDto: jest.fn(),
    upsertDefault: jest.fn(),
    pickupLabel: () => 'pickup',
    deliveryLabel: () => 'delivery',
  } as unknown as AddressesService;
}
