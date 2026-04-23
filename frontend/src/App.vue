<script setup lang="ts">
import { onMounted, ref } from 'vue';
import * as Cesium from 'cesium';
import { createViewer, loadTileset } from './cesium/viewer';
import { extractCoarseHull } from './planner/hull';
import type { HullBox } from './planner/types';
import { buildDsm, type Dsm } from './planner/dsm';
import { generateViewpoints } from './planner/viewpoints';
import {
  buildProxyMesh,
  sampleSurfaceUniform,
  type ProxyMesh,
  type ShellSample,
} from './planner/proxyMesh';
import type { Waypoint } from './planner/types';

type Status = 'idle' | 'loading' | 'loaded' | 'error';

const viewerEl = ref<HTMLDivElement>();
const viewer = ref<Cesium.Viewer | null>(null);
const tileset = ref<Cesium.Cesium3DTileset | null>(null);

const url = ref('');
const status = ref<Status>('idle');
const errorMsg = ref('');

const hullLevel = ref(0);
const hullCount = ref<number | null>(null);
const hullPrimitive = ref<Cesium.Primitive | null>(null);

const dsmResolution = ref(2);
const dsmStats = ref<{ count: number; minH: number; maxH: number } | null>(null);
const dsmBuilding = ref(false);
const dsmProgress = ref<{ done: number; total: number } | null>(null);

const safetyDistance = ref(20);
const viewpointCount = ref<number | null>(null);
const viewpoints = ref<Waypoint[]>([]);
const viewpointPoints = ref<Cesium.PointPrimitiveCollection | null>(null);
const viewpointLines = ref<Cesium.Primitive | null>(null);

const dsm = ref<Dsm | null>(null);

const wallThreshold = ref(6);
const proxyMesh = ref<ProxyMesh | null>(null);
const proxyMeshPrim = ref<Cesium.Primitive | null>(null);
const proxyMeshStats = ref<{
  totalFaces: number;
  topFaces: number;
  wallFaces: number;
  totalArea: number;
} | null>(null);

const sampleN = ref(500);
const surfaceSamples = ref<ShellSample[]>([]);
const surfaceSamplesPrim = ref<Cesium.PointPrimitiveCollection | null>(null);
const surfaceSamplesStats = ref<{ total: number; top: number; wall: number } | null>(null);

onMounted(() => {
  if (viewerEl.value) viewer.value = createViewer(viewerEl.value);
});

async function onLoadClick() {
  if (!viewer.value || !url.value) return;
  if (hullPrimitive.value) {
    viewer.value.scene.primitives.remove(hullPrimitive.value);
    hullPrimitive.value = null;
  }
  hullCount.value = null;
  dsm.value = null;
  dsmStats.value = null;
  if (viewpointPoints.value) {
    viewer.value.scene.primitives.remove(viewpointPoints.value);
    viewpointPoints.value = null;
  }
  if (viewpointLines.value) {
    viewer.value.scene.primitives.remove(viewpointLines.value);
    viewpointLines.value = null;
  }
  viewpoints.value = [];
  viewpointCount.value = null;
  if (proxyMeshPrim.value) {
    viewer.value.scene.primitives.remove(proxyMeshPrim.value);
    proxyMeshPrim.value = null;
  }
  proxyMesh.value = null;
  proxyMeshStats.value = null;
  if (surfaceSamplesPrim.value) {
    viewer.value.scene.primitives.remove(surfaceSamplesPrim.value);
    surfaceSamplesPrim.value = null;
  }
  surfaceSamples.value = [];
  surfaceSamplesStats.value = null;
  if (tileset.value) {
    viewer.value.scene.primitives.remove(tileset.value);
    tileset.value = null;
  }
  status.value = 'loading';
  errorMsg.value = '';
  try {
    tileset.value = await loadTileset(viewer.value, url.value);
    status.value = 'loaded';
  } catch (e: any) {
    status.value = 'error';
    errorMsg.value = e?.message ?? String(e);
  }
}

function onRecenterClick() {
  if (tileset.value && viewer.value) {
    viewer.value.zoomTo(tileset.value);
  }
}

