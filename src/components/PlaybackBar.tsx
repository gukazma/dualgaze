import { Pause, Play, Square } from 'lucide-react';
import { Button } from './ui/button';
import { useCurrentMission } from '../store/missions';
import { useSimulationStore, type SimSpeed } from '../store/simulation';
import { cn } from '../lib/utils';

const SPEED_OPTIONS: SimSpeed[] = [1, 2, 5, 10];

export function PlaybackBar() {
  const mission = useCurrentMission();
  const running = useSimulationStore((s) => s.running);
  const elapsedMs = useSimulationStore((s) => s.elapsedMs);
  const totalMs = useSimulationStore((s) => s.totalDurationMs);
  const speed = useSimulationStore((s) => s.speed);
  const reachedIds = useSimulationStore((s) => s.reachedWaypointIds);

  const play = useSimulationStore((s) => s.play);
  const pause = useSimulationStore((s) => s.pause);
  const exitSim = useSimulationStore((s) => s.exitSim);
  const setSpeed = useSimulationStore((s) => s.setSpeed);

  if (!mission) return null;

  const progress = totalMs > 0 ? Math.min(elapsedMs / totalMs, 1) : 0;
  const waypointPositions =
    mission.waypoints.length < 2
      ? []
      : computeWaypointTimePositions(mission.waypoints, totalMs);

  return (
    <footer className="flex h-16 items-center gap-4 border-t border-border-subtle bg-bg-surface px-5">
      <div className="flex items-center gap-2">
        <Button
          size="icon"
          onClick={running ? pause : play}
          className="h-9 w-9 rounded-full bg-accent-cyan p-0 text-bg hover:bg-accent-cyan/90"
        >
          {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <Button
          size="icon"
          variant="outline"
          onClick={exitSim}
          className="h-8 w-8 rounded-full p-0"
        >
          <Square className="h-3 w-3" />
        </Button>
      </div>

      <div className="flex flex-1 flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold">{formatMs(elapsedMs)}</span>
          <div className="flex items-center gap-3.5">
            {mission.waypoints.map((wp, idx) => {
              const reached = reachedIds.has(wp.id);
              const active = !reached && idx === useSimulationStore.getState().currentSegmentIndex + 1;
              return (
                <span key={wp.id} className="flex items-center gap-1">
                  <span
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      reached
                        ? 'bg-accent-cyan'
                        : active
                          ? 'bg-accent'
                          : 'bg-border',
                    )}
                  />
                  <span
                    className={cn(
                      'text-[10px] font-semibold',
                      reached
                        ? 'text-accent-cyan'
                        : active
                          ? 'text-accent'
                          : 'text-text-muted',
                    )}
                  >
                    WP{idx + 1}
                  </span>
                </span>
              );
            })}
          </div>
          <span className="text-[11px] font-semibold text-text-secondary">{formatMs(totalMs)}</span>
        </div>
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-bg-input">
          <div
            className="absolute inset-y-0 left-0 bg-accent-cyan"
            style={{ width: `${progress * 100}%` }}
          />
          {/* waypoint markers */}
          {waypointPositions.map((tp, idx) => {
            const reached = reachedIds.has(mission.waypoints[idx].id);
            return (
              <span
                key={mission.waypoints[idx].id}
                className={cn(
                  'absolute -translate-x-1/2 rounded-full ring-2 ring-bg',
                  reached ? 'bg-accent-cyan' : 'bg-bg-input',
                )}
                style={{
                  left: `${tp * 100}%`,
                  top: '50%',
                  width: 10,
                  height: 10,
                  marginTop: -5,
                }}
              />
            );
          })}
          {/* playhead */}
          <span
            className="absolute -translate-x-1/2 rounded-full bg-accent-cyan ring-2 ring-bg"
            style={{
              left: `${progress * 100}%`,
              top: '50%',
              width: 12,
              height: 12,
              marginTop: -6,
            }}
          />
        </div>
      </div>

      <div className="flex items-center overflow-hidden rounded-md border border-border bg-bg">
        {SPEED_OPTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSpeed(s)}
            className={cn(
              'flex h-7 w-10 items-center justify-center text-[11px] font-semibold transition',
              s === speed
                ? 'bg-bg-input text-text-primary'
                : 'text-text-secondary hover:bg-bg-surface',
            )}
          >
            {s}x
          </button>
        ))}
      </div>
    </footer>
  );
}

function formatMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/** 算每个 waypoint 在 totalMs 中的归一化时间位置（用于 progress bar 上的小标记） */
function computeWaypointTimePositions(
  waypoints: import('../types/mission').Waypoint[],
  totalMs: number,
): number[] {
  if (totalMs <= 0 || waypoints.length < 2) return waypoints.map(() => 0);
  // 简单版本：按等距分布；真实的时间分布要重新算每段 duration —— 暂时近似
  // (与 SimulationLoop 的 buildSegments 算法一致才精确；先够用)
  return waypoints.map((_, i) => i / (waypoints.length - 1));
}
