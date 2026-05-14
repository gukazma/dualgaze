import { Pause, Play, Square } from 'lucide-react';
import { Button } from './ui/button';
import { Slider } from './ui/slider';
import { useCurrentMission, useMissionsStore } from '../store/missions';
import { useSimulationStore, type SimSpeed } from '../store/simulation';
import { cn } from '../lib/utils';

const SPEED_OPTIONS: SimSpeed[] = [1, 2, 5, 10];
const MIN_FLIGHT_SPEED = 1;
const MAX_FLIGHT_SPEED = 15;

export function PlaybackBar() {
  const mission = useCurrentMission();
  const running = useSimulationStore((s) => s.running);
  const elapsedMs = useSimulationStore((s) => s.elapsedMs);
  const totalMs = useSimulationStore((s) => s.totalDurationMs);
  const speed = useSimulationStore((s) => s.speed);
  const reachedIds = useSimulationStore((s) => s.reachedWaypointIds);
  const currentSegmentIndex = useSimulationStore((s) => s.currentSegmentIndex);

  const play = useSimulationStore((s) => s.play);
  const pause = useSimulationStore((s) => s.pause);
  const exitSim = useSimulationStore((s) => s.exitSim);
  const setSpeed = useSimulationStore((s) => s.setSpeed);
  const updateMission = useMissionsStore((s) => s.updateMission);

  if (!mission) return null;

  const progress = totalMs > 0 ? Math.min(elapsedMs / totalMs, 1) : 0;
  const flightSpeed = mission.globalSpeed;

  const handleFlightSpeedChange = (values: number[]): void => {
    const v = values[0];
    if (!Number.isFinite(v)) return;
    updateMission(mission.id, { globalSpeed: Math.max(MIN_FLIGHT_SPEED, Math.min(MAX_FLIGHT_SPEED, v)) });
  };

  return (
    <footer className="flex h-20 items-center gap-4 border-t border-border-subtle bg-bg-surface px-5">
      {/* 左：play/pause/stop */}
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

      {/* 中：时间 + waypoint 标记 + 进度条 */}
      <div className="flex flex-1 flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold">{formatMs(elapsedMs)}</span>
          <div className="flex items-center gap-3.5">
            {mission.waypoints.map((wp, idx) => {
              const reached = reachedIds.has(wp.id);
              const active = !reached && idx === currentSegmentIndex + 1;
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
          <div className="absolute inset-y-0 left-0 bg-accent-cyan" style={{ width: `${progress * 100}%` }} />
          <span
            className="absolute -translate-x-1/2 rounded-full bg-accent-cyan ring-2 ring-bg"
            style={{ left: `${progress * 100}%`, top: '50%', width: 12, height: 12, marginTop: -6 }}
          />
        </div>
      </div>

      {/* 右：倍速 + 飞行速度 */}
      <div className="flex items-end gap-5">
        {/* 倍速 */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-text-muted">倍速</span>
          <div className="flex items-center overflow-hidden rounded-md border border-border bg-bg">
            {SPEED_OPTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeed(s)}
                className={cn(
                  'flex h-7 w-9 items-center justify-center text-[11px] font-semibold transition',
                  s === speed
                    ? 'bg-bg-input text-text-primary'
                    : 'text-text-secondary hover:bg-bg-surface',
                )}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>

        {/* 飞行速度 */}
        <div className="flex w-[200px] flex-col gap-1.5">
          <div className="flex items-baseline justify-between">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-text-muted">飞行速度</span>
            <div className="flex items-baseline gap-1">
              <span className="text-[13px] font-bold text-accent-cyan">{flightSpeed.toFixed(1)}</span>
              <span className="text-[9px] font-semibold text-text-secondary">m/s</span>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <Slider
              value={[flightSpeed]}
              onValueChange={handleFlightSpeedChange}
              min={MIN_FLIGHT_SPEED}
              max={MAX_FLIGHT_SPEED}
              step={0.1}
              className="flex-1"
            />
            <span className="text-[9px] text-text-muted">{MIN_FLIGHT_SPEED} · {MAX_FLIGHT_SPEED}</span>
          </div>
        </div>
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
