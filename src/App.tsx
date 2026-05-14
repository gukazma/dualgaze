import { CesiumViewer } from './features/cesium/CesiumViewer';
import { TopBar } from './components/TopBar';
import { MissionLibrary } from './components/MissionLibrary';
import { CreateMissionModal } from './components/CreateMissionModal';
import { useCurrentMission } from './store/missions';

export function App() {
  const mission = useCurrentMission();

  return (
    <div className="flex h-full w-full flex-col bg-bg text-text-primary">
      <TopBar />

      {/* Main area */}
      <main className="flex flex-1 overflow-hidden">
        <aside className="w-[280px] border-r border-border-subtle bg-bg-surface">
          <MissionLibrary />
        </aside>

        <div className="relative flex-1 overflow-hidden bg-bg">
          <CesiumViewer />
        </div>

        <aside className="w-[340px] border-l border-border-subtle bg-bg-surface">
          <div className="flex h-12 items-center justify-between border-b border-border-subtle px-4">
            <span className="text-[13px] font-semibold">
              {mission ? mission.name : '航线详情'}
            </span>
            {mission && (
              <span className="rounded-full bg-bg-input px-2 py-0.5 text-[10px] font-semibold text-text-secondary">
                {mission.waypoints.length} 航点
              </span>
            )}
          </div>
          <div className="p-3 text-[12px] text-text-secondary">
            {mission ? '（M3 实现航点编辑器）' : '从左侧选择或新建一个任务'}
          </div>
        </aside>
      </main>

      {/* StatusBar */}
      <footer className="flex h-9 items-center justify-between border-t border-border-subtle bg-bg-surface px-4 text-[11px] text-text-secondary">
        <span className="flex items-center gap-2">
          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-accent-cyan" />
          高德 GCJ-02 底图
          <span className="text-text-muted">· WGS84 航点自动修正偏移</span>
        </span>
        <span className="text-text-muted">M3 加航点编辑器</span>
      </footer>

      <CreateMissionModal />
    </div>
  );
}
