import * as Cesium from 'cesium';
import { pickWgs84At } from '../../lib/cesium-pick';
import { fitPlaneFromCorners, flipFacadePlane } from '../../lib/facade-plane';
import { generateFacadeScanPath } from '../../lib/facade-scan';
import { annotateUnsafe, ensureNormalOutward } from '../../lib/facade-safety';
import { useMissionsStore } from '../../store/missions';
import { FACADE_DEFAULTS } from '../../types/mission';
import type { FacadeCorner, FacadePlane, Waypoint } from '../../types/mission';

/**
 * Facade 4 角拾取器，vanilla TS class（参考 PolygonPicker）。
 *
 * 交互流程：
 *   drawing-1: 等待第 1 角点（左键命中 tileset 即落点）
 *   drawing-2 / drawing-3: 同上
 *   drawing-4: 落第 4 点后自动拟合 plane → 切 preview
 *   preview : 显示 plane / scanPath；按
 *             F → 翻转法向（plane + scanPath 重算）
 *             Enter → 保存（store.addFacadeFace + setFaceScanResult）→ 重置 drawing-1
 *             Esc → 抛弃，回 drawing-1
 *   退出 picker（外部 setPickerMode('idle')）由 useFacadePicker 上层 effect 处理。
 *
 * 状态对外通过 onStateChange 暴露，给 FacadeLayer / 顶部浮条 overlay 订阅渲染 preview。
 */

export type FacadePickerState =
  | { mode: 'drawing'; corners: FacadeCorner[] }
  | {
      mode: 'preview';
      corners: FacadeCorner[];
      /** 是否第 4 角是自动推断（picker 在 3 角后闭合时为 true） */
      cornerInferredCount: number;
      plane: FacadePlane;
      scanPath: Waypoint[];
      /** 该 plane 下不安全的航点数（raycast 验距 < standoff） */
      unsafeCount: number;
    }
  | { mode: 'error'; corners: FacadeCorner[]; message: string };

export class FacadePicker {
  private viewer: Cesium.Viewer;
  private handler: Cesium.ScreenSpaceEventHandler;
  private state: FacadePickerState = { mode: 'drawing', corners: [] };
  private listeners: Array<(s: FacadePickerState) => void> = [];

