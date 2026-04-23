import * as Cesium from 'cesium';
import type { Dsm } from './dsm';

export interface ProxyMesh {
  vertices: Cesium.Cartesian3[];
  triangles: number[];
  faceNormals: Cesium.Cartesian3[];
  faceAreas: number[];
  totalArea: number;
  topFaceCount: number;
  wallFaceCount: number;
}

export interface BuildProxyMeshOptions {
  wallThreshold: number;
}

export interface ShellSample {
  positionEcef: Cesium.Cartesian3;
  normalEcef: Cesium.Cartesian3;
  triangleIdx: number;
  isWall: boolean;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function () {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function triangleArea(
  a: Cesium.Cartesian3,
  b: Cesium.Cartesian3,
  c: Cesium.Cartesian3,
): number {
  const ab = Cesium.Cartesian3.subtract(b, a, new Cesium.Cartesian3());
  const ac = Cesium.Cartesian3.subtract(c, a, new Cesium.Cartesian3());
  const cross = Cesium.Cartesian3.cross(ab, ac, new Cesium.Cartesian3());
  return Cesium.Cartesian3.magnitude(cross) / 2;
}

function triangleAreaAndNormal(
  a: Cesium.Cartesian3,
  b: Cesium.Cartesian3,
  c: Cesium.Cartesian3,
): { area: number; normal: Cesium.Cartesian3 } {
  const ab = Cesium.Cartesian3.subtract(b, a, new Cesium.Cartesian3());
  const ac = Cesium.Cartesian3.subtract(c, a, new Cesium.Cartesian3());
  const cross = Cesium.Cartesian3.cross(ab, ac, new Cesium.Cartesian3());
  const len = Cesium.Cartesian3.magnitude(cross);
  const area = len / 2;
  const normal =
    len > 1e-12
      ? Cesium.Cartesian3.divideByScalar(cross, len, new Cesium.Cartesian3())
      : new Cesium.Cartesian3(0, 0, 1);
  return { area, normal };
}

export function buildProxyMesh(
  d: Dsm,
  opts: BuildProxyMeshOptions,
): ProxyMesh {
  const vertices: Cesium.Cartesian3[] = [];
  const triangles: number[] = [];
  const faceNormals: Cesium.Cartesian3[] = [];
  const faceAreas: number[] = [];
  const wallThreshold = opts.wallThreshold;
  const halfDx = d.dx / 2;
  const halfDy = d.dy / 2;

  const topVertIdx = new Map<number, number>();
  const getTopVertex = (cellK: number): number => {
    const existing = topVertIdx.get(cellK);
    if (existing !== undefined) return existing;
    const carto = Cesium.Cartographic.clone(d.cartographics[cellK]);
    carto.height = d.heights[cellK];
    const pos = Cesium.Cartographic.toCartesian(carto);
    const idx = vertices.length;
    vertices.push(pos);
    topVertIdx.set(cellK, idx);
    return idx;
  };

  let topFaceCount = 0;
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
      )
        continue;
      const i00 = getTopVertex(k00);
      const i10 = getTopVertex(k10);
      const i01 = getTopVertex(k01);
      const i11 = getTopVertex(k11);

      triangles.push(i00, i10, i11);
      const t1 = triangleAreaAndNormal(
        vertices[i00],
        vertices[i10],
        vertices[i11],
      );
      faceNormals.push(t1.normal);
      faceAreas.push(t1.area);
      topFaceCount++;

      triangles.push(i00, i11, i01);
      const t2 = triangleAreaAndNormal(
        vertices[i00],
        vertices[i11],
        vertices[i01],
      );
      faceNormals.push(t2.normal);
      faceAreas.push(t2.area);
      topFaceCount++;
    }
  }

  let wallFaceCount = 0;

  const addWall = (
    kA: number,
    kB: number,
    di: number,
    dj: number,
  ): void => {
    const hA = d.heights[kA];
    const hB = d.heights[kB];
    if (!Number.isFinite(hA) || !Number.isFinite(hB)) return;
    if (Math.abs(hA - hB) <= wallThreshold) return;

    const hHi = Math.max(hA, hB);
    const hLow = Math.min(hA, hB);

    const outDe = hA > hB ? di : -di;
    const outDn = hA > hB ? dj : -dj;
    // Right (perp to outward, horizontal) in ENU: rotate outward 90° CW about +up
    const rightDe = -outDn;
    const rightDn = outDe;
    const halfPerp = di !== 0 ? halfDy : halfDx;

    const boundaryOffE = di * halfDx;
    const boundaryOffN = dj * halfDy;

    const cartoA = d.cartographics[kA];
    const posAt = (
      offE: number,
      offN: number,
      hz: number,
    ): Cesium.Cartesian3 => {
      const c = Cesium.Cartographic.clone(cartoA);
      c.height = hz;
      const base = Cesium.Cartographic.toCartesian(c);
      const dE = Cesium.Cartesian3.multiplyByScalar(
        d.east,
        offE,
        new Cesium.Cartesian3(),
      );
      const dN = Cesium.Cartesian3.multiplyByScalar(
        d.north,
        offN,
        new Cesium.Cartesian3(),
      );
      const p = Cesium.Cartesian3.add(base, dE, new Cesium.Cartesian3());
      Cesium.Cartesian3.add(p, dN, p);
      return p;
    };

    // v0..v3 go CCW viewed from +outward side
    const v0 = posAt(
      boundaryOffE + rightDe * halfPerp,
      boundaryOffN + rightDn * halfPerp,
      hHi,
    );
    const v1 = posAt(
      boundaryOffE - rightDe * halfPerp,
      boundaryOffN - rightDn * halfPerp,
      hHi,
    );
    const v2 = posAt(
      boundaryOffE - rightDe * halfPerp,
      boundaryOffN - rightDn * halfPerp,
      hLow,
    );
    const v3 = posAt(
      boundaryOffE + rightDe * halfPerp,
      boundaryOffN + rightDn * halfPerp,
      hLow,
    );

    const iv0 = vertices.length;
    vertices.push(v0);
    const iv1 = vertices.length;
    vertices.push(v1);
    const iv2 = vertices.length;
    vertices.push(v2);
    const iv3 = vertices.length;
    vertices.push(v3);

    const normal = Cesium.Cartesian3.add(
      Cesium.Cartesian3.multiplyByScalar(d.east, outDe, new Cesium.Cartesian3()),
      Cesium.Cartesian3.multiplyByScalar(d.north, outDn, new Cesium.Cartesian3()),
      new Cesium.Cartesian3(),
    );
    Cesium.Cartesian3.normalize(normal, normal);

    triangles.push(iv0, iv1, iv2);
    faceNormals.push(normal);
    faceAreas.push(triangleArea(v0, v1, v2));
    wallFaceCount++;

    triangles.push(iv0, iv2, iv3);
    faceNormals.push(Cesium.Cartesian3.clone(normal));
    faceAreas.push(triangleArea(v0, v2, v3));
    wallFaceCount++;
  };

  for (let j = 0; j < d.height; j++) {
    for (let i = 0; i < d.width - 1; i++) {
      addWall(j * d.width + i, j * d.width + i + 1, 1, 0);
    }
  }
  for (let j = 0; j < d.height - 1; j++) {
    for (let i = 0; i < d.width; i++) {
      addWall(j * d.width + i, (j + 1) * d.width + i, 0, 1);
    }
  }

  let totalArea = 0;
  for (const a of faceAreas) totalArea += a;

  return {
    vertices,
    triangles,
    faceNormals,
    faceAreas,
    totalArea,
    topFaceCount,
    wallFaceCount,
  };
}

