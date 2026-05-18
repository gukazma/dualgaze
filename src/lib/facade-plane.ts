import * as Cesium from 'cesium';
import { wgs84ToCartesian3 } from './coord';
import type { FacadeCorner, FacadePlane } from '../types/mission';

/**
 * 从 4 个 WGS84 角点拟合 facade 立面平面。
 *
 * 算法：
 *   1. WGS84 → ECEF Cartesian3
 *   2. 取中心 origin = 4 点均值
 *   3. 中心化 → 协方差矩阵 → SVD → 最小奇异向量得 normal
 *   4. uAxis = (corner[1] - corner[0]) 投影到平面内 (减去 normal 分量)
 *   5. vAxis = normal × uAxis（右手系）
 *   6. 把 4 角点投影到 plane → u/v 包围盒 → width/height
 *
 * 法向 normal 的方向歧义（朝室内还是朝室外）由 `flipNormal` 参数后处理（在
 * `FacadeScanParams` 里），picker 也有 F 键实时翻转。这里不做朝向选择。
 *
 * 输入要求：4 个角点（顺序无关，但通常按 0→1→2→3 顺时针闭合）。
 */
export function fitPlaneFromCorners(corners: FacadeCorner[]): FacadePlane | null {
  if (corners.length !== 4) return null;
  const pts = corners.map((c) => wgs84ToCartesian3(c.lon, c.lat, c.alt));

  // 退化检查：任意两两角点距离过小（< 0.5m）说明用户重复点了同一位置，
  // SVD 仍能拟合但结果是垃圾（A2b 半重合 case）→ 直接返回 null 让 picker 报 error
  const MIN_PAIR_DIST = 0.5;
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y, dz = pts[i].z - pts[j].z;
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) < MIN_PAIR_DIST) return null;
    }
  }

  // 中心
  const cx = (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4;
  const cy = (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4;
  const cz = (pts[0].z + pts[1].z + pts[2].z + pts[3].z) / 4;
  const origin = new Cesium.Cartesian3(cx, cy, cz);

  // 中心化点
  const centered = pts.map((p) => new Cesium.Cartesian3(p.x - cx, p.y - cy, p.z - cz));

  // 协方差矩阵（对称 3x3）
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  for (const p of centered) {
    xx += p.x * p.x; xy += p.x * p.y; xz += p.x * p.z;
    yy += p.y * p.y; yz += p.y * p.z;
    zz += p.z * p.z;
  }

  // 求 3x3 对称矩阵的最小特征值对应特征向量（即法向）
  // 用 power iteration 求最大特征值，然后用 deflation 找最小，太复杂；
  // 这里直接用 Jacobi eigenvalue decomposition for 3x3 symmetric (closed form)。
  const normal = smallestEigenvector3x3([
    xx, xy, xz,
    xy, yy, yz,
    xz, yz, zz,
  ]);

  // uAxis 候选 = corner1 - corner0
  const u0 = new Cesium.Cartesian3(pts[1].x - pts[0].x, pts[1].y - pts[0].y, pts[1].z - pts[0].z);
  // 减去法向分量得平面内 uAxis
  const uDotN = u0.x * normal.x + u0.y * normal.y + u0.z * normal.z;
  const uInPlane = new Cesium.Cartesian3(
    u0.x - uDotN * normal.x,
    u0.y - uDotN * normal.y,
    u0.z - uDotN * normal.z,
  );
  const uAxis = normalizeVec(uInPlane);

  // vAxis = normal × uAxis（右手系）
  const vAxis = normalizeVec(crossVec(normal, uAxis));

  // 把 4 角点投影到 plane，取 u/v 包围盒
  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  for (const p of centered) {
    const u = p.x * uAxis.x + p.y * uAxis.y + p.z * uAxis.z;
    const v = p.x * vAxis.x + p.y * vAxis.y + p.z * vAxis.z;
    if (u < uMin) uMin = u;
    if (u > uMax) uMax = u;
    if (v < vMin) vMin = v;
    if (v > vMax) vMax = v;
  }
  const width = uMax - uMin;
  const height = vMax - vMin;

  // 调整 origin 到包围盒中心（避免 origin 与几何中心偏移）
  const uMid = (uMin + uMax) / 2;
  const vMid = (vMin + vMax) / 2;
  const adjOrigin = new Cesium.Cartesian3(
    origin.x + uMid * uAxis.x + vMid * vAxis.x,
    origin.y + uMid * uAxis.y + vMid * vAxis.y,
    origin.z + uMid * uAxis.z + vMid * vAxis.z,
  );

  return {
    origin: { x: adjOrigin.x, y: adjOrigin.y, z: adjOrigin.z },
    normal: { x: normal.x, y: normal.y, z: normal.z },
    uAxis: { x: uAxis.x, y: uAxis.y, z: uAxis.z },
    vAxis: { x: vAxis.x, y: vAxis.y, z: vAxis.z },
    width,
    height,
  };
}

/** 翻转 plane 法向：normal 取反，vAxis 也取反（保持右手系 + uAxis 不变） */
export function flipFacadePlane(plane: FacadePlane): FacadePlane {
  return {
    ...plane,
    normal: { x: -plane.normal.x, y: -plane.normal.y, z: -plane.normal.z },
    vAxis: { x: -plane.vAxis.x, y: -plane.vAxis.y, z: -plane.vAxis.z },
  };
}

// ---------- 数学工具 ----------

function normalizeVec(v: Cesium.Cartesian3): Cesium.Cartesian3 {
  const m = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (m < 1e-12) return new Cesium.Cartesian3(1, 0, 0);
  return new Cesium.Cartesian3(v.x / m, v.y / m, v.z / m);
}

function crossVec(a: Cesium.Cartesian3, b: Cesium.Cartesian3): Cesium.Cartesian3 {
  return new Cesium.Cartesian3(
    a.y * b.z - a.z * b.y,
    a.z * b.x - a.x * b.z,
    a.x * b.y - a.y * b.x,
  );
}

/**
 * 3x3 对称矩阵最小特征值对应的特征向量（即拟合平面的法向）。
 *
 * 使用 Jacobi rotation 迭代到收敛（小矩阵 5-10 次足够）。
 * 输入 a = [m00, m01, m02, m10, m11, m12, m20, m21, m22] 行主序。
 */
function smallestEigenvector3x3(a: number[]): Cesium.Cartesian3 {
  // 复制到可变 3x3
  const M = [
    [a[0], a[1], a[2]],
    [a[3], a[4], a[5]],
    [a[6], a[7], a[8]],
  ];
  // 特征向量矩阵初始化为单位阵
  const V = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];

  const MAX_ITER = 50;
  const EPS = 1e-12;

  for (let iter = 0; iter < MAX_ITER; iter++) {
    // 找最大的非对角元素 |M[p][q]| (p<q)
    let p = 0, q = 1, max = Math.abs(M[0][1]);
    if (Math.abs(M[0][2]) > max) { p = 0; q = 2; max = Math.abs(M[0][2]); }
    if (Math.abs(M[1][2]) > max) { p = 1; q = 2; max = Math.abs(M[1][2]); }
    if (max < EPS) break;

    // 计算 Jacobi 旋转角度
    const theta = (M[q][q] - M[p][p]) / (2 * M[p][q]);
    const t = Math.sign(theta) / (Math.abs(theta) + Math.sqrt(1 + theta * theta));
    const c = 1 / Math.sqrt(1 + t * t);
    const s = t * c;

    // 旋转 M：M' = R^T M R
    const Mpp = M[p][p];
    const Mqq = M[q][q];
    const Mpq = M[p][q];
    M[p][p] = c * c * Mpp - 2 * s * c * Mpq + s * s * Mqq;
    M[q][q] = s * s * Mpp + 2 * s * c * Mpq + c * c * Mqq;
    M[p][q] = 0;
    M[q][p] = 0;
    for (let i = 0; i < 3; i++) {
      if (i !== p && i !== q) {
        const Mip = M[i][p];
        const Miq = M[i][q];
        M[i][p] = c * Mip - s * Miq;
        M[p][i] = M[i][p];
        M[i][q] = s * Mip + c * Miq;
        M[q][i] = M[i][q];
      }
    }
    // 旋转 V：V' = V R
    for (let i = 0; i < 3; i++) {
      const Vip = V[i][p];
      const Viq = V[i][q];
      V[i][p] = c * Vip - s * Viq;
      V[i][q] = s * Vip + c * Viq;
    }
  }

  // 找最小特征值的索引
  let minIdx = 0;
  if (M[1][1] < M[minIdx][minIdx]) minIdx = 1;
  if (M[2][2] < M[minIdx][minIdx]) minIdx = 2;

  return normalizeVec(
    new Cesium.Cartesian3(V[0][minIdx], V[1][minIdx], V[2][minIdx]),
  );
}