function onExtractClick() {
  if (!tileset.value) return;
  const boxes: HullBox[] = extractCoarseHull(tileset.value, hullLevel.value);
  hullCount.value = boxes.length;
  const maxHalf = boxes.length
    ? Math.max(
        ...boxes.map((b) => {
          const c0 = Cesium.Matrix3.getColumn(b.halfAxes, 0, new Cesium.Cartesian3());
          const c1 = Cesium.Matrix3.getColumn(b.halfAxes, 1, new Cesium.Cartesian3());
          const c2 = Cesium.Matrix3.getColumn(b.halfAxes, 2, new Cesium.Cartesian3());
          return Math.max(
            Cesium.Cartesian3.magnitude(c0),
            Cesium.Cartesian3.magnitude(c1),
            Cesium.Cartesian3.magnitude(c2),
          );
        }),
      )
    : 0;
  console.log(
    `[DualGaze] 提取 ${boxes.length} 个 OBB，最大半轴 ${maxHalf.toFixed(1)}m`,
    boxes,
  );
  drawHull(boxes);
}

async function onBuildDsmClick() {
  if (!viewer.value || !tileset.value) return;
  dsmBuilding.value = true;
  dsmProgress.value = { done: 0, total: 0 };
  try {
    const d = await buildDsm(viewer.value.scene, tileset.value, {
      resolution: dsmResolution.value,
      onProgress: (done, total) => {
        dsmProgress.value = { done, total };
      },
    });
    dsm.value = d;
    let validCount = 0;
    for (let k = 0; k < d.heights.length; k++) {
      if (Number.isFinite(d.heights[k])) validCount++;
    }
    dsmStats.value = { count: validCount, minH: d.minH, maxH: d.maxH };
    let zSum = 0;
    let zCount = 0;
    let maxTiltDeg = 0;
    if (d.normals) {
      for (let k = 0; k < d.heights.length; k++) {
        const nz = d.normals[3 * k + 2];
        if (!Number.isFinite(nz)) continue;
        zSum += nz;
        zCount++;
        const tiltDeg = (Math.acos(Math.min(1, Math.max(-1, nz))) * 180) / Math.PI;
        if (tiltDeg > maxTiltDeg) maxTiltDeg = tiltDeg;
      }
    }
    const avgNz = zCount ? zSum / zCount : 0;
    console.log(
      `[DualGaze] DSM 构建完成 ${d.width}×${d.height}=${d.heights.length} 点，` +
        `有效 ${validCount}，高度 ${d.minH.toFixed(1)}~${d.maxH.toFixed(1)}m，` +
        `平均法线 z=${avgNz.toFixed(3)}，最大倾角 ${maxTiltDeg.toFixed(1)}°`,
      d,
    );
  } catch (e: any) {
    console.error('[DualGaze] DSM 构建失败', e);
  } finally {
    dsmBuilding.value = false;
    dsmProgress.value = null;
  }
}

function onBuildProxyMeshClick() {
  if (!dsm.value) return;
  const mesh = buildProxyMesh(dsm.value, { wallThreshold: wallThreshold.value });
  proxyMesh.value = mesh;
  const totalFaces = mesh.faceAreas.length;
  proxyMeshStats.value = {
    totalFaces,
    topFaces: mesh.topFaceCount,
    wallFaces: mesh.wallFaceCount,
    totalArea: mesh.totalArea,
  };
  console.log(
    `[DualGaze] ProxyMesh 构建完成：顶面 ${mesh.topFaceCount} 三角 + 墙面 ${mesh.wallFaceCount} 三角（共 ${totalFaces}），` +
      `wallThreshold=${wallThreshold.value}m，总面积 ${mesh.totalArea.toFixed(0)} m²`,
    mesh,
  );
  drawProxyMesh(mesh);
}

