import * as Cesium from 'cesium';
import type { Dsm } from './dsm';

export interface SafetyShell {
  width: number;
  height: number;
  dx: number;
  dy: number;
  origin: Cesium.Cartographic;
  east: Cesium.Cartesian3;
  north: Cesium.Cartesian3;
  up: Cesium.Cartesian3;
  positions: Cesium.Cartesian3[];
  normals: Cesium.Cartesian3[];
}

export interface SamplePoint {
  positionEcef: Cesium.Cartesian3;
  normalEcef: Cesium.Cartesian3;
  dsmIndex: number;
}

export function buildSafetyShell(d: Dsm, offsetDistance: number): SafetyShell {
  const n = d.heights.length;
  const positions: Cesium.Cartesian3[] = new Array(n);
  const normalsEcef: Cesium.Cartesian3[] = new Array(n);
  const nanVec = () => new Cesium.Cartesian3(NaN, NaN, NaN);

  if (!d.normals) {
    for (let k = 0; k < n; k++) {
      positions[k] = nanVec();
      normalsEcef[k] = nanVec();
    }
    return {
      width: d.width,
      height: d.height,
      dx: d.dx,
      dy: d.dy,
      origin: d.origin,
      east: d.east,
      north: d.north,
      up: d.up,
      positions,
      normals: normalsEcef,
    };
  }

  for (let k = 0; k < n; k++) {
    const hv = d.heights[k];
    const ne = d.normals[3 * k];
    const nn = d.normals[3 * k + 1];
    const nu = d.normals[3 * k + 2];
    if (
      !Number.isFinite(hv) ||
      !Number.isFinite(ne) ||
      !Number.isFinite(nn) ||
      !Number.isFinite(nu)
    ) {
      positions[k] = nanVec();
      normalsEcef[k] = nanVec();
      continue;
    }

    const carto = Cesium.Cartographic.clone(d.cartographics[k]);
    carto.height = hv;
    const surfacePos = Cesium.Cartographic.toCartesian(carto);

    const eastTerm = Cesium.Cartesian3.multiplyByScalar(d.east, ne, new Cesium.Cartesian3());
    const northTerm = Cesium.Cartesian3.multiplyByScalar(d.north, nn, new Cesium.Cartesian3());
    const upTerm = Cesium.Cartesian3.multiplyByScalar(d.up, nu, new Cesium.Cartesian3());
    const nWorld = Cesium.Cartesian3.add(eastTerm, northTerm, new Cesium.Cartesian3());
    Cesium.Cartesian3.add(nWorld, upTerm, nWorld);
    Cesium.Cartesian3.normalize(nWorld, nWorld);

    const offset = Cesium.Cartesian3.multiplyByScalar(nWorld, offsetDistance, new Cesium.Cartesian3());
    const shellPos = Cesium.Cartesian3.add(surfacePos, offset, new Cesium.Cartesian3());

    positions[k] = shellPos;
    normalsEcef[k] = nWorld;
  }

  return {
    width: d.width,
    height: d.height,
    dx: d.dx,
    dy: d.dy,
    origin: d.origin,
    east: d.east,
    north: d.north,
    up: d.up,
    positions,
    normals: normalsEcef,
  };
}

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return function () {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function poissonDiskSample2D(
  shell: SafetyShell,
  minDist: number,
  seed = 1234,
): SamplePoint[] {
  const R = (shell.width * shell.dx) / 2;
  const cellSize = minDist / Math.SQRT2;
  const gridW = Math.ceil((2 * R) / cellSize);
  const gridH = gridW;
  const grid: number[] = new Array(gridW * gridH).fill(-1);
  const samples2d: { ex: number; ny: number; shellIdx: number }[] = [];
  const active: number[] = [];
  const rng = mulberry32(seed);

  const pointToGridIdx = (ex: number, ny: number) => {
    const gx = Math.min(gridW - 1, Math.max(0, Math.floor((ex + R) / cellSize)));
    const gy = Math.min(gridH - 1, Math.max(0, Math.floor((ny + R) / cellSize)));
    return gy * gridW + gx;
  };

  const getShellIdx = (ex: number, ny: number): number => {
    const i = Math.floor((ex + R) / shell.dx);
    const j = Math.floor((ny + R) / shell.dy);
    if (i < 0 || i >= shell.width || j < 0 || j >= shell.height) return -1;
    return j * shell.width + i;
  };

  const tryAdd = (ex: number, ny: number): boolean => {
    const shellIdx = getShellIdx(ex, ny);
    if (shellIdx < 0) return false;
    const pos = shell.positions[shellIdx];
    if (!Number.isFinite(pos.x)) return false;

    const gx = Math.floor((ex + R) / cellSize);
    const gy = Math.floor((ny + R) / cellSize);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = gx + dx;
        const nyg = gy + dy;
        if (nx < 0 || nx >= gridW || nyg < 0 || nyg >= gridH) continue;
        const idx = grid[nyg * gridW + nx];
        if (idx < 0) continue;
        const s = samples2d[idx];
        const ddx = s.ex - ex;
        const ddy = s.ny - ny;
        if (ddx * ddx + ddy * ddy < minDist * minDist) return false;
      }
    }

    const sampleIdx = samples2d.length;
    samples2d.push({ ex, ny, shellIdx });
    grid[pointToGridIdx(ex, ny)] = sampleIdx;
    active.push(sampleIdx);
    return true;
  };

  // 找初始种子点
  for (let attempts = 0; attempts < 1000; attempts++) {
    const ex = (rng() - 0.5) * 2 * R;
    const ny = (rng() - 0.5) * 2 * R;
    if (tryAdd(ex, ny)) break;
  }
  if (samples2d.length === 0) return [];

  const k = 30;
  while (active.length > 0) {
    const i = Math.floor(rng() * active.length);
    const sourceIdx = active[i];
    const source = samples2d[sourceIdx];
    let found = false;
    for (let t = 0; t < k; t++) {
      const angle = rng() * 2 * Math.PI;
      const radius = minDist + rng() * minDist;
      const ex = source.ex + radius * Math.cos(angle);
      const ny = source.ny + radius * Math.sin(angle);
      if (ex < -R || ex > R || ny < -R || ny > R) continue;
      if (tryAdd(ex, ny)) {
        found = true;
        break;
      }
    }
    if (!found) {
      active.splice(i, 1);
    }
  }

  return samples2d.map((s) => ({
    positionEcef: shell.positions[s.shellIdx],
    normalEcef: shell.normals[s.shellIdx],
    dsmIndex: s.shellIdx,
  }));
}
