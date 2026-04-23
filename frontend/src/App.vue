<script setup lang="ts">
import { onMounted, ref } from 'vue';
import * as Cesium from 'cesium';
import { createViewer, loadTileset } from './cesium/viewer';
import { extractCoarseHull } from './planner/hull';
import type { HullBox } from './planner/types';
import { buildDsm, type Dsm } from './planner/dsm';

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
const dsm = ref<Dsm | null>(null);
const dsmMeshPrim = ref<Cesium.Primitive | null>(null);

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
  if (dsmMeshPrim.value) {
    viewer.value.scene.primitives.remove(dsmMeshPrim.value);
    dsmMeshPrim.value = null;
  }
  dsm.value = null;
  dsmStats.value = null;
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
    drawDsmMesh(d);
  } catch (e: any) {
    console.error('[DualGaze] DSM 构建失败', e);
  } finally {
    dsmBuilding.value = false;
    dsmProgress.value = null;
  }
}

function drawDsmMesh(d: Dsm) {
  if (!viewer.value) return;
  if (dsmMeshPrim.value) {
    viewer.value.scene.primitives.remove(dsmMeshPrim.value);
    dsmMeshPrim.value = null;
  }
  if (d.heights.length === 0) return;

  const positions: number[] = [];
  const vertIdx = new Map<number, number>();
  const indices: number[] = [];
  const getOrCreateIdx = (k: number): number => {
    const existing = vertIdx.get(k);
    if (existing !== undefined) return existing;
    const carto = Cesium.Cartographic.clone(d.cartographics[k]);
    carto.height = d.heights[k];
    const pos = Cesium.Cartographic.toCartesian(carto);
    const idx = positions.length / 3;
    positions.push(pos.x, pos.y, pos.z);
    vertIdx.set(k, idx);
    return idx;
  };

  for (let j = 0; j < d.height - 1; j++) {
    for (let i = 0; i < d.width - 1; i++) {
      const k00 = j * d.width + i;
      const k10 = j * d.width + i + 1;
      const k01 = (j + 1) * d.width + i;
      const k11 = (j + 1) * d.width + i + 1;
      if (
        !Number.isFinite(d.heights[k00]) ||
        !Number.isFinite(d.heights[k10]) ||
        !Number.isFinite(d.heights[k01]) ||
        !Number.isFinite(d.heights[k11])
      ) continue;
      const i00 = getOrCreateIdx(k00);
      const i10 = getOrCreateIdx(k10);
      const i01 = getOrCreateIdx(k01);
      const i11 = getOrCreateIdx(k11);
      indices.push(i00, i10, i11, i00, i11, i01);
    }
  }
  if (indices.length === 0) return;

  const positionsArr = new Float64Array(positions);
  const geom = new Cesium.Geometry({
    attributes: {
      position: new Cesium.GeometryAttribute({
        componentDatatype: Cesium.ComponentDatatype.DOUBLE,
        componentsPerAttribute: 3,
        values: positionsArr,
      }),
    } as unknown as Cesium.GeometryAttributes,
    indices: new Uint32Array(indices),
    primitiveType: Cesium.PrimitiveType.TRIANGLES,
    boundingSphere: Cesium.BoundingSphere.fromVertices(Array.from(positionsArr)),
  });
  const instance = new Cesium.GeometryInstance({
    geometry: geom,
    attributes: {
      color: Cesium.ColorGeometryInstanceAttribute.fromColor(
        Cesium.Color.CYAN.withAlpha(0.4),
      ),
    },
  });
  dsmMeshPrim.value = viewer.value.scene.primitives.add(
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
