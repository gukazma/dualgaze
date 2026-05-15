import { useState, useEffect } from 'react';
import { ArrowUpDown, GripVertical, Trash2, Trash } from 'lucide-react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { useCurrentMission, useMissionsStore } from '../store/missions';
import type { PolygonVertex, Waypoint } from '../types/mission';
import { cn } from '../lib/utils';

export function WaypointList() {
  const mission = useCurrentMission();
  const selectedWaypointId = useMissionsStore((s) => s.selectedWaypointId);
  const selectWaypoint = useMissionsStore((s) => s.selectWaypoint);
  const reverseWaypoints = useMissionsStore((s) => s.reverseWaypoints);
  const clearWaypoints = useMissionsStore((s) => s.clearWaypoints);
  const reorderWaypoints = useMissionsStore((s) => s.reorderWaypoints);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const handleDragEnd = (e: DragEndEvent): void => {
    if (!mission) return;
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const fromIdx = mission.waypoints.findIndex((w) => w.id === active.id);
    const toIdx = mission.waypoints.findIndex((w) => w.id === over.id);
    if (fromIdx < 0 || toIdx < 0) return;
    reorderWaypoints(fromIdx, toIdx);
  };

  if (!mission) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-6 text-center text-[12px] text-text-secondary">
        <span>左侧选择或新建任务</span>
      </div>
    );
  }

  // mapping 分支：顶点列表（独立组件，不复用 sortable 路径）
  if (mission.type === 'mapping') {
    return <PolygonVertexList vertices={mission.polygon ?? []} />;
  }

  if (mission.waypoints.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-6 text-center text-[12px] text-text-secondary">
        <span>地图上左键加点</span>
        <span className="text-text-muted">右键切换 编辑 / 绘制 模式</span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <ScrollArea className="flex-1">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={mission.waypoints.map((w) => w.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-1.5 p-2.5">
              {mission.waypoints.map((wp) => (
                <SortableWaypointCard
                  key={wp.id}
                  waypoint={wp}
                  selected={wp.id === selectedWaypointId}
                  onSelect={() => selectWaypoint(wp.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </ScrollArea>
      <div className="flex gap-2 border-t border-border-subtle p-2.5">
        <Button
          variant="outline"
          size="sm"
          onClick={reverseWaypoints}
          className="flex-1 gap-1.5"
          disabled={mission.waypoints.length < 2}
        >
          <ArrowUpDown className="h-3 w-3" />
          反向
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={clearWaypoints}
          className="flex-1 gap-1.5 text-accent-danger hover:text-accent-danger"
        >
          <Trash className="h-3 w-3" />
          清空
        </Button>
      </div>
    </div>
  );
}

interface WaypointCardProps {
  waypoint: Waypoint;
  selected: boolean;
  onSelect: () => void;
}

function SortableWaypointCard(props: WaypointCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.waypoint.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="flex items-stretch gap-1.5">
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="flex w-4 items-center justify-center rounded text-text-muted hover:text-text-secondary cursor-grab active:cursor-grabbing"
        title="拖动重排"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <div className="flex-1">
        <WaypointCard {...props} />
      </div>
    </div>
  );
}

function WaypointCard({ waypoint, selected, onSelect }: WaypointCardProps) {
  if (!selected) {
    return (
      <button
        type="button"
        onClick={onSelect}
        className="flex items-center justify-between gap-2 rounded-md border border-border-subtle bg-bg-surface px-2.5 py-2 text-left hover:border-border"
      >
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-bg-input text-[10px] font-bold">
            {waypoint.index + 1}
          </span>
          <span className="text-[11px] text-text-secondary">
            {waypoint.lon.toFixed(5)} / {waypoint.lat.toFixed(5)} · {waypoint.alt.toFixed(0)} m
          </span>
        </div>
        <span className="text-[10px] text-text-muted">{waypoint.heading.toFixed(0)}°</span>
      </button>
    );
  }

  return <WaypointCardExpanded waypoint={waypoint} />;
}

function WaypointCardExpanded({ waypoint }: { waypoint: Waypoint }) {
  const updateWaypoint = useMissionsStore((s) => s.updateWaypoint);
  const removeWaypoint = useMissionsStore((s) => s.removeWaypoint);

  return (
    <div className="flex flex-col gap-2.5 rounded-md border border-accent bg-[#1b1f2a] p-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-accent text-[11px] font-bold text-bg">
            {waypoint.index + 1}
          </span>
          <span className="text-[11px] font-semibold">WGS84</span>
        </div>
        <button
          type="button"
          onClick={() => removeWaypoint(waypoint.id)}
          className="rounded p-0.5 text-text-secondary hover:bg-bg-input hover:text-accent-danger"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <NumField
          label="经度"
          value={waypoint.lon}
          decimals={6}
          onChange={(v) => updateWaypoint(waypoint.id, { lon: v })}
        />
        <NumField
          label="纬度"
          value={waypoint.lat}
          decimals={6}
          onChange={(v) => updateWaypoint(waypoint.id, { lat: v })}
        />
      </div>

      <div className="grid grid-cols-4 gap-2">
        <NumField
          label="高度 m"
          value={waypoint.alt}
          decimals={1}
          onChange={(v) => updateWaypoint(waypoint.id, { alt: v })}
        />
        <NumField
          label="速度 m/s"
          value={waypoint.speed}
          decimals={1}
          onChange={(v) => updateWaypoint(waypoint.id, { speed: v })}
        />
        <NumField
          label="航向 °"
          value={waypoint.heading}
          decimals={0}
          onChange={(v) => updateWaypoint(waypoint.id, { heading: v })}
        />
        <NumField
          label="云台 °"
          value={waypoint.pitch}
          decimals={0}
          onChange={(v) => updateWaypoint(waypoint.id, { pitch: v })}
        />
      </div>
    </div>
  );
}

interface NumFieldProps {
  label: string;
  value: number;
  decimals: number;
  onChange: (v: number) => void;
}

function NumField({ label, value, decimals, onChange }: NumFieldProps) {
  // local string state for typing; commit on blur / enter
  const [local, setLocal] = useState(value.toFixed(decimals));
  useEffect(() => {
    setLocal(value.toFixed(decimals));
  }, [value, decimals]);

  const commit = (): void => {
    const parsed = Number.parseFloat(local);
    if (Number.isFinite(parsed) && parsed !== value) {
      onChange(parsed);
    } else {
      setLocal(value.toFixed(decimals));
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[9px] font-semibold uppercase tracking-wider text-text-muted">
        {label}
      </span>
      <Input
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit();
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        className={cn(
          'h-7 border-border-subtle bg-bg-input px-2 text-[11px]',
          'focus-visible:ring-1 focus-visible:ring-accent',
        )}
      />
    </div>
  );
}

// ============ mapping 分支：多边形顶点列表 ============

function PolygonVertexList({ vertices }: { vertices: PolygonVertex[] }) {
  const updatePolygonVertex = useMissionsStore((s) => s.updatePolygonVertex);
  const removePolygonVertex = useMissionsStore((s) => s.removePolygonVertex);
  const setPolygon = useMissionsStore((s) => s.setPolygon);

  if (vertices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-6 text-center text-[12px] text-text-secondary">
        <span>地图上左键加多边形顶点</span>
        <span className="text-text-muted">≥3 顶点后右键切到编辑模式</span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-2 p-2.5">
          {vertices.map((v, idx) => (
            <div
              key={idx}
              className="flex flex-col gap-2 rounded-md border border-border-subtle bg-bg-surface p-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-bg">
                    {idx + 1}
                  </span>
                  <span className="text-[11px] font-semibold text-text-secondary">顶点</span>
                </span>
                <button
                  type="button"
                  onClick={() => removePolygonVertex(idx)}
                  className="rounded p-0.5 text-text-secondary hover:bg-bg-input hover:text-accent-danger"
                  title="删除顶点"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <NumField
                  label="经度"
                  value={v.lon}
                  decimals={6}
                  onChange={(val) => updatePolygonVertex(idx, { lon: val })}
                />
                <NumField
                  label="纬度"
                  value={v.lat}
                  decimals={6}
                  onChange={(val) => updatePolygonVertex(idx, { lat: val })}
                />
                <NumField
                  label="高度 m"
                  value={v.alt}
                  decimals={1}
                  onChange={(val) => updatePolygonVertex(idx, { alt: val })}
                />
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
      <div className="flex gap-2 border-t border-border-subtle p-2.5">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPolygon([])}
          className="flex-1 gap-1.5 text-accent-danger hover:text-accent-danger"
          disabled={vertices.length === 0}
        >
          <Trash className="h-3 w-3" />
          清空多边形
        </Button>
      </div>
    </div>
  );
}
