/**
 * A WhatsApp chat with the number (digits only, as wa.me requires) and optional prefilled text.
 * Kept apart from contactLinks.ts, which imports src/data/contact.ts: HOST_CONTACT derives its
 * WhatsApp link from this function, and a shared module would be an import cycle.
 */
export function whatsappHref(phone: string, text?: string): string {
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits === '') throw new RangeError('A phone number with digits is required');
  const href = `https://wa.me/${digits}`;
  return text ? `${href}?text=${encodeURIComponent(text)}` : href;
}
