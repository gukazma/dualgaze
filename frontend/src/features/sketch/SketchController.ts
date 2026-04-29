import {
  CallbackProperty,
  Cartesian3,
  Cartographic,
  Color,
  HeadingPitchRange,
  IntersectionTests,
  Math as CMath,
  Plane,
  PolygonHierarchy,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
} from 'cesium';
import type { Entity, Viewer } from 'cesium';

export type SketchMode = 'idle' | 'drawing' | 'extruding' | 'extruded';

export interface SketchSnapshot {
  mode: SketchMode;
  vertexCount: number;
  height: number | null;
}

const ACCENT_HEX = '#6EC8E0';
const FILL_OPACITY_DRAWING = 0.18;
const FILL_OPACITY_CLOSED = 0.22;
const FILL_OPACITY_EXTRUDED = 0.3;
const OUTLINE_WIDTH = 2;
const DEFAULT_EXTRUDE_M = 50;
const MIN_HEIGHT = 1;
const MAX_HEIGHT = 5000;
const PIXEL_SCALE_DENOM = 800; // larger denom = slower drag; tuned for camera altitude 800-8000m

type Listener = (snapshot: SketchSnapshot) => void;

export class SketchController {
  private readonly viewer: Viewer;
  private readonly listener: Listener;
  private readonly handler: ScreenSpaceEventHandler;

  private mode: SketchMode = 'idle';
  private positions: Cartesian3[] = [];
  private hover: Cartesian3 | null = null;
  private baseAltitude: number | null = null;
  private height: number | null = null;
  private entity: Entity | null = null;

  // extruding mouse-drag state
  private mouseLocked = false;
  private isLeftDown = false;
  // Absolute drag baseline: when LEFT_DOWN fires we snapshot mouse-Y and the
  // current height; mousemove computes height from |dragStartY - currentY|, so
  // the cursor maps 1:1 to a height — moving the mouse back to the press point
  // restores the original height exactly.
  private dragStartY: number | null = null;
  private dragStartHeight: number | null = null;
  private savedEnableTranslate: boolean | null = null;
  private savedEnableRotate: boolean | null = null;

  constructor(viewer: Viewer, listener: Listener) {
    this.viewer = viewer;
    this.listener = listener;
    this.handler = new ScreenSpaceEventHandler(viewer.canvas);

    this.handler.setInputAction(this.onLeftClick, ScreenSpaceEventType.LEFT_CLICK);
    this.handler.setInputAction(this.onLeftDown, ScreenSpaceEventType.LEFT_DOWN);
    this.handler.setInputAction(this.onLeftUp, ScreenSpaceEventType.LEFT_UP);
    this.handler.setInputAction(this.onMouseMove, ScreenSpaceEventType.MOUSE_MOVE);
    this.handler.setInputAction(
      this.onLeftDoubleClick,
      ScreenSpaceEventType.LEFT_DOUBLE_CLICK,
    );
  }

  start(): void {
    this.removeEntity();
    this.resetData();
    // Snap camera straight-down above the tileset (or stay if no tileset).
    // pickEllipsoid + sampleHeight only line up with the tile surface when the
    // pick ray is near-vertical; otherwise the ray's ground-projection lies
    // hundreds of meters away from the tile, and sampleHeight returns either
    // undefined or wildly off values for that off-tile lat/lon.
    this.flyToTopDownAboveTileset();
    this.mode = 'drawing';
    this.createPreviewEntity();
    this.emit();
  }

  private flyToTopDownAboveTileset(): void {
    const prims = this.viewer.scene.primitives;
    for (let i = prims.length - 1; i >= 0; i--) {
      const p = prims.get(i) as
        | { boundingSphere?: { center?: Cartesian3; radius?: number } }
        | undefined;
      const bs = p?.boundingSphere;
      if (!bs?.center || typeof bs.radius !== 'number' || bs.radius <= 0) continue;
      // Use flyToBoundingSphere — its offset.HeadingPitchRange is in local ENU
      // (so pitch=-π/2 truly looks down) and duration > 0 avoids the path-zero
      // NaN bug. After landing, camera is in world frame (no anchor) so
      // pickEllipsoid / getPickRay return correct world-space rays.
      this.viewer.camera.flyToBoundingSphere(bs as never, {
        offset: new HeadingPitchRange(
          0,
          -CMath.PI_OVER_TWO + 0.0001, // shy of exact π/2 to avoid degenerate up vector
          Math.max(bs.radius * 4, 200),
        ),
        duration: 0.5,
      });
      return;
    }
  }