function drawProxyMesh(mesh: ProxyMesh) {
  if (!viewer.value) return;
  if (proxyMeshPrim.value) {
    viewer.value.scene.primitives.remove(proxyMeshPrim.value);
    proxyMeshPrim.value = null;
  }
  if (mesh.triangles.length === 0) return;

  const positions = new Float64Array(mesh.vertices.length * 3);
  for (let k = 0; k < mesh.vertices.length; k++) {
    const v = mesh.vertices[k];
    positions[3 * k] = v.x;
    positions[3 * k + 1] = v.y;
    positions[3 * k + 2] = v.z;
  }
  const geom = new Cesium.Geometry({
    attributes: {
      position: new Cesium.GeometryAttribute({
        componentDatatype: Cesium.ComponentDatatype.DOUBLE,
        componentsPerAttribute: 3,
        values: positions,
      }),
    } as unknown as Cesium.GeometryAttributes,
    indices: new Uint32Array(mesh.triangles),
    primitiveType: Cesium.PrimitiveType.TRIANGLES,
    boundingSphere: Cesium.BoundingSphere.fromVertices(Array.from(positions)),
  });
  const instance = new Cesium.GeometryInstance({
    geometry: geom,
    attributes: {
      color: Cesium.ColorGeometryInstanceAttribute.fromColor(
        Cesium.Color.CYAN.withAlpha(0.4),
      ),
    },
  });
  proxyMeshPrim.value = viewer.value.scene.primitives.add(
    new Cesium.Primitive({
      geometryInstances: [instance],
      appearance: new Cesium.PerInstanceColorAppearance({
        flat: true,
        translucent: true,
        closed: false,
      }),
      asynchronous: false,
    }),
  );
}

function onSurfaceSampleClick() {
  if (!proxyMesh.value) return;
  const pts = sampleSurfaceUniform(proxyMesh.value, sampleN.value);
  surfaceSamples.value = pts;
  let top = 0;
  let wall = 0;
  for (const p of pts) {
    if (p.isWall) wall++;
    else top++;
  }
  surfaceSamplesStats.value = { total: pts.length, top, wall };
  console.log(
    `[DualGaze] 表面采样完成：${pts.length} 个点（顶面 ${top} + 墙面 ${wall}），` +
      `总面积 ${proxyMesh.value.totalArea.toFixed(0)} m²`,
  );
  drawSurfaceSamples(pts);
}

function drawSurfaceSamples(pts: ShellSample[]) {
  if (!viewer.value) return;
  if (surfaceSamplesPrim.value) {
    viewer.value.scene.primitives.remove(surfaceSamplesPrim.value);
    surfaceSamplesPrim.value = null;
  }
  if (pts.length === 0) return;
  const coll = new Cesium.PointPrimitiveCollection();
  const blue = Cesium.Color.DODGERBLUE;
  for (const p of pts) {
    coll.add({ position: p.positionEcef, color: blue, pixelSize: 10 });
  }
  surfaceSamplesPrim.value = viewer.value.scene.primitives.add(coll);
}

function onGenerateViewpointsClick() {
  if (surfaceSamples.value.length === 0) return;
  const vps = generateViewpoints(surfaceSamples.value, safetyDistance.value);
  viewpoints.value = vps;
  viewpointCount.value = vps.length;
  if (vps.length > 0) {
    const toDeg = (rad: number) => (rad * 180) / Math.PI;
    let pitchMin = Infinity;
    let pitchMax = -Infinity;
    let pitchSum = 0;
    let bucketDown = 0; // [-90° .. -60°]
    let bucketOblique = 0; // (-60° .. -30°]
    let bucketHoriz = 0; // (-30° .. 0°]
    let bucketOther = 0;
    for (const v of vps) {
      pitchSum += v.pitch;
      if (v.pitch < pitchMin) pitchMin = v.pitch;
      if (v.pitch > pitchMax) pitchMax = v.pitch;
      const deg = toDeg(v.pitch);
      if (deg <= -60) bucketDown++;
      else if (deg <= -30) bucketOblique++;
      else if (deg <= 0) bucketHoriz++;
      else bucketOther++;
    }
    const pct = (n: number) => ((n / vps.length) * 100).toFixed(1);
    console.log(
      `[DualGaze] 生成 ${vps.length} 个视点（safety=${safetyDistance.value}m），` +
        `pitch ${toDeg(pitchMin).toFixed(1)}°~${toDeg(pitchMax).toFixed(1)}°，` +
        `平均 ${toDeg(pitchSum / vps.length).toFixed(1)}°；` +
        `直方图：俯视 [-90°~-60°] ${bucketDown}(${pct(bucketDown)}%) / ` +
        `斜视 (-60°~-30°] ${bucketOblique}(${pct(bucketOblique)}%) / ` +
        `水平 (-30°~0°] ${bucketHoriz}(${pct(bucketHoriz)}%)` +
        (bucketOther > 0 ? ` / 其他 ${bucketOther}(${pct(bucketOther)}%)` : ''),
      vps.slice(0, 5),
    );
  }
  drawViewpoints(vps);
}

