import { CesiumViewer } from './features/cesium/CesiumViewer';

export function App() {
  return (
    <div className="flex h-full w-full flex-col bg-bg text-text-primary">
      {/* TopBar — M2 实现 */}
      <header className="flex h-14 items-center justify-between border-b border-border-subtle bg-bg-surface px-5">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-[11px] font-bold text-bg">
            DG
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] font-semibold">DualGaze</span>
            <span className="text-[11px] text-text-secondary">
              v0.2 shell · M0 React 迁移完成
            </span>
          </div>
        </div>
        <div className="text-[11px] text-text-secondary">
          M2-M3 toolbar 占位
        </div>
      </header>

      {/* Main area */}
      <main className="flex flex-1 overflow-hidden">
        {/* LeftSheet — M2 MissionLibrary */}
        <aside className="w-[280px] border-r border-border-subtle bg-bg-surface">
          <div className="flex h-12 items-center border-b border-border-subtle px-4 text-[13px] font-semibold">
            航线库
          </div>
          <div className="p-3 text-[12px] text-text-secondary">
            （M2 实现）
          </div>
        </aside>

        {/* Cesium viewer */}
        <div className="relative flex-1 overflow-hidden bg-bg">
          <CesiumViewer />
        </div>

        {/* RightSheet — M3 WaypointList */}
        <aside className="w-[340px] border-l border-border-subtle bg-bg-surface">
          <div className="flex h-12 items-center border-b border-border-subtle px-4 text-[13px] font-semibold">
            航线详情
          </div>
          <div className="p-3 text-[12px] text-text-secondary">
            （M3 实现）
          </div>
        </aside>
      </main>

      {/* StatusBar — M4 PlaybackBar 会替换 */}
      <footer className="flex h-9 items-center justify-between border-t border-border-subtle bg-bg-surface px-4 text-[11px] text-text-secondary">
        <span>M0 React shell · Cesium viewer 已接入</span>
        <span className="text-text-muted">M1 加 AMap 底图</span>
      </footer>
    </div>
  );
}
