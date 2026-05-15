import * as Cesium from 'cesium';
import { cartesian3ToWgs84, wgs84ToCartesian3 } from '../../lib/coord';
import { useMissionsStore } from '../../store/missions';
import type { PolygonVertex } from '../../types/mission';

export type PolygonPickerMode = 'drawing' | 'editing';

/**
 * 多边形编辑器：vanilla TS class，drawing / editing 双模式。
 *
 * 交互：
 *   - drawing：左键 → 加顶点；右键 ≥3 顶点切 editing；Esc 清空回 drawing
 *   - editing：left-down 命中顶点 → drag；左键空白 → 不响应；右键 → 回 drawing
 *
 * 不 own polygon 数组；vertex 实体由 MappingLayer 渲染并带 __polygonVertexIdx 标记。
 */
export class PolygonPicker {
  private viewer: Cesium.Viewer;
  private handler: Cesium.ScreenSpaceEventHandler;
  private mode: PolygonPickerMode = 'drawing';
  private dragging: { vertexIdx: number } | null = null;
  private modeListeners: Array<(mode: PolygonPickerMode) => void> = [];

  private keyDown = (e: KeyboardEvent): void => this.onKey(e);
  private contextMenuBlocker = (e: MouseEvent): void => e.preventDefault();

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer;
    this.handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
    this.bindMouse();
    window.addEventListener('keydown', this.keyDown);
    viewer.canvas.addEventListener('contextmenu', this.contextMenuBlocker);
  }

  destroy(): void {
    window.removeEventListener('keydown', this.keyDown);
    this.viewer.canvas.removeEventListener('contextmenu', this.contextMenuBlocker);
    this.handler.destroy();
    this.releaseCamera();
    this.dragging = null;
  }

  getMode(): PolygonPickerMode {
    return this.mode;
  }

  onModeChange(cb: (mode: PolygonPickerMode) => void): () => void {
    this.modeListeners.push(cb);
    cb(this.mode);
    return () => {
      this.modeListeners = this.modeListeners.filter((l) => l !== cb);
    };
  }

  private setMode(mode: PolygonPickerMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    for (const cb of this.modeListeners) cb(mode);
  }

  // ----- bind -----

  private bindMouse(): void {
    this.handler.setInputAction(
      (e: Cesium.ScreenSpaceEventHandler.PositionedEvent) => this.onLeftClick(e.position),
      Cesium.ScreenSpaceEventType.LEFT_CLICK,
    );
    this.handler.setInputAction(
      (e: Cesium.ScreenSpaceEventHandler.PositionedEvent) => this.onLeftDown(e.position),
      Cesium.ScreenSpaceEventType.LEFT_DOWN,
    );
    this.handler.setInputAction(
      (e: Cesium.ScreenSpaceEventHandler.MotionEvent) => this.onMouseMove(e.endPosition),
      Cesium.ScreenSpaceEventType.MOUSE_MOVE,
    );
    this.handler.setInputAction(
      () => this.onLeftUp(),
      Cesium.ScreenSpaceEventType.LEFT_UP,
    );
    this.handler.setInputAction(
      () => this.onRightClick(),
      Cesium.ScreenSpaceEventType.RIGHT_CLICK,
    );
  }

  // ----- keyboard -----

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      this.releaseCamera();
      this.dragging = null;
      // 清空当前 mission 的 polygon
      useMissionsStore.getState().setPolygon([]);
      this.setMode('drawing');
    }
  }

  // ----- mouse -----

  private onLeftClick(screenPos: Cesium.Cartesian2): void {
    if (this.mode !== 'drawing') return;
    // 点击落在已有 vertex 上 → 不重复加
    if (this.pickVertexAt(screenPos) !== null) return;
    const wgs = this.pickWgs84At(screenPos);
    if (!wgs) return;
    const store = useMissionsStore.getState();
    if (!store.currentMissionId) return;
    const m = store.missions.find((x) => x.id === store.currentMissionId);
    if (!m || m.type !== 'mapping') return;
    const v: PolygonVertex = { lon: wgs.lon, lat: wgs.lat, alt: m.globalHeight };
    store.addPolygonVertex(v);
  }

  private onLeftDown(screenPos: Cesium.Cartesian2): void {
    if (this.mode !== 'editing') return;
    const idx = this.pickVertexAt(screenPos);
    if (idx === null) return;
    this.dragging = { vertexIdx: idx };
    this.lockCamera();
  }

  private onMouseMove(screenPos: Cesium.Cartesian2): void {
    if (!this.dragging) return;
    const wgs = this.pickWgs84At(screenPos);
    if (!wgs) return;
    useMissionsStore.getState().updatePolygonVertex(this.dragging.vertexIdx, {
      lon: wgs.lon,
      lat: wgs.lat,
    });
  }

  private onLeftUp(): void {
    if (!this.dragging) return;
    this.dragging = null;
    this.releaseCamera();
  }

  private onRightClick(): void {
    if (this.mode === 'drawing') {
      // ≥3 顶点才能切 editing
      const m = currentMappingMission();
      if (!m || (m.polygon?.length ?? 0) < 3) return;
      this.setMode('editing');
    } else {
      this.setMode('drawing');
    }
  }

  // ----- pick helpers -----

  /** scene.pick 找当前光标下的 polygon vertex；命中返回 idx；否则 null */
  private pickVertexAt(screenPos: Cesium.Cartesian2): number | null {
    const picked = this.viewer.scene.pick(screenPos);
    if (!picked) return null;
    const idx = (picked.id as unknown as { __polygonVertexIdx?: number } | null)?.__polygonVertexIdx;
    return typeof idx === 'number' ? idx : null;
  }

  /** pickFromRay → ECEF → WGS84 */
  private pickWgs84At(
    screenPos: Cesium.Cartesian2,
  ): { lon: number; lat: number; alt: number } | null {
    const ray = this.viewer.camera.getPickRay(screenPos);
    if (!ray) return null;
    const sceneAny = this.viewer.scene as unknown as {
      pickFromRay: (
        ray: Cesium.Ray,
        exclude?: object[],
      ) => { position?: Cesium.Cartesian3 } | undefined;
    };
    const result = sceneAny.pickFromRay(ray);
    const cart = result?.position;
    if (cart && Number.isFinite(cart.x)) return cartesian3ToWgs84(cart);
    const cartesianGlobe = this.viewer.scene.globe.pick(ray, this.viewer.scene);
    if (cartesianGlobe && Number.isFinite(cartesianGlobe.x)) {
      return cartesian3ToWgs84(cartesianGlobe);
    }
    return null;
  }

  // ----- camera lock during drag -----

  private lockCamera(): void {
    const c = this.viewer.scene.screenSpaceCameraController;
    c.enableRotate = false;
    c.enableTranslate = false;
    c.enableTilt = false;
    c.enableLook = false;
  }

  private releaseCamera(): void {
    const c = this.viewer.scene.screenSpaceCameraController;
    c.enableRotate = true;
    c.enableTranslate = true;
    c.enableTilt = true;
    c.enableLook = true;
  }
}

function currentMappingMission() {
  const s = useMissionsStore.getState();
  if (!s.currentMissionId) return null;
  const m = s.missions.find((x) => x.id === s.currentMissionId);
  return m?.type === 'mapping' ? m : null;
}

export function polygonVertexToCartesian3(v: PolygonVertex): Cesium.Cartesian3 {
  return wgs84ToCartesian3(v.lon, v.lat, v.alt);
}