function drawViewpoints(vps: Waypoint[]) {
  if (!viewer.value) return;
  if (viewpointPoints.value) {
    viewer.value.scene.primitives.remove(viewpointPoints.value);
    viewpointPoints.value = null;
  }
  if (viewpointLines.value) {
    viewer.value.scene.primitives.remove(viewpointLines.value);
    viewpointLines.value = null;
  }
  if (vps.length === 0) return;

  const points = new Cesium.PointPrimitiveCollection();
  const lineInstances: Cesium.GeometryInstance[] = [];
  const lineLength = 2;
  const magenta = Cesium.Color.MAGENTA;

  for (const v of vps) {
    points.add({ position: v.position, color: magenta, pixelSize: 4 });

    const cosP = Math.cos(v.pitch);
    const dEast = Math.sin(v.heading) * cosP;
    const dNorth = Math.cos(v.heading) * cosP;
    const dUp = Math.sin(v.pitch);

    const enuToEcef = Cesium.Transforms.eastNorthUpToFixedFrame(v.position);
    const c0 = Cesium.Matrix4.getColumn(enuToEcef, 0, new Cesium.Cartesian4());
    const c1 = Cesium.Matrix4.getColumn(enuToEcef, 1, new Cesium.Cartesian4());
    const c2 = Cesium.Matrix4.getColumn(enuToEcef, 2, new Cesium.Cartesian4());
    const east = Cesium.Cartesian3.normalize(
      new Cesium.Cartesian3(c0.x, c0.y, c0.z),
      new Cesium.Cartesian3(),
    );
    const north = Cesium.Cartesian3.normalize(
      new Cesium.Cartesian3(c1.x, c1.y, c1.z),
      new Cesium.Cartesian3(),
    );
    const up = Cesium.Cartesian3.normalize(
      new Cesium.Cartesian3(c2.x, c2.y, c2.z),
      new Cesium.Cartesian3(),
    );
    const dirEcef = new Cesium.Cartesian3();
    Cesium.Cartesian3.add(
      Cesium.Cartesian3.multiplyByScalar(east, dEast, new Cesium.Cartesian3()),
      Cesium.Cartesian3.multiplyByScalar(north, dNorth, new Cesium.Cartesian3()),
      dirEcef,
    );
    Cesium.Cartesian3.add(
      dirEcef,
      Cesium.Cartesian3.multiplyByScalar(up, dUp, new Cesium.Cartesian3()),
      dirEcef,
    );

    const end = Cesium.Cartesian3.add(
      v.position,
      Cesium.Cartesian3.multiplyByScalar(dirEcef, lineLength, new Cesium.Cartesian3()),
      new Cesium.Cartesian3(),
    );

    lineInstances.push(
      new Cesium.GeometryInstance({
        geometry: new Cesium.PolylineGeometry({
          positions: [v.position, end],
          width: 1,
        }),
        attributes: {
          color: Cesium.ColorGeometryInstanceAttribute.fromColor(magenta),
        },
      }),
    );
  }

  viewpointPoints.value = viewer.value.scene.primitives.add(points);
  viewpointLines.value = viewer.value.scene.primitives.add(
    new Cesium.Primitive({
      geometryInstances: lineInstances,
      appearance: new Cesium.PolylineColorAppearance({ translucent: false }),
      asynchronous: false,
    }),
  );
}

