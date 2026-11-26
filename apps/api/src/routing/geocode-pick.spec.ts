import { pickOrsGeocodeCandidate } from './geocode-pick';

const barigaFocus = { lat: 6.518, lng: 3.395 };

describe('pickOrsGeocodeCandidate', () => {
  it('prefers Bariga Ilaje over Ikeja homonym', () => {
    const picked = pickOrsGeocodeCandidate(
      [
        {
          label: 'Ilaje Road, Ikeja, Lagos, Nigeria',
          lat: 6.601,
          lng: 3.351,
        },
        {
          label: 'Ilaje Waterfront Jetty Terminal, Bariga, Lagos',
          lat: 6.528374,
          lng: 3.399983,
        },
      ],
      barigaFocus,
      { community: 'Bariga', maxKmFromFocus: 6 },
    );
    expect(picked?.label).toContain('Bariga');
    expect(picked?.lat).toBeCloseTo(6.528, 2);
  });

  it('rejects Lekki homonym when community is Bariga', () => {
    const picked = pickOrsGeocodeCandidate(
      [
        {
          label: 'Olarenwaju Ninalowo Crescent, Lekki, Lagos',
          lat: 6.44,
          lng: 3.47,
        },
        {
          label: 'Chemist Bus Stop, Bariga, Lagos',
          lat: 6.519,
          lng: 3.392,
        },
      ],
      barigaFocus,
      { community: 'Bariga', maxKmFromFocus: 6 },
    );
    expect(picked?.label.toLowerCase()).not.toContain('lekki');
  });
});
