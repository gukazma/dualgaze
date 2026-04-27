import { useEffect, useRef, useState } from 'react';
import { fetchHealth } from '@/lib/api';
import { useCesiumViewer } from './useCesiumViewer';

export function CesiumViewer() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  useCesiumViewer(containerRef);

  const [healthLabel, setHealthLabel] = useState<string>('checking…');

  useEffect(() => {
    let cancelled = false;
    fetchHealth()
      .then((res) => {
        if (cancelled) return;
        setHealthLabel(`backend: ${res.status} (${res.service})`);
      })
      .catch(() => {
        if (cancelled) return;
        setHealthLabel('backend: unreachable');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="viewer-root">
      <div ref={containerRef} className="viewer-canvas" />
      <div className="viewer-hud">
        <div className="viewer-hud__brand">DualGaze</div>
        <div className="viewer-hud__status">{healthLabel}</div>
      </div>
    </div>
  );
}
