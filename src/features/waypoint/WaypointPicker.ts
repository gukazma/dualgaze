import * as Cesium from 'cesium';
import { cartesian3ToWgs84, wgs84ToCartesian3 } from '../../lib/coord';
import { useMissionsStore } from '../../store/missions';
import type { Waypoint } from '../../types/mission';

export type PickerMode = 'drawing' | 'editing';

/**
 * 航点编辑器：vanilla TS class，从 store 读 current mission，向 store 写 waypoint CRUD。
 *
 * 交互：
 *   - drawing 模式：左键 → pickFromRay 命中 globe / tileset → wgs84 存入 store
 *   - drawing 模式：右键 → 切到 editing
 *   - editing 模式：left-down 命中 waypoint marker → drag 改 lon/lat
 *   - editing 模式：右键 → 回到 drawing
 *   - Esc → reset 回 drawing + 清空 (UI 上要二次确认，picker 本身只清当前 mission)
 *
 * 不会直接 own waypoint 数组；waypoint 实体由 WaypointLayer 渲染并自带 __waypointId 标记，
 * picker 只负责事件 → store action。
 */
export class WaypointPicker {
  private viewer: Cesium.Viewer;
  private handler: Cesium.ScreenSpaceEventHandler;
  private mode: PickerMode = 'drawing';
  private dragging: { waypointId: string } | null = null;
  private modeListeners: Array<(mode: PickerMode) => void> = [];

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

  getMode(): PickerMode {
    return this.mode;
  }

  onModeChange(cb: (mode: PickerMode) => void): () => void {
    this.modeListeners.push(cb);
    cb(this.mode);
    return () => {
      this.modeListeners = this.modeListeners.filter((l) => l !== cb);
    };
  }

  private setMode(mode: PickerMode): void {
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
      this.setMode('drawing');
    }
  }

  // ----- mouse -----

  private onLeftClick(screenPos: Cesium.Cartesian2): void {
    if (this.mode !== 'drawing') return;
    // 如果点击落在已有 waypoint 上 —— 选中而不是新增
    const hit = this.pickWaypointAt(screenPos);
    if (hit) {
      useMissionsStore.getState().selectWaypoint(hit);
      return;
    }
    const wgs = this.pickWgs84At(screenPos);
    if (!wgs) return;
    const store = useMissionsStore.getState();
    if (!store.currentMissionId) return;
    const id = store.addWaypoint({
      lon: wgs.lon,
      lat: wgs.lat,
      alt: store.missions.find((m) => m.id === store.currentMissionId)?.globalHeight ?? 60,
    });
    if (id) store.selectWaypoint(id);
  }

  private onLeftDown(screenPos: Cesium.Cartesian2): void {
    if (this.mode !== 'editing') return;
    const waypointId = this.pickWaypointAt(screenPos);
    if (!waypointId) return;
    this.dragging = { waypointId };
    useMissionsStore.getState().selectWaypoint(waypointId);
    this.lockCamera();
  }

  private onMouseMove(screenPos: Cesium.Cartesian2): void {
    if (!this.dragging) return;
    const wgs = this.pickWgs84At(screenPos);
    if (!wgs) return;
    useMissionsStore.getState().updateWaypoint(this.dragging.waypointId, {
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
    this.setMode(this.mode === 'drawing' ? 'editing' : 'drawing');
  }

  // ----- pick helpers -----

  /** 通过 scene.pick 找当前光标下的 waypoint Entity；命中返回 waypoint.id；否则 null */
  private pickWaypointAt(screenPos: Cesium.Cartesian2): string | null {
    const picked = this.viewer.scene.pick(screenPos);
    if (!picked) return null;
    const id = (picked.id as unknown as { __waypointId?: string } | null)?.__waypointId;
    return id ?? null;
  }

  /** 通过 pickFromRay → globe/tileset 命中 → ECEF → WGS84（自动反 GCJ-02） */
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
    if (cart && Number.isFinite(cart.x)) {
      return cartesian3ToWgs84(cart);
    }
    // pickFromRay 没命中（globe 关 / 没 tileset）→ fallback：射线打 globe
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

// ---- 提供静态 helper：从一个 waypoint 拿到 Cartesian3（外部 layer 用）----
export function waypointToCartesian3(wp: Pick<Waypoint, 'lon' | 'lat' | 'alt'>): Cesium.Cartesian3 {
  return wgs84ToCartesian3(wp.lon, wp.lat, wp.alt);
}
