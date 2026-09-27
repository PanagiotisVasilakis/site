import crypto from 'node:crypto';

import { GUEST_TERMS_TEXT, GUEST_TERMS_VERSION } from '@/lib/guestTermsText';

export { GUEST_TERMS_VERSION };

// Hash of the canonical bilingual document the guest accepted one rendering of.
export const GUEST_TERMS_CONTENT_HASH = crypto
  .createHash('sha256')
  .update(JSON.stringify({ version: GUEST_TERMS_VERSION, en: GUEST_TERMS_TEXT.en, el: GUEST_TERMS_TEXT.el }), 'utf8')
  .digest('hex');
