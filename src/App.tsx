import { CesiumViewer } from './features/cesium/CesiumViewer';
import { useFlyToMission } from './features/cesium/useFlyToMission';
import { WaypointLayer } from './features/waypoint/WaypointLayer';
import { DroneLayer } from './features/simulation/DroneLayer';
import { FrustumLayer } from './features/frustum/FrustumLayer';
import { useSimulationLoop } from './features/simulation/SimulationLoop';
import { TopBar } from './components/TopBar';
import { MissionLibrary } from './components/MissionLibrary';
import { CreateMissionModal } from './components/CreateMissionModal';
import { RightSheet } from './components/RightSheet';
import { PlaybackBar } from './components/PlaybackBar';
import { FpvWindow } from './components/FpvWindow';
import { useSimulationStore } from './store/simulation';

export function App() {
  useSimulationLoop();
  useFlyToMission();
  const mode = useSimulationStore((s) => s.mode);
  const isSimulating = mode === 'simulating';

  return (
    <div className="flex h-full w-full flex-col bg-bg text-text-primary">
      <TopBar />

      <main className="flex flex-1 overflow-hidden">
        <aside className="w-[280px] border-r border-border-subtle bg-bg-surface">
          <MissionLibrary />
        </aside>

        <div className="relative flex-1 overflow-hidden bg-bg">
          <CesiumViewer />
          <WaypointLayer />
          <DroneLayer />
          <FrustumLayer />
          {isSimulating && <FpvWindow />}
        </div>

        <aside className="w-[340px] border-l border-border-subtle bg-bg-surface">
          <RightSheet />
        </aside>
      </main>

      {isSimulating ? (
        <PlaybackBar />
      ) : (
        <footer className="flex h-9 items-center justify-between border-t border-border-subtle bg-bg-surface px-4 text-[11px] text-text-secondary">
          <span className="flex items-center gap-2">
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-accent-cyan" />
            ArcGIS World Imagery
            <span className="text-text-muted">· WGS84 原生 · 全球 z=19</span>
          </span>
          <span className="text-text-muted">M5 加 FPV 真渲染</span>
        </footer>
      )}

      <CreateMissionModal />
    </div>
  );
}
