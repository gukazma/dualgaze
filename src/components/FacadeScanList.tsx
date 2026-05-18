import { ScrollArea } from './ui/scroll-area';
import { useCurrentMission } from '../store/missions';

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
 * 扫描列表（只读）：facade mission 的右 sheet 扫描 tab。
 *
 * M17 极简版：按 face 折叠 list，统计总航点 + 总距离。M18 会跟 MappingScanList
 * 抽公共行 + 加重算按钮 + 每行选中态等等。
 */
export function FacadeScanList() {
  const mission = useCurrentMission();
  if (!mission || mission.type !== 'facade') {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-[12px] text-text-secondary">
        非 facade mission
      </div>
    );
  }

  const faces = mission.facadeFaces ?? [];
  const enabledFaces = faces.filter((f) => f.enabled);
  const totalWp = enabledFaces.reduce((sum, f) => sum + (f.scanPath?.length ?? 0), 0);
  let totalDist = 0;
  for (const f of enabledFaces) {
    const sp = f.scanPath ?? [];
    for (let i = 1; i < sp.length; i++) {
      totalDist += haversineMeters(sp[i - 1].lon, sp[i - 1].lat, sp[i].lon, sp[i].lat);
    }
  }
  const minutes = totalDist > 0 ? totalDist / mission.globalSpeed / 60 : 0;

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-2 p-3">
        <section className="rounded-md border border-border bg-bg-input p-2.5">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            总计
          </div>
          <div className="grid grid-cols-3 gap-2 text-[11px]">
            <div>
              <div className="text-text-muted">立面</div>
              <div className="text-[13px] font-semibold text-text-primary">
                {enabledFaces.length} / {faces.length}
              </div>
            </div>
            <div>
              <div className="text-text-muted">航点</div>
              <div className="text-[13px] font-semibold text-text-primary">{totalWp}</div>
            </div>
            <div>
              <div className="text-text-muted">距离</div>
              <div className="text-[13px] font-semibold text-text-primary">
                {totalDist >= 1000 ? `${(totalDist / 1000).toFixed(2)}km` : `${Math.round(totalDist)}m`}
              </div>
            </div>
          </div>
          <div className="mt-1 text-[10px] text-text-muted">
            预计 {minutes >= 1 ? `${Math.floor(minutes)}m${Math.round((minutes % 1) * 60)}s` : `${Math.round(minutes * 60)}s`} ({mission.globalSpeed} m/s)
          </div>
        </section>

        {faces.length === 0 ? (
          <div className="rounded-md border border-dashed border-border-subtle p-4 text-center text-[11px] text-text-muted">
            还没有立面
          </div>
        ) : (
          faces.map((f, idx) => {
            const hue = `hsl(${(idx * 60) % 360}, 70%, 55%)`;
            const sp = f.scanPath ?? [];
            return (
              <details
                key={f.id}
                className="rounded-md border border-border bg-bg-input"
                open={idx === 0}
              >
                <summary className="flex cursor-pointer items-center gap-2 p-2 text-[11px] font-semibold">
                  <span
                    className="h-3 w-3 shrink-0 rounded-sm"
                    style={{ backgroundColor: hue }}
                  />
                  <span className="flex-1 truncate">{f.name}</span>
                  <span className="text-[10px] text-text-muted">
                    {sp.length} 点{f.enabled ? '' : ' · 已关闭'}
                  </span>
                </summary>
                <div className="max-h-48 overflow-auto border-t border-border-subtle">
                  {sp.length === 0 ? (
                    <div className="p-2 text-[10px] text-text-muted">未生成扫描路径</div>
                  ) : (
                    sp.map((w) => (
                      <div
                        key={w.id}
                        className="flex items-center gap-2 px-2 py-0.5 text-[10px] tabular-nums"
                      >
                        <span className="w-5 text-text-muted">{w.index + 1}</span>
                        <span className="flex-1 truncate">
                          {w.lon.toFixed(6)}, {w.lat.toFixed(6)}
                        </span>
                        <span className="text-text-muted">{w.alt.toFixed(1)}m</span>
                      </div>
                    ))
                  )}
                </div>
              </details>
            );
          })
        )}
      </div>
    </ScrollArea>
  );
}