  cancel(): void {
    if (this.mode !== 'drawing' && this.mode !== 'extruding') return;
    this.restoreCameraControl();
    this.removeEntity();
    this.resetData();
    this.mode = 'idle';
    this.emit();
  }

  close(): boolean {
    if (this.mode !== 'drawing') return false;
    if (this.positions.length < 3) {
      console.warn('[sketch] close requires at least 3 vertices');
      return false;
    }
    this.hover = null;
    this.staticizeEntity();
    this.startExtruding();
    return true;
  }

  setExtrudedHeight(meters: number): void {
    if (this.mode !== 'extruding') return;
    if (!Number.isFinite(meters)) return;
    const clamped = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, meters));
    this.height = clamped;
    // No need to mutate polygon.extrudedHeight — it's a CallbackProperty that
    // reads `this.height` every frame.
    this.emit();
  }

  commitExtrude(): void {
    if (this.mode !== 'extruding') return;
    this.restoreCameraControl();
    this.mode = 'extruded';
    this.isLeftDown = false;
    this.dragStartY = null;
    this.dragStartHeight = null;
    this.emit();
  }

  setMouseLocked(locked: boolean): void {
    if (this.mouseLocked === locked) return;
    this.mouseLocked = locked;
  }

  clearAll(): void {
    this.restoreCameraControl();
    this.removeEntity();
    this.resetData();
    this.mode = 'idle';
    this.emit();
  }

  dispose(): void {
    try {
      this.restoreCameraControl();
    } catch {
      /* viewer may already be destroyed */
    }
    try {
      this.handler.destroy();
    } catch {
      /* viewer may already be destroyed */
    }
    this.removeEntity();
    this.resetData();
  }

  private restoreCameraControl(): void {
    if (this.savedEnableTranslate === null) return;
    try {
      const c = this.viewer.scene.screenSpaceCameraController;
      c.enableTranslate = this.savedEnableTranslate;
      if (this.savedEnableRotate !== null) c.enableRotate = this.savedEnableRotate;
    } catch {
      /* scene may already be destroyed */
    }
    this.savedEnableTranslate = null;
    this.savedEnableRotate = null;
  }

  private resetData(): void {
    this.positions = [];
    this.hover = null;
    this.baseAltitude = null;
    this.height = null;
    this.mouseLocked = false;
    this.isLeftDown = false;
    this.dragStartY = null;
    this.dragStartHeight = null;
  }

  private removeEntity(): void {
    if (!this.entity) return;
    try {
      this.viewer.entities.remove(this.entity);
    } catch {
      /* viewer may already be destroyed during HMR / unmount */
    }
    this.entity = null;
  }

  private emit(): void {
    this.listener({
      mode: this.mode,
      vertexCount: this.positions.length,
      height: this.height,
    });
  }

  private pickToBase(windowPos: { x: number; y: number }): Cartesian3 | null {
    const ellipsoid = this.viewer.scene.globe.ellipsoid;

    // First click: determine the sketch plane altitude (uses ground projection
    // only as a lon/lat seed for sampleHeight; the first vertex itself comes
    // from ray-plane intersection below — same path as subsequent vertices —
    // so the polygon is geometrically consistent).
    if (this.baseAltitude === null) {
      const ground = this.viewer.camera.pickEllipsoid(
        windowPos as never,
        ellipsoid,
      );
      if (!ground) return null;
      const groundCarto = Cartographic.fromCartesian(ground, ellipsoid);
      const tsCenterAlt = this.findTilesetCenterAltitude();
      let h: number | undefined;
      if (this.viewer.scene.sampleHeightSupported) {
        const sampled = this.viewer.scene.sampleHeight(groundCarto);
        if (
          typeof sampled === 'number' &&
          Number.isFinite(sampled) &&
          tsCenterAlt !== null &&
          Math.abs(sampled - tsCenterAlt) < 200
        ) {
          h = sampled;
        }
      }
      this.baseAltitude = h ?? tsCenterAlt ?? groundCarto.height;
    }

    // Project the click ray onto the sketch plane at baseAltitude.
    return this.rayPlaneIntersect(windowPos);
  }

  private rayPlaneIntersect(windowPos: {
    x: number;
    y: number;
  }): Cartesian3 | null {
    if (this.baseAltitude === null) return null;
    const ellipsoid = this.viewer.scene.globe.ellipsoid;
    // Use ground projection lon/lat as a seed for plane origin — for a tangent
    // plane the choice of origin only matters via the surface normal direction,
    // and at small (<~5km) sketch radii the normal is essentially constant
    // across the area, so this is fine.
    const ground = this.viewer.camera.pickEllipsoid(
      windowPos as never,
      ellipsoid,
    );
    if (!ground) return null;
    const groundCarto = Cartographic.fromCartesian(ground, ellipsoid);
    const planeOrigin = Cartesian3.fromRadians(
      groundCarto.longitude,
      groundCarto.latitude,
      this.baseAltitude,
      ellipsoid,
    );
    const normal = ellipsoid.geodeticSurfaceNormal(
      planeOrigin,
      new Cartesian3(),
    );
    const plane = Plane.fromPointNormal(planeOrigin, normal);
    const ray = this.viewer.camera.getPickRay(windowPos as never);
    if (!ray) return planeOrigin;
    const hit = IntersectionTests.rayPlane(ray, plane);
    if (!hit) return planeOrigin;
    // Snap altitude precisely so all vertices share the exact same plane.
    const hitCarto = Cartographic.fromCartesian(hit, ellipsoid);
    return Cartesian3.fromRadians(
      hitCarto.longitude,
      hitCarto.latitude,
      this.baseAltitude,
      ellipsoid,
    );
  }

  private findTilesetCenterAltitude(): number | null {
    const ellipsoid = this.viewer.scene.globe.ellipsoid;
    const prims = this.viewer.scene.primitives;
    // Walk backwards so user-added tilesets (appended at end) are tried first.
    for (let i = prims.length - 1; i >= 0; i--) {
      const p = prims.get(i) as
        | { boundingSphere?: { center?: Cartesian3; radius?: number } }
        | undefined;
      const bs = p?.boundingSphere;
      if (!bs?.center || typeof bs.radius !== 'number' || bs.radius <= 0) continue;
      const carto = Cartographic.fromCartesian(bs.center, ellipsoid);
      if (
        Number.isFinite(carto.height) &&
        carto.height > -1000 &&
        carto.height < 50000
      ) {
        return carto.height;
      }
    }
    return null;
  }

  // (projection lives inline in pickToBase now)

  private createPreviewEntity(): void {
    const fill = Color.fromCssColorString(ACCENT_HEX).withAlpha(FILL_OPACITY_DRAWING);
    const outline = Color.fromCssColorString(ACCENT_HEX);

    this.entity = this.viewer.entities.add({
      name: 'dualgaze-sketch',
      polyline: {
        positions: new CallbackProperty(() => {
          if (this.positions.length === 0) return [];
          const tail = this.hover ? [...this.positions, this.hover] : this.positions;
          return [...tail, tail[0]];
        }, false),
        width: OUTLINE_WIDTH,
        material: outline,
        clampToGround: false,
      },
      polygon: {
        hierarchy: new CallbackProperty(() => {
          const pts = this.hover ? [...this.positions, this.hover] : this.positions;
          return new PolygonHierarchy(pts);
        }, false),
        material: fill,
        perPositionHeight: true,
      },
    });
  }

  private staticizeEntity(): void {
    if (!this.entity || !this.entity.polyline || !this.entity.polygon) return;
    const positions = this.positions.slice();
    this.entity.polyline.positions = [...positions, positions[0]] as unknown as never;
    this.entity.polygon.hierarchy = new PolygonHierarchy(positions) as unknown as never;
    this.entity.polygon.material = Color.fromCssColorString(ACCENT_HEX).withAlpha(
      FILL_OPACITY_CLOSED,
    ) as unknown as never;
  }

  private startExtruding(): void {
    if (!this.entity || !this.entity.polygon || this.baseAltitude === null) return;
    this.mode = 'extruding';
    this.height = DEFAULT_EXTRUDE_M;
    this.isLeftDown = false;
    this.dragStartY = null;
    this.dragStartHeight = null;
    // Take ownership of left-drag during extrude so Cesium's default camera
    // controls don't fight our drag handler. In 3D mode left-drag is BOTH
    // translate (Columbus view) and rotate (free spinning the globe), so both
    // need to be disabled.
    const c = this.viewer.scene.screenSpaceCameraController;
    if (this.savedEnableTranslate === null) {
      this.savedEnableTranslate = c.enableTranslate;
      this.savedEnableRotate = c.enableRotate;
      c.enableTranslate = false;
      c.enableRotate = false;
    }
    // Order matters: turn off perPositionHeight before height to avoid Cesium
    // warning "polygons cannot have both height and perPositionHeight".
    this.entity.polygon.perPositionHeight = false as unknown as never;
    this.entity.polygon.height = this.baseAltitude as unknown as never;
    // Use a CallbackProperty for extrudedHeight so Cesium re-evaluates it every
    // frame instead of treating each `= number` as a new ConstantProperty
    // (which collapses many rapid updates into a single geometry rebuild on
    // mouse-up — the whole reason the prism only "moved" after release).
    this.entity.polygon.extrudedHeight = new CallbackProperty(() => {
      return (this.baseAltitude ?? 0) + (this.height ?? DEFAULT_EXTRUDE_M);
    }, false) as unknown as never;
    this.entity.polygon.outline = true as unknown as never;
    this.entity.polygon.outlineColor = Color.fromCssColorString(ACCENT_HEX) as unknown as never;
    this.entity.polygon.material = Color.fromCssColorString(ACCENT_HEX).withAlpha(
      FILL_OPACITY_EXTRUDED,
    ) as unknown as never;
    this.emit();
  }

  private onLeftClick = (event: { position: { x: number; y: number } }): void => {
    if (this.mode === 'drawing') {
      const pos = this.pickToBase(event.position);
      if (!pos) return;
      this.positions.push(pos);
      this.emit();
    } else if (this.mode === 'extruding') {
      // A "click" in Cesium = quick down+up at the same spot (no drag in between).
      // Drag fires LEFT_DOWN + mousemoves + LEFT_UP but no LEFT_CLICK, so this
      // path is unambiguously a non-drag click → commit.
      this.commitExtrude();
    }
  };

  private onLeftDown = (event: { position: { x: number; y: number } }): void => {
    if (this.mode !== 'extruding') return;
    this.isLeftDown = true;
    this.dragStartY = event.position.y;
    this.dragStartHeight = this.height ?? DEFAULT_EXTRUDE_M;
  };

  private onLeftUp = (): void => {
    if (this.mode !== 'extruding') return;
    this.isLeftDown = false;
    this.dragStartY = null;
    this.dragStartHeight = null;
  };

  private onMouseMove = (event: { endPosition: { x: number; y: number } }): void => {
    if (this.mode === 'drawing') {
      const pos = this.pickToBase(event.endPosition);
      this.hover = pos ?? null;
      return;
    }
    if (
      this.mode === 'extruding' &&
      this.isLeftDown &&
      !this.mouseLocked &&
      this.dragStartY !== null &&
      this.dragStartHeight !== null
    ) {
      // Absolute mapping: 1 cursor position ↔ 1 height.
      const dy = this.dragStartY - event.endPosition.y; // positive when above press point
      const camHeight = this.viewer.camera.positionCartographic.height;
      const scale = Math.max(camHeight / PIXEL_SCALE_DENOM, 0.3);
      const next = this.dragStartHeight + dy * scale;
      this.setExtrudedHeight(next);
    }
  };

  private onLeftDoubleClick = (): void => {
    if (this.mode !== 'drawing') return;
    // Strip the duplicate vertex added by the second LEFT_CLICK in the
    // double-click sequence (Cesium fires two LEFT_CLICK events, then DOUBLE).
    if (this.positions.length >= 2) {
      const last = this.positions[this.positions.length - 1];
      const prev = this.positions[this.positions.length - 2];
      if (last && prev && Cartesian3.equals(last, prev)) {
        this.positions.pop();
      }
    }
    if (this.positions.length >= 3) {
      this.close();
    } else {
      this.emit();
    }
  };
}
