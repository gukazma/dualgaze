import { ScanEye } from 'lucide-react';
import { TilesetSourcePicker } from './TilesetSourcePicker';

/**
 * Facade mission 无 tileset 时的主视图中央引导卡片（Pencil FrameD5）。
 *
 * 条件：`mission.type === 'facade' && !mission.tilesetSource`。
 * 由 App.tsx 控制挂载。
 *
 * 设计：480×260 居中，bg-bg-panel + border-accent 黄边框，shadow-xl；
 * 内含 icon + 标题 + 副文案 + `<TilesetSourcePicker variant="card">`（紧凑模式两按钮）
 */
export function FacadeEmptyGuide() {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
      <div className="pointer-events-auto w-[480px] rounded-xl border border-accent bg-bg-panel/95 p-6 shadow-2xl backdrop-blur-sm">
        <div className="mb-4 flex justify-center">
          <ScanEye className="h-7 w-7 text-accent-cyan" />
        </div>
        <h2 className="mb-2 text-center text-[18px] font-bold text-text-primary">
          还没有 3D Tiles 模型
        </h2>
        <p className="mb-5 text-center text-[12px] text-text-secondary">
          贴近摄影需要在三维模型上指定立面
        </p>
        <TilesetSourcePicker variant="card" />
        <p className="mt-3 text-center text-[10px] text-text-muted">
          ⚠ HTTP 起 `python -m http.server` 指向 tileset 目录；或选本地目录直接加载
        </p>
      </div>
    </div>
  );
}
