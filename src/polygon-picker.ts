import * as Cesium from 'cesium';

export type PickerState = 'drawing' | 'editing';

interface VertexRef {
  id: string;
  pos: Cesium.Cartesian3;
}

type DragTarget = { type: 'vertex'; ref: VertexRef };

const SNAP_COLOR = '#00d2c0';
const VERTEX_COLOR = '#ffd24a';
const VERTEX_HOVER_COLOR = '#ffffff';
const MIDPOINT_COLOR = '#aab0c0';
const LINE_COLOR = '#ffd24a';

let _nextId = 0;
const newId = (): string => 'v' + ++_nextId;

/**
 * 点云多边形选择 + 编辑。
 *
 * 状态:
 *   - drawing: 左键加点 / 右键结束(≥3 顶点) / Esc 取消
 *               鼠标 hover 时 snap 到光标下渲染的点
 *               ≥3 顶点时主线自动闭合 (实时三角形 / 多边形)
 *               预览线从最后一个顶点延伸到 snap
 *   - editing: 顶点 + 中点 handle 可拖动
 *               拖中点 → 立刻在该边上插入新顶点并跟手
 *               Esc 清空回 drawing
 */
export class PolygonPicker {
  private viewer: Cesium.Viewer;
  private handler: Cesium.ScreenSpaceEventHandler;

  private state: PickerState = 'drawing';
  private vertices: VertexRef[] = [];
  private snapPos: Cesium.Cartesian3 | null = null;
  private dragTarget: DragTarget | null = null;
  private hoverHandle: Cesium.Entity | null = null;

  private snapMarker?: Cesium.Entity;
  private polyline?: Cesium.Entity;
  private previewLine?: Cesium.Entity;
  private vertexEntities = new Map<string, Cesium.Entity>();
  private midpointEntities: Cesium.Entity[] = [];

