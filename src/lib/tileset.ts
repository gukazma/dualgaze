/**
 * Bavaria demo pnts tileset 加载入口 —— 主 viewer / FPV viewer 都通过这里挂同一份。
 *
 * Cesium 不强制内部 cache：两次 fromUrl 各自走一份 GPU 副本（~600-800MB 估）。
 * Demo 数据规模 824k 点 × 2 在中端显卡能跑；性能不行就走 chase-cam fallback。
 */
import * as Cesium from 'cesium';

export const TILESET_URL = '/datas/pnts/tileset.json';

/**
 * Bavaria P06_PNTS tileset 实际 boundingSphere 中心（lon/lat/h，运行时实测）。
 * 由 ellipsoid.cartesianToCartographic(tileset.boundingSphere.center) 抓出，写死防止
 * 演示航线 seed 时 tileset 还没加载完拿不到。
 */
export const TILESET_CENTER = { lon: 11.19618, lat: 48.08552, alt: 586.6 };

export interface LoadTilesetOptions {
  /** SSE：主 viewer 4，FPV viewer 32（轻量） */
  maximumScreenSpaceError?: number;
  /** Cesium3DTileStyle pointSize（px） */
  pointSize?: number;
}

export async function loadTileset(
  viewer: Cesium.Viewer,
  opts: LoadTilesetOptions = {},
): Promise<Cesium.Cesium3DTileset | null> {
  const tileset = await Cesium.Cesium3DTileset.fromUrl(TILESET_URL, {
    maximumScreenSpaceError: opts.maximumScreenSpaceError ?? 4,
  });
  // React StrictMode 双挂/快速切窗时 viewer 可能已 destroy
  if (viewer.isDestroyed()) {
    tileset.destroy();
    return null;
  }
  viewer.scene.primitives.add(tileset);
  tileset.style = new Cesium.Cesium3DTileStyle({
    pointSize: String(opts.pointSize ?? 4),
  });
  return tileset;
}

/** tileset 几何中心 → WGS84 lon/lat/alt（loaded 后可用） */
export function tilesetCenterCarto(
  tileset: Cesium.Cesium3DTileset,
): { lon: number; lat: number; alt: number } {
  const carto = Cesium.Cartographic.fromCartesian(tileset.boundingSphere.center);
  return {
    lon: Cesium.Math.toDegrees(carto.longitude),
    lat: Cesium.Math.toDegrees(carto.latitude),
    alt: carto.height,
  };
}

/**
 * Bavaria 演示航线 seed —— ~60m × 40m 顺时针矩形，整圈在 tileset bbox（65×59m）内部，
 * 高度 +30m，gimbal pitch -55°（陡向下）。这样不管 drone 在哪条边，
 * 视锥都打在 tileset 点云上，FPV 能看到建筑街景。
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
  altOffset: 30,
  speed: 2,
  pitch: -55,
  fov: 60,
} as const;
