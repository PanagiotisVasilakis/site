type WifiCopyTarget = 'network' | 'password';

interface WifiAccessCardProps {
  /** Omitted when the card sits under its own section heading (check-in page, identity §9.8). */
  title?: string;
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

function CopyIcon({ copied }: { copied: boolean }) {
  return copied ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="m5 12 4 4L19 6" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export default function WifiAccessCard({
  title,
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
      {title ? <h3 className="checkin-title">{title}</h3> : null}
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
                <span className="checkin-copy-action__icon"><CopyIcon copied={copiedTarget === item.target} /></span>
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