  private listeners: Array<(state: PickerState, count: number) => void> = [];
  private keyDown = (e: KeyboardEvent): void => this.onKey(e);

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer;
    this.handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
    this.createSnapMarker();
    this.createPolyline();
    this.createPreviewLine();
    this.bindMouse();
    window.addEventListener('keydown', this.keyDown);
  }

  onChange(cb: (state: PickerState, count: number) => void): void {
    this.listeners.push(cb);
    cb(this.state, this.vertices.length);
  }

  /** 右键结束 / 按钮触发的"完成绘制" */
  finishDrawing(): boolean {
    if (this.state !== 'drawing' || this.vertices.length < 3) return false;
    this.releaseDrag();
    this.state = 'editing';
    this.snapPos = null;
    this.refreshHandles();
    this.notify();
    return true;
  }

  /** Esc / "重新开始" — 清空回 drawing 空状态 */
  reset(): void {
    this.releaseDrag();
    this.vertices = [];
    this.snapPos = null;
    this.hoverHandle = null;
    this.refreshHandles();
    this.state = 'drawing';
    this.viewer.canvas.style.cursor = 'crosshair';
    this.notify();
  }

  destroy(): void {
    window.removeEventListener('keydown', this.keyDown);
    this.handler.destroy();
    if (this.snapMarker) this.viewer.entities.remove(this.snapMarker);
    if (this.polyline) this.viewer.entities.remove(this.polyline);
    if (this.previewLine) this.viewer.entities.remove(this.previewLine);
    for (const e of this.vertexEntities.values()) this.viewer.entities.remove(e);
    for (const e of this.midpointEntities) this.viewer.entities.remove(e);
    this.vertexEntities.clear();
    this.midpointEntities = [];
  }

  // ----- 鼠标 / 键盘 -----

  private bindMouse(): void {
    this.handler.setInputAction(
      (m: Cesium.ScreenSpaceEventHandler.MotionEvent) => this.onMouseMove(m.endPosition),
      Cesium.ScreenSpaceEventType.MOUSE_MOVE,
    );
    this.handler.setInputAction(
      (m: Cesium.ScreenSpaceEventHandler.PositionedEvent) => this.onLeftDown(m.position),
      Cesium.ScreenSpaceEventType.LEFT_DOWN,
    );
    this.handler.setInputAction(
      () => this.onLeftUp(),
      Cesium.ScreenSpaceEventType.LEFT_UP,
    );
    this.handler.setInputAction(
      (m: Cesium.ScreenSpaceEventHandler.PositionedEvent) => this.onLeftClick(m.position),
      Cesium.ScreenSpaceEventType.LEFT_CLICK,
    );
    this.handler.setInputAction(
      () => this.onRightClick(),
      Cesium.ScreenSpaceEventType.RIGHT_CLICK,
    );
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      this.reset();
      e.preventDefault();
    }
  }

  private onMouseMove(p: Cesium.Cartesian2): void {
    if (this.dragTarget) {
      this.dragMove(p);
      return;
    }
    if (this.state === 'editing') {
      this.updateHoverHandle(p);
    } else {
      this.updateSnap(p);
    }
  }

  private onLeftClick(p: Cesium.Cartesian2): void {
    if (this.state !== 'drawing') return;
    this.updateSnap(p);
    if (this.snapPos) this.addVertex(this.snapPos);
  }

  private onLeftDown(p: Cesium.Cartesian2): void {
    if (this.state !== 'editing') return;
    const handle = this.pickHandle(p);
    if (!handle) return;

    const vref = (handle as unknown as { __vref?: VertexRef }).__vref;
    const mp = (handle as unknown as { __midpoint?: { leftId: string } }).__midpoint;

    if (vref) {
      this.dragTarget = { type: 'vertex', ref: vref };
    } else if (mp) {
      // 拖中点：立刻在两端 vertex 之间插入新顶点，然后改为顶点拖动
      const leftIdx = this.vertices.findIndex((v) => v.id === mp.leftId);
      if (leftIdx < 0) return;
      const left = this.vertices[leftIdx];
      const right = this.vertices[(leftIdx + 1) % this.vertices.length];
      const midPos = Cesium.Cartesian3.midpoint(left.pos, right.pos, new Cesium.Cartesian3());
      const newRef: VertexRef = { id: newId(), pos: midPos };
      this.vertices.splice(leftIdx + 1, 0, newRef);
      this.refreshHandles();
      this.dragTarget = { type: 'vertex', ref: newRef };
    }

    if (this.dragTarget) {
      this.lockCamera(true);
      this.viewer.canvas.style.cursor = 'grabbing';
    }
  }

  private onLeftUp(): void {
    this.releaseDrag();
  }

  private onRightClick(): void {
    if (this.state === 'drawing') this.finishDrawing();
  }

  // ----- snap (drawing 模式) -----

  private updateSnap(p: Cesium.Cartesian2): void {
    if (this.state !== 'drawing') {
      this.snapPos = null;
      return;
    }
    const pos = this.pickWorld(p, this.collectOwnEntities());
    this.snapPos = pos;
  }

  // ----- hover handle (editing 模式) -----

  private updateHoverHandle(p: Cesium.Cartesian2): void {
    const handle = this.pickHandle(p);
    if (this.hoverHandle === handle) return;
    if (this.hoverHandle) this.applyHandleColor(this.hoverHandle, false);
    this.hoverHandle = handle ?? null;
    if (handle) this.applyHandleColor(handle, true);
    this.viewer.canvas.style.cursor = handle ? 'grab' : 'default';
  }

  private pickHandle(p: Cesium.Cartesian2): Cesium.Entity | null {
    const obj = this.viewer.scene.pick(p);
    if (!obj) return null;
    const id = obj.id;
    if (!(id instanceof Cesium.Entity)) return null;
    if ((id as unknown as { __vref?: unknown }).__vref) return id;
    if ((id as unknown as { __midpoint?: unknown }).__midpoint) return id;
    return null;
  }

  private applyHandleColor(handle: Cesium.Entity, hover: boolean): void {
    if (!handle.point) return;
    const isVertex = !!(handle as unknown as { __vref?: unknown }).__vref;
    const colorStr = hover
      ? VERTEX_HOVER_COLOR
      : isVertex
        ? VERTEX_COLOR
        : MIDPOINT_COLOR;
    handle.point.color = new Cesium.ConstantProperty(Cesium.Color.fromCssColorString(colorStr));
  }

  // ----- 拖动 -----

  private dragMove(p: Cesium.Cartesian2): void {
    if (!this.dragTarget) return;
    const pos = this.pickWorld(p, this.collectOwnEntities());
    if (pos) this.dragTarget.ref.pos = pos;
  }

  private releaseDrag(): void {
    if (!this.dragTarget) return;
    this.dragTarget = null;
    this.lockCamera(false);
    this.viewer.canvas.style.cursor = this.state === 'editing' ? 'default' : 'crosshair';
    // 顶点数没变就不重建中点 (拖中点会自动加 vertex 在 dragStart 时)
    this.refreshHandles();
  }

  private lockCamera(lock: boolean): void {
    const c = this.viewer.scene.screenSpaceCameraController;
    c.enableRotate = !lock;
    c.enableTranslate = !lock;
    c.enableTilt = !lock;
    c.enableLook = !lock;
  }

  // ----- 共用：从屏幕坐标拿真实世界坐标 -----

  private pickWorld(
    p: Cesium.Cartesian2,
    exclude: Cesium.Entity[],
  ): Cesium.Cartesian3 | null {
    const ray = this.viewer.camera.getPickRay(p);
    if (!ray) return null;
    const r = this.viewer.scene.pickFromRay(ray, exclude);
    const pos = r?.position;
    if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y) && Number.isFinite(pos.z)) {
      return pos;
    }
    return null;
  }

  private collectOwnEntities(): Cesium.Entity[] {
    const arr: Cesium.Entity[] = [];
    for (const e of this.vertexEntities.values()) arr.push(e);
    for (const e of this.midpointEntities) arr.push(e);
    if (this.snapMarker) arr.push(this.snapMarker);
    return arr;
  }

  // ----- vertices / handles -----

  private addVertex(pos: Cesium.Cartesian3): void {
    const ref: VertexRef = { id: newId(), pos: Cesium.Cartesian3.clone(pos) };
    this.vertices.push(ref);
    this.refreshHandles();
    this.notify();
  }

  private refreshHandles(): void {
    for (const e of this.vertexEntities.values()) this.viewer.entities.remove(e);
    this.vertexEntities.clear();
    for (const e of this.midpointEntities) this.viewer.entities.remove(e);
    this.midpointEntities = [];

    // 顶点
    this.vertices.forEach((v, idx) => {
      const entity = this.viewer.entities.add({
        position: new Cesium.CallbackPositionProperty(() => v.pos, false),
        point: {
          pixelSize: 12,
          color: Cesium.Color.fromCssColorString(VERTEX_COLOR),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 1,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: String(idx + 1),
          font: '12px sans-serif',
          fillColor: Cesium.Color.BLACK,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -16),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      (entity as unknown as { __vref: VertexRef }).__vref = v;
      this.vertexEntities.set(v.id, entity);
    });

    // 中点 (editing 模式 + ≥2 顶点)
    if (this.state === 'editing' && this.vertices.length >= 2) {
      for (let i = 0; i < this.vertices.length; i++) {
        const left = this.vertices[i];
        const right = this.vertices[(i + 1) % this.vertices.length];
        const entity = this.viewer.entities.add({
          position: new Cesium.CallbackPositionProperty(
            () => Cesium.Cartesian3.midpoint(left.pos, right.pos, new Cesium.Cartesian3()),
            false,
          ),
          point: {
            pixelSize: 8,
            color: Cesium.Color.fromCssColorString(MIDPOINT_COLOR).withAlpha(0.75),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 1,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
        (entity as unknown as { __midpoint: { leftId: string; rightId: string } }).__midpoint = {
          leftId: left.id,
          rightId: right.id,
        };
        this.midpointEntities.push(entity);
      }
    }
  }

  // ----- 静态 entities -----

  private createSnapMarker(): void {
    this.snapMarker = this.viewer.entities.add({
      position: new Cesium.CallbackPositionProperty(
        () => this.snapPos ?? Cesium.Cartesian3.ZERO,
        false,
      ),
      point: {
        pixelSize: 14,
        color: Cesium.Color.fromCssColorString(SNAP_COLOR).withAlpha(0.85),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      show: new Cesium.CallbackProperty(
        () => this.state === 'drawing' && this.snapPos !== null,
        false,
      ) as unknown as Cesium.Property,
    });
  }

  /** 主多边形线 —— 始终绑定 vertices；drawing 时 ≥3 顶点自动闭合，editing 时永远闭合 */
  private createPolyline(): void {
    this.polyline = this.viewer.entities.add({
      polyline: {
        positions: new Cesium.CallbackProperty(() => {
          if (this.vertices.length === 0) return [];
          const pts = this.vertices.map((v) => v.pos);
          const close =
            this.state === 'editing' ||
            (this.state === 'drawing' && this.vertices.length >= 3);
          return close ? [...pts, pts[0]] : pts;
        }, false),
        width: 2.5,
        material: Cesium.Color.fromCssColorString(LINE_COLOR),
        arcType: Cesium.ArcType.NONE,
        clampToGround: false,
      },
    });
  }

  /** drawing 模式下从最后一个顶点伸到 snap 的提议线 */
  private createPreviewLine(): void {
    this.previewLine = this.viewer.entities.add({
      polyline: {
        positions: new Cesium.CallbackProperty(() => {
          if (this.state !== 'drawing' || this.vertices.length === 0 || !this.snapPos) return [];
          const last = this.vertices[this.vertices.length - 1].pos;
          return [last, this.snapPos];
        }, false),
        width: 1.5,
        material: Cesium.Color.fromCssColorString(LINE_COLOR).withAlpha(0.55),
        arcType: Cesium.ArcType.NONE,
        clampToGround: false,
      },
    });
  }

  private notify(): void {
    for (const cb of this.listeners) cb(this.state, this.vertices.length);
  }
}