function drawHull(boxes: HullBox[]) {
  if (!viewer.value) return;
  if (hullPrimitive.value) {
    viewer.value.scene.primitives.remove(hullPrimitive.value);
    hullPrimitive.value = null;
  }
  if (boxes.length === 0) return;
  const instances = boxes.map(
    (b) =>
      new Cesium.GeometryInstance({
        geometry: Cesium.BoxOutlineGeometry.fromDimensions({
          dimensions: new Cesium.Cartesian3(2, 2, 2),
        }),
        modelMatrix: Cesium.Matrix4.fromRotationTranslation(b.halfAxes, b.center),
        attributes: {
          color: Cesium.ColorGeometryInstanceAttribute.fromColor(Cesium.Color.YELLOW),
        },
      }),
  );
  hullPrimitive.value = viewer.value.scene.primitives.add(
    new Cesium.Primitive({
      geometryInstances: instances,
      appearance: new Cesium.PerInstanceColorAppearance({
        flat: true,
        translucent: false,
      }),
      asynchronous: false,
    }),
  );
}
</script>

<template>
  <div class="app">
    <aside class="panel">
      <h1>DualGaze · 重眸</h1>

      <label class="field-label" for="tileset-url">Tileset URL</label>
      <input
        id="tileset-url"
        v-model="url"
        class="text-input"
        type="text"
        placeholder="https://…/tileset.json"
        spellcheck="false"
        autocomplete="off"
      />

      <button
        class="primary-btn"
        :disabled="!url || status === 'loading'"
        @click="onLoadClick"
      >
        {{ status === 'loading' ? '加载中…' : '加载模型' }}
      </button>

      <div v-if="status === 'loading'" class="status-card status-loading">
        加载中…
      </div>
      <div v-else-if="status === 'loaded'" class="status-card status-loaded">
        <div>已加载</div>
        <button class="ghost-btn" @click="onRecenterClick">定位到模型</button>

        <label class="field-label hull-label" for="hull-level">OBB 层级</label>
        <input
          id="hull-level"
          type="number"
          min="0"
          max="20"
          v-model.number="hullLevel"
          class="text-input"
        />
        <button class="ghost-btn" @click="onExtractClick">提取包围盒</button>
        <div v-if="hullCount !== null" class="caption">已提取 {{ hullCount }} 个 OBB</div>

        <label class="field-label hull-label" for="dsm-res">DSM 分辨率 (m)</label>
        <input
          id="dsm-res"
          type="number"
          min="0.5"
          max="10"
          step="0.5"
          v-model.number="dsmResolution"
          class="text-input"
        />
        <button
          class="ghost-btn"
          :disabled="dsmBuilding"
          @click="onBuildDsmClick"
        >
          {{ dsmBuilding ? '构建中…' : '构建 DSM' }}
        </button>
        <div
          v-if="dsmBuilding && dsmProgress && dsmProgress.total > 0"
          class="caption"
        >
          <progress
            class="dsm-progress"
            :value="dsmProgress.done"
            :max="dsmProgress.total"
          ></progress>
          {{ dsmProgress.done }} / {{ dsmProgress.total }}
          ({{ Math.round((dsmProgress.done / dsmProgress.total) * 100) }}%)
        </div>
        <div v-if="dsmStats" class="caption">
          DSM {{ dsmStats.count }} 点 · 高度
          {{ dsmStats.minH.toFixed(1) }}~{{ dsmStats.maxH.toFixed(1) }}m
        </div>

        <label class="field-label hull-label" for="wall-thresh">墙阈值 (m)</label>
        <input
          id="wall-thresh"
          type="number"
          min="1"
          max="50"
          step="0.5"
          v-model.number="wallThreshold"
          class="text-input"
        />
        <button
          class="ghost-btn"
          :disabled="!dsm"
          @click="onBuildProxyMeshClick"
        >
          构建 Proxy Mesh
        </button>
        <div v-if="proxyMeshStats" class="caption">
          ProxyMesh {{ proxyMeshStats.totalFaces }} 三角（顶 {{ proxyMeshStats.topFaces }} + 墙
          {{ proxyMeshStats.wallFaces }}）· {{ proxyMeshStats.totalArea.toFixed(0) }} m²
        </div>

        <label class="field-label hull-label" for="safety-dist">视点距离 (m)</label>
        <input
          id="safety-dist"
          type="number"
          min="5"
          max="100"
          step="1"
          v-model.number="safetyDistance"
          class="text-input"
        />

        <label class="field-label hull-label" for="sample-n">采样数 N</label>
        <input
          id="sample-n"
          type="number"
          min="50"
          max="5000"
          step="50"
          v-model.number="sampleN"
          class="text-input"
        />
        <button
          class="ghost-btn"
          :disabled="!proxyMesh"
          @click="onSurfaceSampleClick"
        >
          表面采样
        </button>
        <div v-if="surfaceSamplesStats" class="caption">
          采样 {{ surfaceSamplesStats.total }} 点（顶 {{ surfaceSamplesStats.top }} +
          墙 {{ surfaceSamplesStats.wall }}）
        </div>

        <button
          class="ghost-btn"
          :disabled="!surfaceSamples.length"
          @click="onGenerateViewpointsClick"
        >
          生成视点
        </button>
        <div v-if="viewpointCount !== null" class="caption">
          已生成 {{ viewpointCount }} 个视点
        </div>

      </div>
      <div v-else-if="status === 'error'" class="status-card status-error">
        {{ errorMsg || '加载失败' }}
      </div>
    </aside>
    <div ref="viewerEl" class="viewer"></div>
  </div>
