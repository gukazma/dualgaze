import { useEffect, useState } from 'react';
import type { SketchHandle } from './useSketch';

interface SketchPanelProps {
  sketch: SketchHandle;
}

export function SketchPanel({ sketch }: SketchPanelProps) {
  const [heightInput, setHeightInput] = useState('50');
  const [inputFocused, setInputFocused] = useState(false);

  // Mirror controller-driven height into the input (only when user is not editing)
  useEffect(() => {
    if (!inputFocused && sketch.mode === 'extruding' && sketch.height !== null) {
      setHeightInput(String(Math.round(sketch.height)));
    }
  }, [sketch.height, sketch.mode, inputFocused]);

  // Lock mouse-driven height while user is editing the input
  useEffect(() => {
    sketch.setMouseLocked(inputFocused);
  }, [inputFocused, sketch]);

  return (
    <section className="context-panel" aria-label="Sketch & Extrude">
      <h2 className="context-panel__title">Sketch &amp; Extrude</h2>

      {sketch.mode === 'idle' && (
        <button
          type="button"
          className="sketch-panel__primary"
          onClick={sketch.start}
        >
          新建草绘
        </button>
      )}

      {sketch.mode === 'drawing' && (
        <>
          <p className="sketch-panel__hint">Enter / 双击 闭合｜ESC 取消</p>
          <p className="sketch-panel__count">
            已添加 {sketch.vertexCount} 顶点（需要 ≥ 3）
          </p>
          <button
            type="button"
            className="sketch-panel__danger"
            onClick={sketch.cancel}
          >
            取消
          </button>
        </>
      )}

      {sketch.mode === 'extruding' && (
        <>
          <p className="sketch-panel__hint">
            按住左键 上下拖 调高度｜单击 / 完成挤出 提交｜ESC 取消
          </p>
          <label className="sketch-panel__height">
            <span className="sketch-panel__height-label">高度 (m)</span>
            <input
              type="number"
              min={1}
              max={5000}
              step={1}
              value={heightInput}
              onChange={(e) => {
                setHeightInput(e.target.value);
                const v = Number(e.target.value);
                if (Number.isFinite(v) && v > 0) sketch.setExtrudedHeight(v);
              }}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              onKeyDown={(e) => e.stopPropagation()}
              className="sketch-panel__height-input"
            />
          </label>
          <button
            type="button"
            className="sketch-panel__primary"
            onClick={sketch.commitExtrude}
          >
            完成挤出
          </button>
          <button
            type="button"
            className="sketch-panel__ghost"
            onClick={sketch.cancel}
          >
            取消
          </button>
        </>
      )}

      {sketch.mode === 'extruded' && (
        <>
          <p className="sketch-panel__readout">已挤出 {sketch.height} m</p>
          <button
            type="button"
            className="sketch-panel__danger"
            onClick={sketch.clearAll}
          >
            全部清除
          </button>
        </>
      )}
    </section>
  );
}
