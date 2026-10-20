import clsx from 'clsx';
import { HOST_CONTACT } from '@/data/contact';
import type { ShellDictionary } from '@/i18n/domains/shell';

/**
 * identity §1.4: the host identity (registry number ΑΜΑ, the host's name, address) as text only, with no link, id or hook.
 * A blank field is left out, so no placeholder is ever shown. Rendered by SiteFooter (both variants) and by the
 * apartment and availability page heads.
 */
export function HostIdentity({ labels, className }: { labels: ShellDictionary['identity']; className?: string }) {
  const rows = [
    { label: labels.registryLabel, value: HOST_CONTACT.registrationNumber, registry: true },
    { label: labels.legalNameLabel, value: HOST_CONTACT.legalName, registry: false },
    { label: labels.addressLabel, value: HOST_CONTACT.address, registry: false },
  ].filter((row) => row.value.trim() !== '');

  return (
    <dl className={clsx('host-identity', className)}>
      {rows.map((row) => (
        <div key={row.label} className="host-identity__row">
          <dt className="host-identity__label">{row.label}</dt>
          <dd className={clsx('host-identity__value', row.registry && 'host-identity__value--registry')}>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
