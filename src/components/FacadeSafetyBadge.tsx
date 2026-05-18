import { TriangleAlert } from 'lucide-react';
import { useCurrentMission } from '../store/missions';

/**
 * Mission-level 安全总览 chip（D9 设计）。
 *
 * 条件：facade mission 中**已保存的** face 里有任意 unsafe waypoint → 红字 chip。
 * 位置：主视图右上，但要放在 QuickAddButton 左侧（独立元素，由 App.tsx 控制挂载）。
 */
export function FacadeSafetyBadge() {
  const mission = useCurrentMission();
  if (!mission || mission.type !== 'facade') return null;
  let total = 0;
  for (const f of mission.facadeFaces ?? []) {
    if (!f.enabled) continue;
    for (const wp of f.scanPath ?? []) {
      if (wp.unsafe) total++;
    }
  }
  if (total === 0) return null;

  return (
    <div className="absolute right-32 top-4 z-20 flex h-8 items-center gap-1.5 rounded-full border border-accent-danger bg-[#2d1a1a]/95 px-3 text-[12px] font-semibold text-accent-danger backdrop-blur-sm shadow-lg">
      <TriangleAlert className="h-3.5 w-3.5" />
      {total} 个航点不安全
    </div>
  );
}
