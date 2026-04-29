import type { HealthState } from '@/lib/api';

interface StatusPillProps {
  health: HealthState;
}

export function StatusPill({ health }: StatusPillProps) {
  const label =
    health.kind === 'ok'
      ? `backend: ok`
      : health.kind === 'checking'
        ? 'backend: checking…'
        : 'backend: unreachable';

  return (
    <div
      className={`status-pill status-pill--${health.kind}`}
      role="status"
      aria-live="polite"
    >
      <span className="status-pill__dot" aria-hidden="true" />
      <span className="status-pill__text">{label}</span>
    </div>
  );
}
