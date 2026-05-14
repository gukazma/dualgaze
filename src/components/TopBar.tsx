import { Pencil, Plus, Download, Upload, Play, Radio } from 'lucide-react';
import { Button } from './ui/button';
import { useCurrentMission } from '../store/missions';
import { useUiStore } from '../store/ui';
import { useSimulationStore } from '../store/simulation';
import { prepareSimulation } from '../features/simulation/SimulationLoop';
import { DRONE_CATALOG, PAYLOAD_CATALOG } from '../types/mission';
import { cn } from '../lib/utils';

export function TopBar() {
  const mission = useCurrentMission();
  const openCreateModal = useUiStore((s) => s.openCreateModal);
  const mode = useSimulationStore((s) => s.mode);
  const enterSim = useSimulationStore((s) => s.enterSim);
  const exitSim = useSimulationStore((s) => s.exitSim);

  const drone = mission ? DRONE_CATALOG.find((d) => d.id === mission.droneId) : null;
  const payload = mission ? PAYLOAD_CATALOG.find((p) => p.id === mission.payloadId) : null;

  const canSimulate = !!mission && mission.waypoints.length >= 2 && mode === 'editing';
  const isSimulating = mode === 'simulating';

  const handleSimClick = (): void => {
    if (isSimulating) {
      exitSim();
      return;
    }
    const prep = prepareSimulation();
    if (prep.startState && prep.totalDurationMs > 0) {
      enterSim(prep.totalDurationMs, prep.startState);
    }
  };

  return (
    <header className="flex h-14 items-center justify-between border-b border-border-subtle bg-bg-surface px-5">
      <div className="flex items-center gap-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-[11px] font-bold text-bg">
          DG
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-semibold leading-none">DualGaze</span>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-text-secondary">
              {mission ? mission.name : '尚未选择任务'}
            </span>
            {mission && (
              <span className="rounded-sm bg-[#2a2113] px-1.5 py-0.5 text-[9px] font-semibold text-accent">
                巡逻航线
              </span>
            )}
          </div>
        </div>
      </div>

      <div
        className={cn(
          'flex items-center gap-1.5 rounded-full px-3 py-1.5',
          isSimulating
            ? 'border border-accent-cyan bg-[#0a3c39]'
            : 'bg-bg-input',
        )}
      >
        {isSimulating ? (
          <Radio className="h-3 w-3 animate-pulse text-accent-cyan" />
        ) : (
          <Pencil className="h-3 w-3 text-accent" />
        )}
        <span
          className={cn(
            'text-[11px] font-semibold',
            isSimulating ? 'text-accent-cyan' : 'text-accent',
          )}
        >
          {isSimulating ? '模拟飞行中' : '编辑模式'}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {drone && payload && (
          <span className="hidden items-center gap-1.5 rounded-md border border-border bg-bg-input px-2.5 py-1.5 text-[11px] text-text-secondary md:inline-flex">
            <span className="font-semibold text-text-primary">{drone.label.replace('DJI Matrice ', 'M')}</span>
            <span className="text-text-muted">+</span>
            <span>{payload.label.split(' ')[0]}</span>
          </span>
        )}
        <Button size="sm" variant="outline" onClick={openCreateModal} className="gap-1.5" disabled={isSimulating}>
          <Plus className="h-3 w-3" />
          新建
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" disabled>
          <Download className="h-3 w-3" />
          导入 KMZ
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" disabled>
          <Upload className="h-3 w-3" />
          导出 KMZ
        </Button>
        <Button
          size="sm"
          onClick={handleSimClick}
          disabled={!isSimulating && !canSimulate}
          className={cn(
            'gap-1.5',
            isSimulating
              ? 'bg-accent-danger text-bg hover:bg-accent-danger/90'
              : 'bg-accent-cyan text-bg hover:bg-accent-cyan/90',
          )}
        >
          {isSimulating ? <Radio className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          {isSimulating ? '退出模拟' : '模拟飞行'}
        </Button>
      </div>
    </header>
  );
}
