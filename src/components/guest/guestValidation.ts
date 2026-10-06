export type GuestMode = 'signin' | 'signup';
export type GuestOrigin = 'GR' | 'ABROAD' | '';

/**
 * Legacy query names that once carried a claim token (docs/security/claim-token-transport.md). No value
 * is accepted from them; the guest client removes them from history and links never carry them forward.
 */
export const LEGACY_CLAIM_QUERY_PARAMS = ['claim', 'claimToken'] as const;

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