  private keyDown = (e: KeyboardEvent): void => this.onKey(e);
  private contextMenuBlocker = (e: MouseEvent): void => e.preventDefault();

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer;
    this.handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
    this.handler.setInputAction(
      (e: Cesium.ScreenSpaceEventHandler.PositionedEvent) => this.onLeftClick(e.position),
      Cesium.ScreenSpaceEventType.LEFT_CLICK,
    );
    window.addEventListener('keydown', this.keyDown);
    viewer.canvas.addEventListener('contextmenu', this.contextMenuBlocker);
  }

  destroy(): void {
    window.removeEventListener('keydown', this.keyDown);
    this.viewer.canvas.removeEventListener('contextmenu', this.contextMenuBlocker);
    this.handler.destroy();
    this.listeners = [];
  }

  getState(): FacadePickerState {
    return this.state;
  }

  onStateChange(cb: (s: FacadePickerState) => void): () => void {
    this.listeners.push(cb);
    cb(this.state);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  private setState(next: FacadePickerState): void {
    this.state = next;
    for (const cb of this.listeners) cb(next);
  }

  // ----- 鼠标 -----

  private onLeftClick(screenPos: Cesium.Cartesian2): void {
    if (this.state.mode !== 'drawing') return;
    const wgs = pickWgs84At(this.viewer, screenPos);
    if (!wgs) return;
    const corner: FacadeCorner = { lon: wgs.lon, lat: wgs.lat, alt: wgs.alt };
    const corners = [...this.state.corners, corner];
    if (corners.length === 3) {
      // 3 角自动推第 4 角（平行四边形闭合：c4 = c1 + (c3 - c2)），进入 preview
      // 用户仍可点第 4 角点显式覆盖（在 preview 状态下 Esc 重画 + 重新点 4 个）
      const c0 = corners[0], c1 = corners[1], c2 = corners[2];
      const c3: FacadeCorner = {
        lon: c0.lon + (c2.lon - c1.lon),
        lat: c0.lat + (c2.lat - c1.lat),
        alt: c0.alt + (c2.alt - c1.alt),
      };
      this.computeAndPreview([...corners, c3], 1);
      return;
    }
    if (corners.length < 4) {
      this.setState({ mode: 'drawing', corners });
      return;
    }
    // 4 角集齐 → 拟合 + 算 scanPath → preview
    this.computeAndPreview(corners, 0);
  }

  // ----- 键盘 -----

  private onKey(e: KeyboardEvent): void {
    // Esc：抛弃，回到 drawing 空状态
    if (e.key === 'Escape') {
      e.preventDefault();
      this.setState({ mode: 'drawing', corners: [] });
      return;
    }
    // F：preview 状态下翻转法向
    if ((e.key === 'f' || e.key === 'F') && this.state.mode === 'preview') {
      e.preventDefault();
      const flipped = flipFacadePlane(this.state.plane);
      const scanPath = generateFacadeScanPath(this.viewer, flipped, {
        ...FACADE_DEFAULTS,
      });
      const { unsafeCount } = annotateUnsafe(
        this.viewer,
        flipped,
        scanPath,
        FACADE_DEFAULTS.standoff,
      );
      this.setState({
        mode: 'preview',
        corners: this.state.corners,
        cornerInferredCount: this.state.cornerInferredCount,
        plane: flipped,
        scanPath,
        unsafeCount,
      });
      return;
    }
    // Enter：preview 状态下保存
    if (e.key === 'Enter' && this.state.mode === 'preview') {
      e.preventDefault();
      this.commit();
    }
  }

  private computeAndPreview(corners: FacadeCorner[], cornerInferredCount: number): void {
    const rawPlane = fitPlaneFromCorners(corners);
    if (!rawPlane || !Number.isFinite(rawPlane.width) || rawPlane.width < 0.1 || rawPlane.height < 0.1) {
      this.setState({
        mode: 'error',
        corners,
        message: '点共线或退化，无法拟合平面 · 请重新拾取（按 L 形拾取 3 角即可）',
      });
      setTimeout(() => {
        if (this.state.mode === 'error') {
          this.setState({ mode: 'drawing', corners: [] });
        }
      }, 1500);
      return;
    }
    // 法向自动朝外：拿 tileset 中心，N 指向中心则取反
    const tilesetCenter = findFirstTilesetCenter(this.viewer);
    const plane = ensureNormalOutward(rawPlane, tilesetCenter);
    const scanPath = generateFacadeScanPath(this.viewer, plane, { ...FACADE_DEFAULTS });
    const { unsafeCount } = annotateUnsafe(this.viewer, plane, scanPath, FACADE_DEFAULTS.standoff);
    this.setState({
      mode: 'preview',
      corners,
      cornerInferredCount,
      plane,
      scanPath,
      unsafeCount,
    });
  }

  private commit(): void {
    if (this.state.mode !== 'preview') return;
    const { corners, plane, scanPath } = this.state;
    const store = useMissionsStore.getState();
    const mission = store.missions.find((m) => m.id === store.currentMissionId);
    if (!mission || mission.type !== 'facade') return;
    const idx = (mission.facadeFaces?.length ?? 0) + 1;
    const id = store.addFacadeFace({
      name: `立面 ${idx}`,
      corners,
    });
    if (!id) return;
    store.setFaceScanResult(id, plane, scanPath);
    // 保存后回到空 drawing，可连续画下一个面；用户想结束自己点 HUD X 切 pickerMode='idle'
    // 不主动切右 Sheet tab（避免抢用户视线）
    this.setState({ mode: 'drawing', corners: [] });
  }
}

/**
 * 从 viewer.scene.primitives 找第一个 Cesium3DTileset，返回其 boundingSphere.center。
 * 没找到返回 null（picker 在没 tileset 时 ensureNormalOutward 直接 noop）。
 */
function findFirstTilesetCenter(viewer: Cesium.Viewer): Cesium.Cartesian3 | null {
  const prims = viewer.scene.primitives;
  for (let i = 0; i < prims.length; i++) {
    const p = prims.get(i);
    // Cesium3DTileset 有 boundingSphere 属性；用 duck typing 避免 instanceof 跨模块实例问题
    const ts = p as { boundingSphere?: { center?: Cesium.Cartesian3 } };
    if (ts.boundingSphere?.center && Number.isFinite(ts.boundingSphere.center.x)) {
      return ts.boundingSphere.center;
    }
  }
  return null;
}
