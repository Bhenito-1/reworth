import { RoutingService } from './routing.service';
import { OpenRouteServiceClient } from './openrouteservice.client';

describe('RoutingService (no ORS key)', () => {
  const ors = {
    enabled: () => false,
    geocodeSearch: jest.fn(),
    drivingDistance: jest.fn(),
    drivingDistanceQuote: jest.fn(),
  } as unknown as OpenRouteServiceClient;

  const svc = new RoutingService(ors, undefined, undefined);

  it('drivingDistanceKm uses straight km when ORS is off and points are not stored', async () => {
    const res = await svc.drivingDistanceKm(
      { lat: 6.45, lng: 3.45 },
      { lat: 6.5, lng: 3.5 },
    );
    expect(res.source).toBe('haversine');
    expect(res.distanceKm).toBeGreaterThan(7);
    expect(res.distanceKm).toBeLessThan(9);
  });

  it('uses stored coordinates for an approximate distance when ORS is unavailable', async () => {
    const res = await svc.drivingDistanceKm(
      { lat: 6.45, lng: 3.45 },
      { lat: 6.5, lng: 3.5 },
      { fromStoredGeocodes: true },
    );
    expect(res.source).toBe('estimated');
    expect(res.distanceKm).toBeGreaterThan(7);
  });

  it('geocodeAddress returns null without ORS or community provider', async () => {
    const hit = await svc.geocodeAddress({
      line1: '12 Admiralty Way',
      community: 'LEKKI_PH1',
      city: 'Lagos',
    });
    expect(hit).toBeNull();
  });
});