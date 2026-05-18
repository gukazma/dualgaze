import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useTilesetLoadingStore } from '../store/tileset-loading';
import { cn } from '../lib/utils';

/**
 * TopBar 任务名右侧的 tileset 状态 chip。
 *
 * 仅 facade mission 显示（由 TopBar 自己根据 mission.type 控制挂载）。
 * 4 状态：
 *  - idle：`[未加载]` muted 灰
 *  - loading：spinner + `加载中` 青底脉冲
 *  - loaded：`{label} · {N} 块` 青底实色（fileCount 可缺省）
 *  - error：`[加载失败]` 红底
 */
export function TilesetChip() {
  const { status, label, fileCount, errorMsg } = useTilesetLoadingStore();

  if (status === 'idle') {
    return (
      <span className="rounded-sm bg-bg-input px-2 py-0.5 text-[10px] font-medium text-text-muted">
        未加载 tileset
      </span>
    );
  }
  if (status === 'loading') {
    return (
      <span className="flex animate-pulse items-center gap-1 rounded-sm bg-[#0a2b3c] px-2 py-0.5 text-[10px] font-semibold text-accent-cyan">
        <Loader2 className="h-3 w-3 animate-spin" /> 加载中
      </span>
    );
  }
  if (status === 'loaded') {
    return (
      <span
        className={cn(
          'flex items-center gap-1 rounded-sm bg-[#0a2b3c] px-2 py-0.5 text-[10px] font-semibold text-accent-cyan',
        )}
        title={label}
      >
        <CheckCircle2 className="h-3 w-3" />
        {label ?? 'tileset.json'}
        {typeof fileCount === 'number' && fileCount > 0 ? ` · ${fileCount} 文件` : ''}
      </span>
    );
  }
  // error
  return (
    <span
      className="flex items-center gap-1 rounded-sm bg-[#2d1a1a] px-2 py-0.5 text-[10px] font-semibold text-accent-danger"
      title={errorMsg}
    >
      <AlertCircle className="h-3 w-3" />
      加载失败
    </span>
  );
}
