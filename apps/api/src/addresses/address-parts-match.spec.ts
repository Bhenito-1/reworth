import {
  deliveryPartsMatchStored,
  storedAddressCoords,
} from './address-parts-match';

describe('address-parts-match', () => {
  it('matches normalized delivery lines', () => {
    expect(
      deliveryPartsMatchStored(
        { line1: '11 Bariga Road', community: 'Bariga', city: 'Lagos' },
        { line1: '  11 bariga road  ', community: 'bariga', city: 'Lagos' },
      ),
    ).toBe(true);
    expect(
      deliveryPartsMatchStored(
        { line1: '11, Ilaje road', community: 'Bariga', city: 'Lagos' },
        { line1: '11 Ilaje road', community: 'bariga', city: 'Lagos' },
      ),
    ).toBe(true);
    expect(
      deliveryPartsMatchStored(
        { line1: '11 Ilaje road', community: 'Bariga', city: 'Lagos' },
        {
          line1: '11 Ilaje road, block 2',
          community: 'bariga',
          city: 'Lagos',
        },
      ),
    ).toBe(true);
  });

  it('returns stored coords when present', () => {
    expect(
      storedAddressCoords({
        geoLat: 6.5,
        geoLng: 3.4,
        line1: 'x',
        community: 'y',
        city: 'Lagos',
      }),
    ).toEqual({ lat: 6.5, lng: 3.4 });
  });
});