import {
  encodeMeetupPin,
  meetupPinPreview,
  parseMeetupPin,
} from './meetup-pin';

describe('meetup-pin protocol (ADR-011 Phase C)', () => {
  it('round-trips lat/lng/label', () => {
    const raw = encodeMeetupPin({
      lat: 6.4474,
      lng: 3.4721,
      label: 'Lekki Mall gate',
    });
    const parsed = parseMeetupPin(raw);
    expect(parsed?.kind).toBe('MEETUP_PIN');
    expect(parsed?.lat).toBeCloseTo(6.4474, 4);
    expect(parsed?.lng).toBeCloseTo(3.4721, 4);
    expect(parsed?.label).toBe('Lekki Mall gate');
    expect(meetupPinPreview(raw)).toBe('Meetup pin · Lekki Mall gate');
  });

  it('rejects invalid body', () => {
    expect(parseMeetupPin('hello')).toBeNull();
    expect(parseMeetupPin('{"kind":"MEETUP_PIN","v":1,"lat":99,"lng":0}')).toBeNull();
  });
});
