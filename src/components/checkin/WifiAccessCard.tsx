import { Icon } from '@/components/icons/Icon';

type WifiCopyTarget = 'network' | 'password';

interface WifiAccessCardProps {
  networkLabel: string;
  passwordLabel: string;
  network: string;
  password: string;
  unavailableLabel: string;
  notice?: string | null;
  copyLabel: string;
  copiedLabel: string;
  copiedTarget: WifiCopyTarget | null;
  onCopy: (value: string, target: WifiCopyTarget) => void;
  networkCopyLabel: string;
  passwordCopyLabel: string;
}

export default function WifiAccessCard({
  networkLabel,
  passwordLabel,
  network,
  password,
  unavailableLabel,
  notice,
  copyLabel,
  copiedLabel,
  copiedTarget,
  onCopy,
  networkCopyLabel,
  passwordCopyLabel,
}: WifiAccessCardProps) {
  const items = [
    {
      label: networkLabel,
      value: network || unavailableLabel,
      available: Boolean(network),
      target: 'network' as const,
      ariaLabel: networkCopyLabel,
    },
    {
      label: passwordLabel,
      value: password || unavailableLabel,
      available: Boolean(password),
      target: 'password' as const,
      ariaLabel: passwordCopyLabel,
    },
  ];

  return (
    <div className="wifi-card">
      <dl className="checkin-card checkin-divided wifi-card__list">
        {items.map((item) => (
          <div key={item.target} className="wifi-card__row">
            <dt className="checkin-muted-text">{item.label}</dt>
            <dd className="wifi-card__value">
              <span className="checkin-value checkin-mono wifi-card__text break-all">
                {item.value}
              </span>
              <button
                type="button"
                onClick={() => onCopy(item.value, item.target)}
                disabled={!item.available}
                className="checkin-copy-action"
                aria-label={item.ariaLabel}
              >
                <span className="checkin-copy-action__icon">
                  <Icon name={copiedTarget === item.target ? 'check' : 'copy'} size={14} />
                </span>
                {copiedTarget === item.target ? copiedLabel : copyLabel}
              </button>
            </dd>
          </div>
        ))}
      </dl>
      {notice && <p className="checkin-muted-text wifi-card__notice" role="status">{notice}</p>}
    </div>
  );
}
