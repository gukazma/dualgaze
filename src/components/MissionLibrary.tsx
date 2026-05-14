import { useState } from 'react';
import { Plus, MoreHorizontal, ChevronDown, Sparkles } from 'lucide-react';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Input } from './ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { useMissionsStore } from '../store/missions';
import { useUiStore } from '../store/ui';
import { DRONE_CATALOG, type Mission } from '../types/mission';
import { BAVARIA_DEMO_CENTER, BAVARIA_DEMO_OFFSETS, BAVARIA_DEMO_PRESET } from '../lib/demo-mission';
import { cn } from '../lib/utils';

function loadBavariaDemo(): void {
  const store = useMissionsStore.getState();
  const id = store.createMission({
    name: BAVARIA_DEMO_PRESET.name,
    type: 'patrol',
    droneId: BAVARIA_DEMO_PRESET.droneId,
    payloadId: BAVARIA_DEMO_PRESET.payloadId,
  });
  const alt = BAVARIA_DEMO_CENTER.alt + BAVARIA_DEMO_PRESET.altOffset;
  // createMission 已经设了 currentMissionId 为新 id，addWaypoint 直接挂上去
  for (const { dLon, dLat } of BAVARIA_DEMO_OFFSETS) {
    store.addWaypoint({
      lon: BAVARIA_DEMO_CENTER.lon + dLon,
      lat: BAVARIA_DEMO_CENTER.lat + dLat,
      alt,
      speed: BAVARIA_DEMO_PRESET.speed,
      pitch: BAVARIA_DEMO_PRESET.pitch,
      fov: BAVARIA_DEMO_PRESET.fov,
    });
  }
  store.updateMission(id, {
    globalSpeed: BAVARIA_DEMO_PRESET.speed,
    globalHeight: BAVARIA_DEMO_PRESET.altOffset,
  });
}

export function MissionLibrary() {
  const missions = useMissionsStore((s) => s.missions);
  const currentMissionId = useMissionsStore((s) => s.currentMissionId);
  const openCreateModal = useUiStore((s) => s.openCreateModal);

  return (
    <div className="flex h-full w-full flex-col">
      {/* 头部 */}
      <div className="flex h-12 items-center justify-between border-b border-border-subtle px-4">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold">航线库</span>
          {missions.length > 0 && (
            <span className="rounded-full bg-bg-input px-2 py-0.5 text-[10px] font-semibold text-text-secondary">
              {missions.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="outline"
            onClick={loadBavariaDemo}
            className="h-6 w-6 border-border bg-bg-input"
            title="加载 Bavaria 演示航线"
          >
            <Sparkles className="h-3 w-3 text-accent-cyan" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            onClick={openCreateModal}
            className="h-6 w-6 border-border bg-bg-input"
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* 筛选行（v1 静态 placeholder） */}
      <div className="flex gap-2 border-b border-border-subtle px-4 py-2.5">
        <FilterButton label="全部机型" />
        <FilterButton label="时间倒序" />
      </div>

      {/* 列表 */}
      <ScrollArea className="flex-1">
        {missions.length === 0 ? (
          <EmptyState onCreate={openCreateModal} />
        ) : (
          <div className="flex flex-col gap-1.5 p-2">
            {missions.map((m) => (
              <MissionRow
                key={m.id}
                mission={m}
                active={m.id === currentMissionId}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function FilterButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="flex flex-1 items-center justify-between rounded-sm border border-border bg-bg px-2 py-1 text-[11px] text-text-secondary hover:border-border/80"
    >
      <span>{label}</span>
      <ChevronDown className="h-2.5 w-2.5" />
    </button>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 px-4 py-10 text-center">
      <div className="text-[12px] text-text-secondary">还没有航线</div>
      <Button size="sm" onClick={onCreate} className="gap-1.5">
        <Plus className="h-3 w-3" />
        新建第一条
      </Button>
      <button
        type="button"
        onClick={loadBavariaDemo}
        className="flex items-center gap-1.5 text-[11px] text-accent-cyan hover:text-accent-cyan/80"
      >
        <Sparkles className="h-2.5 w-2.5" />
        加载 Bavaria 演示
      </button>
    </div>
  );
}

interface MissionRowProps {
  mission: Mission;
  active: boolean;
}

function MissionRow({ mission, active }: MissionRowProps) {
  const selectMission = useMissionsStore((s) => s.selectMission);
  const renameMission = useMissionsStore((s) => s.renameMission);
  const duplicateMission = useMissionsStore((s) => s.duplicateMission);
  const deleteMission = useMissionsStore((s) => s.deleteMission);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(mission.name);

  const drone = DRONE_CATALOG.find((d) => d.id === mission.droneId);
  const elapsed = relativeTimeShort(mission.updatedAt);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => selectMission(mission.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') selectMission(mission.id);
        }}
        className={cn(
          'flex cursor-pointer flex-col gap-1.5 rounded-md border p-2.5',
          active
            ? 'border-accent bg-[#1b1f2a]'
            : 'border-border-subtle bg-bg-surface hover:border-border',
        )}
      >
        <div className="flex items-center justify-between">
          <span
            className={cn(
              'truncate text-[12px]',
              active ? 'font-semibold text-text-primary' : 'text-text-secondary',
            )}
          >
            {mission.name}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="rounded p-0.5 text-text-secondary hover:bg-bg-input hover:text-text-primary"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="border-border bg-bg-panel"
              onClick={(e) => e.stopPropagation()}
            >
              <DropdownMenuItem
                onClick={() => {
                  setRenameValue(mission.name);
                  setRenameOpen(true);
                }}
              >
                重命名
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => duplicateMission(mission.id)}>
                复制
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => deleteMission(mission.id)}
                className="text-accent-danger focus:text-accent-danger"
              >
                删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'rounded-sm px-1.5 py-0.5 text-[9px] font-semibold',
              active ? 'bg-[#2a2113] text-accent' : 'bg-bg-input text-text-secondary',
            )}
          >
            {mission.type === 'patrol' ? '巡逻' : mission.type}
          </span>
          <span className="text-[10px] text-text-muted">
            {mission.waypoints.length} 航点 · {elapsed} · {drone?.label.replace('DJI Matrice ', 'M') ?? '?'}
          </span>
        </div>
      </div>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="max-w-[400px] border-border bg-bg-panel">
          <DialogHeader>
            <DialogTitle>重命名航线</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && renameValue.trim()) {
                renameMission(mission.id, renameValue.trim());
                setRenameOpen(false);
              }
            }}
            autoFocus
            className="border-border bg-bg-input"
          />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRenameOpen(false)}>
              取消
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (renameValue.trim()) {
                  renameMission(mission.id, renameValue.trim());
                  setRenameOpen(false);
                }
              }}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function relativeTimeShort(ts: number): string {
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return '刚才';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  return `${d} 天前`;
}
