import * as Cesium from 'cesium';
import { cartesian3ToWgs84 } from './coord';
import { createWaypoint } from '../types/mission';
import type { FacadePlane, FacadeScanParams, Waypoint } from '../types/mission';

/**
 * Facade S 扫描路径生成主入口。
 *
 * 算法：
 *   1. 在 (u, v) 平面铺网格（按 spacingH × spacingV，并应用 marginU/marginV 缩进）
 *   2. 每个 (u, v) 调 raycastFromPlane → 表面点 + 法向（如未命中 tileset，fallback 到平面点）
 *   3. 相机位 = surface + N × standoff
 *   4. heading = atan2(-Nx_local, -Ny_local) 让镜头朝墙面（ENU 局部 yaw）
 *   5. gimbalPitch = asin(-Nz_local)（朝下时为负）
 *   6. gimbalYaw 与 heading 同步（per-waypoint）
 *   7. 按 marchOrder 做 S 排序（横向 = 偶数行正向, 奇数行反向；纵向同理）
 *   8. 不调 optimizePath（mapping 的三点共线消除）—— facade 网格点本来就规则，意义不大
 *
 * 输出 Waypoint[] 都是 WGS84，alt 是椭球高（保持与 Mission.heightMode='WGS84' 一致；
 * patrol/mapping 的 relativeToStartPoint 模式不适用 facade，强制 WGS84）。
 *
 * 如果 viewer 未传或 raycast 一律 fallback（debug 模式），可强制无 tileset 时也能算路径。
 */
export function generateFacadeScanPath(
  viewer: Cesium.Viewer | null,
  plane: FacadePlane,
  params: FacadeScanParams,
): Waypoint[] {
  // u/v 实际可用范围（减去 margin）
  const halfU = plane.width / 2 - params.marginU;
  const halfV = plane.height / 2 - params.marginV;
  if (halfU <= 0 || halfV <= 0) return [];

  // 网格 u/v 坐标列表
  const uCount = Math.max(1, Math.floor((2 * halfU) / Math.max(0.01, params.spacingH)) + 1);
  const vCount = Math.max(1, Math.floor((2 * halfV) / Math.max(0.01, params.spacingV)) + 1);

  const uList: number[] = [];
  if (uCount === 1) {
    uList.push(0);
  } else {
    for (let i = 0; i < uCount; i++) {
      uList.push(-halfU + (i * 2 * halfU) / (uCount - 1));
    }
  }
  const vList: number[] = [];
  if (vCount === 1) {
    vList.push(0);
  } else {
    for (let j = 0; j < vCount; j++) {
      vList.push(-halfV + (j * 2 * halfV) / (vCount - 1));
    }
  }

  // 构造 (u, v) S 序列
  const seq: Array<{ u: number; v: number }> = [];
  if (params.marchOrder === 'horizontal') {
    // 先沿 u 主扫，每行 v 切换时 u 方向反向
    for (let j = 0; j < vList.length; j++) {
      const v = vList[j];
      const row = j % 2 === 0 ? uList : [...uList].reverse();
      for (const u of row) seq.push({ u, v });
    }
  } else {
    // 先沿 v 主扫
    for (let i = 0; i < uList.length; i++) {
      const u = uList[i];
      const col = i % 2 === 0 ? vList : [...vList].reverse();
      for (const v of col) seq.push({ u, v });
    }
  }

  // 生成 waypoints：每点 raycast → camera = surface + N·standoff
  // viewer 参数现在不用了（不 raycast）；保留签名兼容旧调用点
  void viewer;

  const N = plane.normal;
  const waypoints: Waypoint[] = [];
  for (let i = 0; i < seq.length; i++) {
    const { u, v } = seq[i];

    // **均匀网格**：相机 = (plane.origin + u·uAxis + v·vAxis) + standoff·N
    // 不 raycast 表面 —— raycast 会因为树/凸出物把相机算到非平面距离，破坏均匀性
    // 并且可能让相机落在墙体内（碰撞风险）
    const planePointX = plane.origin.x + u * plane.uAxis.x + v * plane.vAxis.x;
    const planePointY = plane.origin.y + u * plane.uAxis.y + v * plane.vAxis.y;
    const planePointZ = plane.origin.z + u * plane.uAxis.z + v * plane.vAxis.z;
    const camECEF = new Cesium.Cartesian3(
      planePointX + params.standoff * N.x,
      planePointY + params.standoff * N.y,
      planePointZ + params.standoff * N.z,
    );

    // ECEF → WGS84
    const wgs = cartesian3ToWgs84(camECEF);

    // 朝向：相机看向 -N（即直射墙面）；用 plane 上对应的 surface point 算 ENU
    const surfaceCart = new Cesium.Cartesian3(planePointX, planePointY, planePointZ);
    const enuMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(surfaceCart);
    const inv = Cesium.Matrix4.inverse(enuMatrix, new Cesium.Matrix4());
    // -N 在 ECEF 中（相机看向墙面方向）
    const lookDirECEF = new Cesium.Cartesian3(-N.x, -N.y, -N.z);
    // 转到 ENU（用旋转部分；忽略平移）
    const m = inv;
    const dx = m[0] * lookDirECEF.x + m[4] * lookDirECEF.y + m[8] * lookDirECEF.z;   // east
    const dy = m[1] * lookDirECEF.x + m[5] * lookDirECEF.y + m[9] * lookDirECEF.z;   // north
    const dz = m[2] * lookDirECEF.x + m[6] * lookDirECEF.y + m[10] * lookDirECEF.z;  // up

    // heading: 北 = 0°，顺时针递增（CW from north）。东 dx>0 时 heading=90°
    const headingRad = Math.atan2(dx, dy);
    const headingDeg = ((Cesium.Math.toDegrees(headingRad) % 360) + 360) % 360;

    // pitch: 看向 dz<0 时朝下（dz 是 up 分量），pitch = asin(dz)（负值=朝下）
    const lookHorizMag = Math.sqrt(dx * dx + dy * dy);
    const pitchRad = Math.atan2(dz, lookHorizMag);
    const pitchDeg = Cesium.Math.toDegrees(pitchRad);

    const wp = createWaypoint({
      lon: wgs.lon,
      lat: wgs.lat,
      alt: wgs.alt,
      index: i,
      speed: params.speed,
      heading: headingDeg,
      pitch: pitchDeg,
      fov: 60,
    });
    // gimbal yaw 与 heading 同步（per-waypoint，DJI Pilot 2 识别贴近摄影意图）
    wp.gimbalYaw = headingDeg;
    waypoints.push(wp);
  }

  return waypoints;
}