export function sampleSurfaceUniform(
  mesh: ProxyMesh,
  N: number,
  seed: number = 1234,
): ShellSample[] {
  const faceCount = mesh.faceAreas.length;
  if (faceCount === 0 || mesh.totalArea <= 0 || N <= 0) return [];

  const cdf = new Float64Array(faceCount);
  let acc = 0;
  for (let i = 0; i < faceCount; i++) {
    acc += mesh.faceAreas[i];
    cdf[i] = acc / mesh.totalArea;
  }

  const rng = mulberry32(seed);
  const samples: ShellSample[] = [];

  for (let n = 0; n < N; n++) {
    const r = rng();
    let lo = 0;
    let hi = faceCount - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (cdf[mid] < r) lo = mid + 1;
      else hi = mid;
    }
    const triIdx = lo;
    const i0 = mesh.triangles[3 * triIdx];
    const i1 = mesh.triangles[3 * triIdx + 1];
    const i2 = mesh.triangles[3 * triIdx + 2];
    const v0 = mesh.vertices[i0];
    const v1 = mesh.vertices[i1];
    const v2 = mesh.vertices[i2];

    const r1 = Math.sqrt(rng());
    const r2 = rng();
    const w0 = 1 - r1;
    const w1 = r1 * (1 - r2);
    const w2 = r1 * r2;
    const px = w0 * v0.x + w1 * v1.x + w2 * v2.x;
    const py = w0 * v0.y + w1 * v1.y + w2 * v2.y;
    const pz = w0 * v0.z + w1 * v1.z + w2 * v2.z;

    samples.push({
      positionEcef: new Cesium.Cartesian3(px, py, pz),
      normalEcef: Cesium.Cartesian3.clone(mesh.faceNormals[triIdx]),
      triangleIdx: triIdx,
      isWall: triIdx >= mesh.topFaceCount,
    });
  }

  return samples;
}
