/**
 * Bavaria 演示航线 seed —— 仅坐标常量，跟点云无关。
 *
 * 坐标对应 ArcGIS World Imagery 上 Bavaria 南部 Ebersberg 镇真实卫星图区域
 * （之前用 Cesium ellipsoid.cartesianToCartographic 实测出来的）。
 * 即使 tileset 已退役，演示航线在底图上仍能看到 ~60m × 40m 矩形覆盖在
 * 真实建筑群上空，可以验证模拟飞行 + FPV 视角 + 视锥触发。
 */

/** Bavaria 演示航线中心点（WGS84） */
export const BAVARIA_DEMO_CENTER = { lon: 11.19618, lat: 48.08552, alt: 586.6 };

/**
 * 演示航线 4 个航点（顺时针矩形，SW→NW→NE→SE，在中心 ~60m × 40m 范围内）。
 * pitch -55° 让 drone 镜头朝下看建筑群。
 * 1° lat ≈ 111139m；1° lon @48°N ≈ 74513m。
 */
export const BAVARIA_DEMO_OFFSETS: ReadonlyArray<{ dLon: number; dLat: number }> = [
  { dLon: -0.00040, dLat: -0.00018 }, // SW (~30m W, ~20m S)
  { dLon: -0.00040, dLat: +0.00018 }, // NW
  { dLon: +0.00040, dLat: +0.00018 }, // NE
  { dLon: +0.00040, dLat: -0.00018 }, // SE
];

export const BAVARIA_DEMO_PRESET = {
  name: 'Bavaria 演示',
  droneId: 'm3e',
  payloadId: 'm3e-cam',
  /** 相对 BAVARIA_DEMO_CENTER.alt 的高度偏移（m） */
  altOffset: 30,
  speed: 2,
  pitch: -55,
  fov: 60,
} as const;
