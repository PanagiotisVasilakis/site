export type GuestMode = 'signin' | 'signup';
export type GuestOrigin = 'GR' | 'ABROAD' | '';

export function isGuestFormValid(
  mode: GuestMode,
  values: {
    origin: GuestOrigin;
    claimToken: string;
    phone: string;
    password: string;
    acceptTerms: boolean;
  },
): boolean {
  const credentialsValid = values.phone.trim().length >= 8 && values.password.length >= 8;
  if (mode === 'signin') return credentialsValid;
  return credentialsValid
    && values.origin !== ''
    && values.claimToken.trim().length >= 32
    && values.acceptTerms;
}
