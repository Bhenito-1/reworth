import {
  estimateFromStreetAnchors,
  normalizeStreetKey,
  parseHouseNumber,
} from './street-key';

describe('street-key', () => {
  it('normalizeStreetKey strips house number', () => {
    expect(normalizeStreetKey('11 Bariga Road')).toBe('bariga road');
    expect(normalizeStreetKey('20, Bariga Road')).toBe('bariga road');
  });

  it('parseHouseNumber', () => {
    expect(parseHouseNumber('11 Bariga Road')).toBe(11);
    expect(parseHouseNumber('Bariga Road')).toBeNull();
  });

  it('interpolates between two anchors', () => {
    const est = estimateFromStreetAnchors(
      20,
      [
        { houseNumber: 11, lat: 6.53, lng: 3.39 },
        { houseNumber: 30, lat: 6.531, lng: 3.391 },
      ],
      null,
    );
    expect(est).not.toBeNull();
    expect(est!.lat).toBeGreaterThan(6.53);
    expect(est!.lat).toBeLessThan(6.531);
  });
});