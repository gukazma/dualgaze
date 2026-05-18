import { ArrowRight, MousePointerSquareDashed } from 'lucide-react';
import { useUiStore } from '../store/ui';

/**
 * Facade mission 有 tileset 但无 face 时的主视图右下角主 CTA（Pencil FrameD7）。
 *
 * 条件：`tilesetSource != null && facadeFaces.length === 0 && pickerMode !== 'facade-draw'`
 *
 * 设计：240×72 cyan 实色卡片，距右底 16px；点击 → `setPickerMode('facade-draw')`
 * 触发 FacadePicker 进入 drawing 模式。
 */
export function FacadeStartCta() {
  const setPickerMode = useUiStore((s) => s.setPickerMode);

  return (
    <button
      type="button"
      onClick={() => setPickerMode('facade-draw')}
      className="group absolute bottom-4 right-4 z-20 flex h-[72px] w-[248px] items-center gap-3 rounded-xl bg-accent-cyan px-4 text-left shadow-2xl shadow-accent-cyan/40 transition-transform hover:scale-[1.02]"
    >
      <MousePointerSquareDashed className="h-6 w-6 shrink-0 text-bg" />
      <div className="flex-1">
        <div className="text-[14px] font-bold text-bg">+ 开始绘制立面</div>
        <div className="text-[11px] font-medium text-bg/75">在模型上点 4 个角点</div>
      </div>
      <ArrowRight className="h-4 w-4 text-bg transition-transform group-hover:translate-x-1" />
    </button>
  );
}
