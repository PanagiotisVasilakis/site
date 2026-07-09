import {
  isGuestFormValid,
  validateAfm,
  validatePassport,
} from '@/components/guest/guestValidation';

describe('guest form validation', () => {
  it('validates identity formats', () => {
    expect(validateAfm('123456789')).toBe(true);
    expect(validateAfm('123')).toBe(false);
    expect(validatePassport('AB1234567')).toBe(true);
    expect(validatePassport('A-12')).toBe(false);
  });

  it('requires only credentials for sign in', () => {
    expect(isGuestFormValid('signin', {
      origin: '',
      phone: '6912345678',
      lastName: '',
      password: 'password',
      afm: '',
      passport: '',
    })).toBe(true);
  });

  it('requires the identity document matching the selected origin for sign up', () => {
    const base = {
      phone: '6912345678',
      lastName: 'Papadopoulos',
      password: 'password',
      afm: '',
      passport: '',
    };

    expect(isGuestFormValid('signup', {
      ...base,
      origin: 'GR',
      afm: '123456789',
    })).toBe(true);
    expect(isGuestFormValid('signup', {
      ...base,
      origin: 'ABROAD',
      passport: 'AB1234567',
    })).toBe(true);
    expect(isGuestFormValid('signup', { ...base, origin: 'GR' })).toBe(false);
  });
});
