import { RotateCcw } from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';
import { Button } from './ui/button';
import { useCurrentMission, useMissionsStore } from '../store/missions';

const EARTH_R = 6378137;

function haversineMeters(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return EARTH_R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * 扫描列表（只读）：mapping mission 的右 sheet 第 4 tab。
 * 顶部统计 + scanPath 滚动列表 + 底部重算按钮。
 */
export function MappingScanList() {
  const mission = useCurrentMission();
  const recomputeScanPath = useMissionsStore((s) => s.recomputeScanPath);

  if (!mission || mission.type !== 'mapping') {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-[12px] text-text-secondary">
        非 mapping mission
      </div>
    );
  }

  const polygon = mission.polygon ?? [];
  const scan = mission.scanPath ?? [];

  if (polygon.length < 3) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <span className="text-[12px] text-text-secondary">先在地图上画 ≥3 个顶点</span>
        <span className="text-[11px] text-text-muted">左键加顶点 · 右键闭合切到编辑模式</span>
      </div>
    );
  }

  // 总距离 + 估时
  let totalMeters = 0;
  for (let i = 0; i < scan.length - 1; i++) {
    totalMeters += haversineMeters(
      scan[i].lon,
      scan[i].lat,
      scan[i + 1].lon,
      scan[i + 1].lat,
    );
  }
  const durationSec = mission.globalSpeed > 0 ? totalMeters / mission.globalSpeed : 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-1 border-b border-border-subtle px-3 py-2.5">
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-semibold">{scan.length}</span>
          <span className="text-[10px] text-text-muted">扫描航点</span>
          <span className="ml-auto text-[10px] text-text-muted">
            多边形 {polygon.length} 顶点
          </span>
        </div>
        <div className="flex items-baseline justify-between text-[10px] text-text-secondary">
          <span>
            总距离 <span className="font-semibold text-text-primary">{totalMeters.toFixed(0)}</span> m
          </span>
          <span>
            预计 <span className="font-semibold text-text-primary">{formatDuration(durationSec)}</span>
          </span>
        </div>
      </div>

      <ScrollArea className="flex-1">
        {scan.length === 0 ? (
          <div className="py-6 text-center text-[11px] text-text-muted">无扫描航点</div>
        ) : (
          <div className="flex flex-col gap-0.5 p-2">
            {scan.map((wp, i) => (
              <div
                key={wp.id}
                className="flex items-center gap-2 rounded border border-border-subtle bg-bg-surface px-2 py-1.5 text-[10px]"
              >
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-bg-input text-[9px] font-bold text-text-secondary">
                  {i + 1}
                </span>
                <span className="text-text-secondary">
                  {wp.lon.toFixed(5)} / {wp.lat.toFixed(5)}
                </span>
                <span className="ml-auto text-text-muted">
                  {wp.alt.toFixed(0)}m · {wp.speed.toFixed(1)} m/s
                </span>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      <div className="border-t border-border-subtle p-2.5">
        <Button
          variant="outline"
          size="sm"
          onClick={recomputeScanPath}
          className="w-full gap-1.5"
        >
          <RotateCcw className="h-3 w-3" />
          重算
        </Button>
      </div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds - m * 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
