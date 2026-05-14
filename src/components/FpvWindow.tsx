import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2, X, Radio } from 'lucide-react';
import { FpvViewer } from '../features/fpv/FpvViewer';
import { useSimulationStore } from '../store/simulation';
import { useCurrentMission } from '../store/missions';
import { PAYLOAD_CATALOG } from '../types/mission';
import { cn } from '../lib/utils';

// Pencil 原型基准尺寸（FrameC EoDgA：400×260，x=404 y=16 在 820 宽 MapArea 中 → 右贴边 16px）
const W = 400;
const H = 260;
const MARGIN = 16;
const TITLE_H = 32;
const HUD_H = 28;

/**
 * 右上浮窗（与原型对齐）。位置基准是 FPV 自己的 offsetParent（CesiumViewer 父级 .relative div），
 * 不是 window —— 之前用 window.innerWidth 会把窗推到右 aside 后面被裁掉。
 *
 * - 默认 right=16 top=16 贴中央容器右上
 * - 用户拖动后切到 absolute left/top 模式
 * - 最小化只折叠 body 保留标题栏，关闭隐藏并露重启按钮
 */
export function FpvWindow() {
  const droneState = useSimulationStore((s) => s.droneState);
  const mission = useCurrentMission();
  const payload = mission ? PAYLOAD_CATALOG.find((p) => p.id === mission.payloadId) : null;

  // null = 未拖动过，用 right/top 默认；拖动后切到 {x,y}
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [visible, setVisible] = useState(true);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const winRef = useRef<HTMLDivElement>(null);
  // 浮窗 offsetParent 的 client 尺寸（用于钳制拖动范围）
  const [parentSize, setParentSize] = useState({ w: 1024, h: 768 });

  useLayoutEffect(() => {
    const update = (): void => {
      const parent = winRef.current?.offsetParent as HTMLElement | null;
      if (!parent) return;
      setParentSize({ w: parent.clientWidth, h: parent.clientHeight });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      if (!dragRef.current) return;
      const parent = winRef.current?.offsetParent as HTMLElement | null;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const relX = e.clientX - rect.left - dragRef.current.dx;
      const relY = e.clientY - rect.top - dragRef.current.dy;
      setPos({
        x: Math.max(0, Math.min(rect.width - 80, relX)),
        y: Math.max(0, Math.min(rect.height - 40, relY)),
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
        className="absolute right-4 top-4 z-30 flex items-center gap-1.5 rounded-md border border-border bg-bg-surface px-3 py-1.5 text-[11px] font-semibold text-text-secondary shadow-lg hover:text-text-primary"
      >
        <Radio className="h-3 w-3 text-accent-cyan" /> 打开 FPV
      </button>
    );
  }

  // 默认 right/top 贴边；拖动后切 left/top。宽度溢出（容器 < W+32）时收缩
  const effectiveW = Math.min(W, Math.max(280, parentSize.w - MARGIN * 2));
  const posStyle: React.CSSProperties =
    pos === null
      ? { right: MARGIN, top: MARGIN }
      : { left: pos.x, top: pos.y };

  return (
    <div
      ref={winRef}
      className="absolute z-30 overflow-hidden rounded-lg border border-border-subtle bg-bg-surface shadow-2xl"
      style={{
        ...posStyle,
        width: effectiveW,
        height: collapsed ? TITLE_H : H,
      }}
    >
      <div
        onMouseDown={(e) => {
          const parent = winRef.current?.offsetParent as HTMLElement | null;
          if (!parent) return;
          const rect = parent.getBoundingClientRect();
          const winRect = winRef.current!.getBoundingClientRect();
          // 切到 left/top：算当前真实 left/top 作为锚点
          const curLeft = winRect.left - rect.left;
          const curTop = winRect.top - rect.top;
          dragRef.current = { dx: e.clientX - rect.left - curLeft, dy: e.clientY - rect.top - curTop };
          setPos({ x: curLeft, y: curTop });
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
