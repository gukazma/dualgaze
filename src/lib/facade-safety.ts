import * as Cesium from 'cesium';
import { wgs84ToCartesian3 } from './coord';
import type { FacadePlane, Waypoint } from '../types/mission';

/**
 * 给一组已生成的 waypoints 做安全检查：每个 wp 沿 -N 方向 raycast，
 * 若命中距离 d < standoff（即障碍物在相机和墙面之间）→ 标 unsafe。
 *
 * 副作用：直接 mutate 输入的 waypoint 数组（加 `unsafe?: true`，`obstacleDistanceM?: number`）。
 *
 * 使用 plane.normal 作为相机看向方向（-N），逻辑同 raycastFromPlane 反过来。
 *
 * SAFE_MARGIN_M：障碍距相机 ≤ standoff - SAFE_MARGIN 才算 unsafe，避免边缘 case 抖动。
 */
const SAFE_MARGIN_M = 0.5;

export function annotateUnsafe(
  viewer: Cesium.Viewer | null,
  plane: FacadePlane,
  waypoints: Waypoint[],
  standoff: number,
): { unsafeCount: number } {
  let unsafeCount = 0;
  if (!viewer) {
    // 没 viewer 不做 raycast，全部当 safe
    for (const wp of waypoints) {
      delete wp.unsafe;
      delete wp.obstacleDistanceM;
    }
    return { unsafeCount: 0 };
  }
  const sceneAny = viewer.scene as unknown as {
    pickFromRay: (ray: Cesium.Ray) => { position?: Cesium.Cartesian3 } | undefined;
  };
  const lookDir = new Cesium.Cartesian3(-plane.normal.x, -plane.normal.y, -plane.normal.z);

  for (const wp of waypoints) {
    const cam = wgs84ToCartesian3(wp.lon, wp.lat, wp.alt);
    const ray = new Cesium.Ray(cam, lookDir);
    const hit = sceneAny.pickFromRay(ray)?.position;
    if (hit && Number.isFinite(hit.x)) {
      const dx = hit.x - cam.x, dy = hit.y - cam.y, dz = hit.z - cam.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      wp.obstacleDistanceM = d;
      if (d < standoff - SAFE_MARGIN_M) {
        wp.unsafe = true;
        unsafeCount++;
      } else {
        delete wp.unsafe;
      }
    } else {
      // 没命中 → 安全（射线穿过没碰到任何东西）
      delete wp.unsafe;
      delete wp.obstacleDistanceM;
    }
  }
  return { unsafeCount };
}

/**
 * 平面法向歧义解决：拟合 plane 完后法向可能朝里也可能朝外。
 * 简单启发：与"质心-corner 中点"向量比较，若 plane.normal 同向 → 法向朝内 → 翻转。
 *
 * tilesetCenter 通常是 Cesium3DTileset.boundingSphere.center（ECEF），
 * 若拿不到（无 tileset），可以传 null，此函数不改 plane。
 *
 * 返回新的 plane（normal/vAxis 可能取反）。
 */
export function ensureNormalOutward(
  plane: FacadePlane,
  tilesetCenter: Cesium.Cartesian3 | null,
): FacadePlane {
  if (!tilesetCenter) return plane;
  // 从平面 origin 指向 tileset 中心
  const toCenter = {
    x: tilesetCenter.x - plane.origin.x,
    y: tilesetCenter.y - plane.origin.y,
    z: tilesetCenter.z - plane.origin.z,
  };
  // dot(normal, toCenter)：若 > 0，normal 指向中心 → 反向（指向外侧才对）
  const dot = plane.normal.x * toCenter.x + plane.normal.y * toCenter.y + plane.normal.z * toCenter.z;
  if (dot > 0) {
    return {
      ...plane,
      normal: { x: -plane.normal.x, y: -plane.normal.y, z: -plane.normal.z },
      vAxis: { x: -plane.vAxis.x, y: -plane.vAxis.y, z: -plane.vAxis.z },
    };
  }
  return plane;
}
