import { Icon } from '@/components/icons/Icon';
import { EMERGENCY_112_HREF } from '@/lib/contactLinks';

/** identity §9.11 / §8 Tile `band`: "Emergency: 112" as a tel: link, which works without a connection. */
export function EmergencyTile({ label, text }: { label: string; text: string }) {
  return (
    <a href={EMERGENCY_112_HREF} className="stay-sos-band shell-link">
      <span className="stay-sos-band__icon" aria-hidden="true"><Icon name="phone" size={24} /></span>
      <span className="stay-sos-band__text">
        <span className="stay-sos-band__title">{label}</span>
        <span className="stay-sos-band__lead">{text}</span>
      </span>
    </a>
  );
}
