export type GuestMode = 'signin' | 'signup';
export type GuestOrigin = 'GR' | 'ABROAD' | '';

export function validateAfm(value: string): boolean {
  return /^\d{9}$/.test(value);
}

export function validatePassport(value: string): boolean {
  return /^[A-Za-z0-9]{5,20}$/.test(value);
}

export function isGuestFormValid(
  mode: GuestMode,
  values: {
    origin: GuestOrigin;
    phone: string;
    lastName: string;
    password: string;
    afm: string;
    passport: string;
  },
): boolean {
  if (mode === 'signin') {
    return values.phone.length > 0 && values.password.length >= 8;
  }

  if (!values.origin || !values.phone || !values.lastName || values.password.length < 8) {
    return false;
  }
  if (values.origin === 'GR') return validateAfm(values.afm);
  return validatePassport(values.passport);
}
