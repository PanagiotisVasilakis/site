import { validateLocalization } from '@/lib/validation';
import { locales } from '@/i18n/config';

try {
  validateLocalization([...locales]);
  console.log('Localization validation passed');
} catch (e) {
  console.error('Localization validation failed:', (e as Error).message);
  process.exit(1);
}
