import { Camera, Circle, CircleStop, Clock, Plus, X } from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';
import { useCurrentMission, useMissionsStore } from '../store/missions';
import type { WaypointAction, WaypointActionType } from '../types/mission';
import { cn } from '../lib/utils';

/**
 * 动作组 tab：选中航点后管理 actions（拍照 / 录像开 / 录像停 / 悬停）。
 *
 * SimulationLoop 不真模拟这些 actions，它们只是数据；KMZ 导出走 WPML
 * `<wpml:action>` 节点。v1 仅 4 种基础类型，复杂 actions（gimbal rotate /
 * focusing）留 v2。
 */
const ACTION_META: Record<
  WaypointActionType,
  { label: string; icon: React.ReactNode; color: string }
> = {
  takePhoto: {
    label: '拍照',
    icon: <Camera className="h-3.5 w-3.5" />,
    color: 'text-accent-cyan',
  },
  startRecord: {
    label: '开始录像',
    icon: <Circle className="h-3.5 w-3.5 fill-accent-danger text-accent-danger" />,
    color: 'text-accent-danger',
  },
  stopRecord: {
    label: '停止录像',
    icon: <CircleStop className="h-3.5 w-3.5" />,
    color: 'text-text-secondary',
  },
  hover: {
    label: '悬停',
    icon: <Clock className="h-3.5 w-3.5" />,
    color: 'text-accent',
  },
};

const ALL_TYPES: WaypointActionType[] = ['takePhoto', 'startRecord', 'stopRecord', 'hover'];

export function WaypointActionsPanel() {
  const mission = useCurrentMission();
  const selectedWaypointId = useMissionsStore((s) => s.selectedWaypointId);
  const addAction = useMissionsStore((s) => s.addAction);

  if (!mission) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-[12px] text-text-secondary">
        从左侧选择或新建任务
      </div>
    );
  }

  const selected = mission.waypoints.find((w) => w.id === selectedWaypointId);

  if (!selected) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <span className="text-[12px] text-text-secondary">未选中航点</span>
        <span className="text-[11px] text-text-muted">
          在地图或航点 tab 选一个航点，给它加动作
        </span>
      </div>
    );
  }

  const idx = mission.waypoints.indexOf(selected);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
        <span className="text-[12px] font-semibold text-text-primary">
          WP{idx + 1}
          <span className="ml-1.5 text-text-muted">·</span>
          <span className="ml-1.5 text-text-secondary">
            {selected.actions.length} 个动作
          </span>
        </span>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-1.5 p-3">
          {selected.actions.length === 0 ? (
            <div className="py-6 text-center text-[11px] text-text-muted">
              暂无动作，下方选一个类型添加
            </div>
          ) : (
            selected.actions.map((a, i) => (
              <ActionRow key={a.id} action={a} waypointId={selected.id} index={i} />
            ))
          )}
        </div>
      </ScrollArea>

      <div className="grid grid-cols-2 gap-1.5 border-t border-border-subtle p-2.5">
        {ALL_TYPES.map((t) => {
          const meta = ACTION_META[t];
          return (
            <button
              key={t}
              type="button"
              onClick={() => addAction(selected.id, t)}
              className={cn(
                'flex h-8 items-center justify-center gap-1.5 rounded border border-border bg-bg-input text-[11px] font-semibold transition hover:border-border-strong hover:bg-bg-surface',
                meta.color,
              )}
            >
              <Plus className="h-3 w-3 text-text-muted" />
              {meta.icon}
              {meta.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ActionRow({
  action,
  waypointId,
  index,
}: {
  action: WaypointAction;
  waypointId: string;
  index: number;
}) {
  const updateAction = useMissionsStore((s) => s.updateAction);
  const removeAction = useMissionsStore((s) => s.removeAction);
  const meta = ACTION_META[action.type];

  return (
    <div className="flex items-center gap-2 rounded border border-border-subtle bg-[#131720] p-2">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-bg-input text-[10px] font-semibold text-text-muted">
        {index + 1}
      </span>
      <span className={cn('flex items-center gap-1.5', meta.color)}>
        {meta.icon}
        <span className="text-[12px] font-semibold">{meta.label}</span>
      </span>
      {action.type === 'hover' && (
        <label className="ml-auto flex items-center gap-1 rounded border border-border bg-bg-input px-1.5 py-0.5">
          <input
            type="number"
            value={action.hoverSeconds ?? 3}
            min={1}
            max={600}
            step={1}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (Number.isFinite(v)) {
                updateAction(waypointId, action.id, {
                  hoverSeconds: Math.max(1, Math.min(600, v)),
                });
              }
            }}
            className="w-10 bg-transparent text-right text-[11px] font-semibold text-text-primary outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden"
          />
          <span className="text-[10px] text-text-muted">秒</span>
        </label>
      )}
      <button
        type="button"
        onClick={() => removeAction(waypointId, action.id)}
        className={cn(
          'flex h-5 w-5 items-center justify-center rounded text-text-secondary hover:bg-accent-danger/20 hover:text-accent-danger',
          action.type === 'hover' ? '' : 'ml-auto',
        )}
        title="删除"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
