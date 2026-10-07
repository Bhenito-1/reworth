import { namesMatch, splitAccountName } from './name-match';

describe('splitAccountName', () => {
  it('splits three names into first, middle, and last', () => {
    expect(splitAccountName('ADEWALE CHINEDU OKONKWO')).toEqual({
      firstName: 'ADEWALE',
      middleName: 'CHINEDU',
      lastName: 'OKONKWO',
    });
  });

  it('treats two names as first and last', () => {
    expect(splitAccountName('Ajibade Oluwasegun')).toEqual({
      firstName: 'Ajibade',
      middleName: '',
      lastName: 'Oluwasegun',
    });
  });

  it('keeps extra middle tokens together', () => {
    expect(splitAccountName('Ada Mary Jane Okon')).toEqual({
      firstName: 'Ada',
      middleName: 'Mary Jane',
      lastName: 'Okon',
    });
  });
});

describe('namesMatch', () => {
  it('matches ignoring case and punctuation', () => {
    expect(
      namesMatch(
        { firstName: 'Adewale', middleName: 'Chinedu', lastName: "Okonkwo" },
        splitAccountName('ADEWALE CHINEDU OKONKWO'),
      ),
    ).toBe(true);
  });

  it('rejects a different middle name', () => {
    expect(
      namesMatch(
        { firstName: 'Adewale', middleName: 'Tunde', lastName: 'Okonkwo' },
        splitAccountName('ADEWALE CHINEDU OKONKWO'),
      ),
    ).toBe(false);
  });
});
