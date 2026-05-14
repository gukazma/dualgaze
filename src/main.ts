import { createViewer } from './viewer';
import { loadPointCloud } from './pointcloud';
import { PolygonPicker, type PickerState } from './polygon-picker';
import './style.css';

const container = document.getElementById('cesiumContainer') as HTMLDivElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const resetBtn = document.getElementById('reset') as HTMLButtonElement;
const finishBtn = document.getElementById('finish') as HTMLButtonElement;

const viewer = createViewer(container);

declare global {
  interface Window {
    __viewer: import('cesium').Viewer;
    __picker?: PolygonPicker;
  }
}

if (import.meta.env.DEV) {
  window.__viewer = viewer;
}

statusEl.textContent = '加载点云中…';

(async () => {
  try {
    await loadPointCloud(viewer, '/datas/pnts/tileset.json');
  } catch (err) {
    statusEl.textContent = `点云加载失败: ${err instanceof Error ? err.message : String(err)}`;
    return;
  }

  // 关掉默认的右键 menu，否则浏览器原生菜单会盖在 Cesium 上
  viewer.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  const picker = new PolygonPicker(viewer);
  if (import.meta.env.DEV) window.__picker = picker;

  const render = (state: PickerState, count: number): void => {
    if (state === 'drawing') {
      const endHint = count >= 3 ? '右键 / 完成 结束选择' : `还差 ${3 - count} 点闭合`;
      statusEl.textContent = `绘制中 · ${count} 顶点 · 左键加点 · ${endHint} · Esc 取消`;
      finishBtn.textContent = '完成绘制';
      finishBtn.disabled = count < 3;
      finishBtn.style.display = '';
    } else {
      statusEl.textContent = `编辑中 · ${count} 顶点 · 拖顶点 / 中点调整 · Esc 重新开始`;
      finishBtn.style.display = 'none';
    }
  };
  picker.onChange(render);

  resetBtn.addEventListener('click', () => picker.reset());
  finishBtn.addEventListener('click', () => picker.finishDrawing());
})();
