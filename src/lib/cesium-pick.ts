import * as Cesium from 'cesium';
import { cartesian3ToWgs84 } from './coord';

/**
 * 屏幕坐标 → WGS84 (lon/lat/alt)。
 *
 * 优先用 `scene.pickFromRay` 拾取 ray-hit（含 3DTileset / globe）；如果场景没有 tileset 且 globe 关闭，
 * 才 fallback 到 `globe.pick`（不包含 tileset 命中）。
 *
 * 此函数是 v3 FacadePicker 和 v1 WaypointPicker 共用。提前抽出来避免重复。
 *
 * 返回 WGS84（已通过 `cartesian3ToWgs84` 完成 GCJ-02 反向修正 if applicable）。
 */
export function pickWgs84At(
  viewer: Cesium.Viewer,
  screenPos: Cesium.Cartesian2,
): { lon: number; lat: number; alt: number } | null {
  const ray = viewer.camera.getPickRay(screenPos);
  if (!ray) return null;

  // pickFromRay 类型在 Cesium 1.124 的 .d.ts 里覆盖不完整，做局部 cast
  const sceneAny = viewer.scene as unknown as {
    pickFromRay: (
      ray: Cesium.Ray,
      exclude?: object[],
    ) => { position?: Cesium.Cartesian3 } | undefined;
  };
  const result = sceneAny.pickFromRay(ray);
  const cart = result?.position;
  if (cart && Number.isFinite(cart.x)) {
    return cartesian3ToWgs84(cart);
  }

  // fallback：射线打 globe（仅在没 tileset 命中时走这条）
  const cartesianGlobe = viewer.scene.globe.pick(ray, viewer.scene);
  if (cartesianGlobe && Number.isFinite(cartesianGlobe.x)) {
    return cartesian3ToWgs84(cartesianGlobe);
  }
  return null;
}
