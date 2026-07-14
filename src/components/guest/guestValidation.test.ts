import { isGuestFormValid } from '@/components/guest/guestValidation';

describe('guest form validation', () => {
  const base = {
    origin: '' as const,
    claimToken: '',
    phone: '+306912345678',
    password: 'password',
    acceptTerms: false,
  };

  it('requires only credentials for sign in', () => {
    expect(isGuestFormValid('signin', base)).toBe(true);
  });

  it('requires a host claim, origin, and explicit terms acceptance for activation', () => {
    expect(isGuestFormValid('signup', {
      ...base,
      origin: 'GR',
      claimToken: `claim_${'a'.repeat(43)}`,
      acceptTerms: true,
    })).toBe(true);
    expect(isGuestFormValid('signup', { ...base, origin: 'GR', acceptTerms: true })).toBe(false);
    expect(isGuestFormValid('signup', {
      ...base,
      origin: 'GR',
      claimToken: `claim_${'a'.repeat(43)}`,
    })).toBe(false);
  });
});