</template>

<style>
html, body, #app {
  margin: 0;
  height: 100%;
  background: #0b0b0f;
  font-family: system-ui, -apple-system, sans-serif;
  color: #e6e6e6;
}
.app {
  display: flex;
  height: 100vh;
  width: 100vw;
}
.panel {
  width: 320px;
  flex-shrink: 0;
  padding: 16px;
  background: #1e1e1e;
  border-right: 1px solid #333;
  overflow-y: auto;
  box-sizing: border-box;
}
.panel h1 {
  font-size: 20px;
  margin: 0 0 16px;
}
.viewer {
  flex: 1;
  position: relative;
  min-width: 0;
}

.field-label {
  display: block;
  font-size: 12px;
  color: #9a9a9a;
  margin-bottom: 6px;
  letter-spacing: 0.02em;
}
.text-input {
  width: 100%;
  box-sizing: border-box;
  background: #141418;
  color: #e6e6e6;
  border: 1px solid #333;
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 13px;
  font-family: inherit;
  outline: none;
}
.text-input:focus {
  border-color: #4a90e2;
}
.primary-btn {
  width: 100%;
  margin-top: 10px;
  padding: 9px 12px;
  background: #2f6fb5;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.primary-btn:hover:not(:disabled) {
  background: #367cc8;
}
.primary-btn:disabled {
  background: #2a2a2a;
  color: #666;
  cursor: not-allowed;
}

.status-card {
  margin-top: 14px;
  padding: 10px 12px;
  border-left: 3px solid #555;
  background: #181820;
  border-radius: 3px;
  font-size: 13px;
  color: #cfcfcf;
}
.status-loading {
  border-left-color: #777;
  color: #bbb;
}
.status-loaded {
  border-left-color: #4caf50;
  color: #cfe8d0;
}
.status-error {
  border-left-color: #e5484d;
  color: #f2b8ba;
  background: #241616;
  word-break: break-word;
}

.ghost-btn {
  margin-top: 8px;
  padding: 6px 10px;
  background: transparent;
  color: #cfe8d0;
  border: 1px solid #3a4a3a;
  border-radius: 4px;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}
.ghost-btn:hover {
  border-color: #5a7a5a;
  color: #e0f0e0;
}

.hull-label {
  margin-top: 10px;
}
.caption {
  margin-top: 6px;
  font-size: 12px;
  color: #9a9a9a;
}

.dsm-progress {
  width: 100%;
  margin-top: 4px;
  display: block;
  height: 8px;
}
</style>
