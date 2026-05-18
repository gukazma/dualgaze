import * as Cesium from 'cesium';
import type { FacadePlane } from '../types/mission';

/**
 * 给定 plane 上的 (u, v) 坐标 + standoff，从相机位置（plane 上点 + N·standoff）沿 -N 投射，
 * 命中 tileset 表面取实际点。返回 { surfacePoint (ECEF Cartesian3), surfaceNormal (单位向量) }。
 *
 * 设计：
 *   - 起点 = origin + u·uAxis + v·vAxis + standoff·N (相机位置)
 *   - 方向 = -N
 *   - 用 `scene.pickFromRay` 命中第一个 tileset 表面（或 globe）
 *   - 表面法向：当前 stub 用 plane.normal（统一法向）。M16-7 内可考虑切到局部法向估计
 *     （pickFromRay 不直接给法向，需要在 surfacePoint 附近撒 3 点拟合）。
 *
 * 如果未命中（射线没打到任何东西），返回 null —— 调用方决定是否 fallback 到平面上的点。
 */
export function raycastFromPlane(
  viewer: Cesium.Viewer,
  plane: FacadePlane,
  u: number,
  v: number,
  standoff: number,
): { surfacePoint: Cesium.Cartesian3; surfaceNormal: Cesium.Cartesian3 } | null {
  // plane 上的目标点（采样网格点）
  const target = new Cesium.Cartesian3(
    plane.origin.x + u * plane.uAxis.x + v * plane.vAxis.x,
    plane.origin.y + u * plane.uAxis.y + v * plane.vAxis.y,
    plane.origin.z + u * plane.uAxis.z + v * plane.vAxis.z,
  );
  // 相机起点：从 target 沿 +N 方向退 standoff
  const cameraPos = new Cesium.Cartesian3(
    target.x + standoff * plane.normal.x,
    target.y + standoff * plane.normal.y,
    target.z + standoff * plane.normal.z,
  );
  // 射线方向：-N（朝墙面）
  const dir = new Cesium.Cartesian3(-plane.normal.x, -plane.normal.y, -plane.normal.z);
  const ray = new Cesium.Ray(cameraPos, dir);

  const sceneAny = viewer.scene as unknown as {
    pickFromRay: (
      ray: Cesium.Ray,
      exclude?: object[],
    ) => { position?: Cesium.Cartesian3 } | undefined;
  };
  const result = sceneAny.pickFromRay(ray);
  if (result?.position && Number.isFinite(result.position.x)) {
    return {
      surfacePoint: result.position,
      surfaceNormal: new Cesium.Cartesian3(plane.normal.x, plane.normal.y, plane.normal.z),
    };
  }

  // fallback：globe.pick（少见 — 没 tileset 时用平地）
  const cartesianGlobe = viewer.scene.globe.pick(ray, viewer.scene);
  if (cartesianGlobe && Number.isFinite(cartesianGlobe.x)) {
    return {
      surfacePoint: cartesianGlobe,
      surfaceNormal: new Cesium.Cartesian3(plane.normal.x, plane.normal.y, plane.normal.z),
    };
  }

  return null;
}

/**
 * 退化情况：tileset 未加载或 raycast 没打到，直接在 plane 上取点 + standoff 偏移。
 * 用于让算法即使在无 tileset 时也能出 scanPath（debug / 测试场景）。
 */
export function fallbackPlanePoint(
  plane: FacadePlane,
  u: number,
  v: number,
): { surfacePoint: Cesium.Cartesian3; surfaceNormal: Cesium.Cartesian3 } {
  return {
    surfacePoint: new Cesium.Cartesian3(
      plane.origin.x + u * plane.uAxis.x + v * plane.vAxis.x,
      plane.origin.y + u * plane.uAxis.y + v * plane.vAxis.y,
      plane.origin.z + u * plane.uAxis.z + v * plane.vAxis.z,
    ),
    surfaceNormal: new Cesium.Cartesian3(plane.normal.x, plane.normal.y, plane.normal.z),
  };
}
