import { Plus } from 'lucide-react';
import { useUiStore } from '../store/ui';

/**
 * Facade mission 已有 face 时的主视图右上角次要 CTA（Pencil FrameD9）。
 *
 * 条件：`facadeFaces.length >= 1 && pickerMode !== 'facade-draw'`
 *
 * 设计：h-8 胶囊按钮，距右上 16px；border-accent；点击 → `setPickerMode('facade-draw')`
 */
export function FacadeQuickAddButton() {
  const setPickerMode = useUiStore((s) => s.setPickerMode);

  return (
    <button
      type="button"
      onClick={() => setPickerMode('facade-draw')}
      className="absolute right-4 top-4 z-20 flex h-8 items-center gap-1.5 rounded-full border border-accent bg-bg-panel/80 px-3 text-[12px] font-semibold text-accent backdrop-blur-sm hover:bg-accent/10"
    >
      <Plus className="h-3.5 w-3.5" />
      新建立面
    </button>
  );
}
