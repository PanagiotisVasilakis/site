type WifiCopyTarget = 'network' | 'password';

interface WifiAccessCardProps {
  title: string;
  networkLabel: string;
  passwordLabel: string;
  network: string;
  password: string;
  unavailableLabel: string;
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
    <div className="min-w-0 flex-1">
      <h3 className="checkin-title text-sm font-semibold">{title}</h3>
      <dl className="checkin-card checkin-divided mt-3">
        {items.map((item) => (
          <div key={item.target} className="grid gap-2 p-3 sm:grid-cols-[5.75rem_minmax(0,1fr)] sm:items-center">
            <dt className="checkin-muted-text text-xs font-medium">{item.label}</dt>
            <dd className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="checkin-value min-w-0 flex-1 whitespace-nowrap font-mono text-[0.8125rem] font-semibold">
                {item.value}
              </span>
              <button
                type="button"
                onClick={() => onCopy(item.value, item.target)}
                disabled={!item.available}
                className="checkin-copy-action"
                aria-label={item.ariaLabel}
              >
                <span className="h-3.5 w-3.5"><CopyIcon copied={copiedTarget === item.target} /></span>
                {copiedTarget === item.target ? copiedLabel : copyLabel}
              </button>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
