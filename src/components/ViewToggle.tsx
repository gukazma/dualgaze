import { Box, Square } from 'lucide-react';
import { useUiStore, type MapView } from '../store/ui';
import { cn } from '../lib/utils';

/**
 * 主场景右上角浮控件：3D / 2D 切换。
 * 锁定俯视后 pickFromRay 不再受透视错位影响 —— 鼠标点哪 ≈ 航点落哪。
 */
export function ViewToggle() {
  const mapView = useUiStore((s) => s.mapView);
  const setMapView = useUiStore((s) => s.setMapView);

  return (
    <div
      className="absolute right-4 top-4 z-20 flex h-8 overflow-hidden rounded-md border border-border bg-bg-surface shadow-lg"
    >
      <ViewBtn
        active={mapView === '3d'}
        onClick={() => setMapView('3d')}
        icon={<Box className="h-3 w-3" />}
        label="3D"
        view="3d"
      />
      <ViewBtn
        active={mapView === '2d'}
        onClick={() => setMapView('2d')}
        icon={<Square className="h-3 w-3" />}
        label="2D"
        view="2d"
      />
    </div>
  );
}

function ViewBtn({
  active,
  onClick,
  icon,
  label,
  view,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  view: MapView;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={view === '2d' ? '俯视（pitch=-90°，锁旋转）' : '3D 自由视角'}
      className={cn(
        'flex w-11 items-center justify-center gap-1 text-[11px] font-bold uppercase tracking-wider transition',
        active
          ? 'bg-bg-input text-accent'
          : 'text-text-secondary hover:bg-bg-surface hover:text-text-primary',
      )}
    >
      {icon}
      {label}
    </button>
  );
}
