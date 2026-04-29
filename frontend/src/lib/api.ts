import { useEffect, useState } from 'react';
import type { HealthResponse } from '@dualgaze/shared';

const API_BASE = '/api';

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} on ${path}`);
  }
  return (await res.json()) as T;
}

export function fetchHealth(): Promise<HealthResponse> {
  return getJson<HealthResponse>('/health');
}

export type HealthState =
  | { kind: 'checking' }
  | { kind: 'ok'; service: string }
  | { kind: 'unreachable' };

const HEALTH_INTERVAL_MS = 8_000;

export function useHealth(): HealthState {
  const [state, setState] = useState<HealthState>({ kind: 'checking' });

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetchHealth();
        if (cancelled) return;
        setState(
          res.status === 'ok'
            ? { kind: 'ok', service: res.service }
            : { kind: 'unreachable' },
        );
      } catch {
        if (!cancelled) setState({ kind: 'unreachable' });
      }
    };
    tick();
    const id = window.setInterval(tick, HEALTH_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return state;
}
