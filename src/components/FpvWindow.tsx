import { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2, X, Radio } from 'lucide-react';
import { FpvViewer } from '../features/fpv/FpvViewer';
import { useSimulationStore } from '../store/simulation';
import { useCurrentMission } from '../store/missions';
import { PAYLOAD_CATALOG } from '../types/mission';
import { cn } from '../lib/utils';

const W = 380;
const H = 280;
const TITLE_H = 32;
const HUD_H = 28;

/**
 * 浮窗：右上拖动 + 最小化 + 关闭。
 * - 关闭后留一个小重启按钮（不真销毁 ref）
 * - 最小化只折叠 body，标题栏 + 拖动手柄保留
 * - 模拟模式才挂载（App.tsx 控制）
 */
export function FpvWindow() {
  const droneState = useSimulationStore((s) => s.droneState);
  const mission = useCurrentMission();
  const payload = mission ? PAYLOAD_CATALOG.find((p) => p.id === mission.payloadId) : null;

  const [pos, setPos] = useState(() => ({
    x: typeof window !== 'undefined' ? window.innerWidth - W - 360 - 24 : 24,
    y: 72,
  }));
  const [collapsed, setCollapsed] = useState(false);
  const [visible, setVisible] = useState(true);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      if (!dragRef.current) return;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 80, e.clientX - dragRef.current.dx)),
        y: Math.max(0, Math.min(window.innerHeight - 50, e.clientY - dragRef.current.dy)),
      });
    };
    const onUp = (): void => {
      dragRef.current = null;
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  if (!visible) {
    return (
      <button
        type="button"
        onClick={() => setVisible(true)}
        className="absolute right-6 top-20 z-30 flex items-center gap-1.5 rounded-md border border-border bg-bg-surface px-3 py-1.5 text-[11px] font-semibold text-text-secondary shadow-lg hover:text-text-primary"
      >
        <Radio className="h-3 w-3 text-accent-cyan" /> 打开 FPV
      </button>
    );
  }

  return (
    <div
      className="absolute z-30 overflow-hidden rounded-lg border border-border-subtle bg-bg-surface shadow-2xl"
      style={{
        left: pos.x,
        top: pos.y,
        width: W,
        height: collapsed ? TITLE_H : H,
      }}
    >
      <div
        onMouseDown={(e) => {
          dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
          document.body.style.userSelect = 'none';
        }}
        className="flex h-8 cursor-move select-none items-center justify-between border-b border-border-subtle bg-bg-input px-2.5 text-[11px]"
      >
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-danger" />
          <span className="font-semibold">无人机 FPV</span>
          {payload && (
            <span className="text-text-muted">· {payload.label.split(' ')[0]}</span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="flex h-6 w-6 items-center justify-center rounded text-text-secondary hover:bg-bg hover:text-text-primary"
            title={collapsed ? '展开' : '最小化'}
          >
            {collapsed ? <Maximize2 className="h-3 w-3" /> : <Minimize2 className="h-3 w-3" />}
          </button>
          <button
            type="button"
            onClick={() => setVisible(false)}
            className="flex h-6 w-6 items-center justify-center rounded text-text-secondary hover:bg-accent-danger/20 hover:text-accent-danger"
            title="关闭"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="relative" style={{ height: H - TITLE_H }}>
          <FpvViewer />
          {droneState && (
            <div
              className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 border-t border-border-subtle/60 bg-bg/80 px-3 text-[10px] font-semibold backdrop-blur-sm"
              style={{ height: HUD_H }}
            >
              <HudItem label="ALT" value={`${droneState.alt.toFixed(0)}m`} />
              <HudItem label="YAW" value={`${droneState.heading.toFixed(0)}°`} />
              <HudItem label="LON" value={droneState.lon.toFixed(4)} />
              <HudItem label="LAT" value={droneState.lat.toFixed(4)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HudItem({ label, value }: { label: string; value: string }) {
  return (
    <span className={cn('flex items-baseline gap-1')}>
      <span className="text-text-muted">{label}</span>
      <span className="text-accent-cyan">{value}</span>
    </span>
  );
}
