/**
 * 坐标系适配层。
 *
 * 当前 baseLayer = ArcGIS World Imagery（WGS84 原生）→ 不需要 GCJ-02 偏移修正，
 * `wgs84ToCartesian3` / `cartesian3ToWgs84` 都是直 passthrough。
 *
 * GCJ-02 偏移算法（wgs84ToGcj02 / gcj02ToWgs84）仍然 export 出来，
 * 万一以后切回 AMap 卫星 / 腾讯地图等 GCJ-02 底图，把
 * `BASE_IS_GCJ02 = true` 就能恢复修正路径。
 */
import * as Cesium from 'cesium';

/** 切换底图时改这个：用 GCJ-02 底图（AMap/腾讯）= true，用 WGS84 底图（ArcGIS/OSM/Bing）= false */
const BASE_IS_GCJ02 = false;

// ===== GCJ-02 偏移算法（仅在 BASE_IS_GCJ02=true 时生效）=====

const KRASOVSKY_A = 6378245.0;
const KRASOVSKY_EE = 0.00669342162296594323;

const CHINA_BBOX = { minLon: 72.004, maxLon: 137.8347, minLat: 0.8293, maxLat: 55.8271 };

export function isInChina(lon: number, lat: number): boolean {
  return (
    lon >= CHINA_BBOX.minLon &&
    lon <= CHINA_BBOX.maxLon &&
    lat >= CHINA_BBOX.minLat &&
    lat <= CHINA_BBOX.maxLat
  );
}

function transformLat(x: number, y: number): number {
  let ret =
    -100.0 +
    2.0 * x +
    3.0 * y +
    0.2 * y * y +
    0.1 * x * y +
    0.2 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin((y / 3.0) * Math.PI)) * 2.0) / 3.0;
  ret +=
    ((160.0 * Math.sin((y / 12.0) * Math.PI) + 320.0 * Math.sin((y * Math.PI) / 30.0)) * 2.0) /
    3.0;
  return ret;
}

function transformLng(x: number, y: number): number {
  let ret =
    300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin((x / 3.0) * Math.PI)) * 2.0) / 3.0;
  ret +=
    ((150.0 * Math.sin((x / 12.0) * Math.PI) + 300.0 * Math.sin((x / 30.0) * Math.PI)) * 2.0) /
    3.0;
  return ret;
}

export function wgs84ToGcj02(lon: number, lat: number): [number, number] {
  if (!isInChina(lon, lat)) return [lon, lat];
  let dLat = transformLat(lon - 105.0, lat - 35.0);
  let dLon = transformLng(lon - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - KRASOVSKY_EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / (((KRASOVSKY_A * (1 - KRASOVSKY_EE)) / (magic * sqrtMagic)) * Math.PI);
  dLon = (dLon * 180.0) / ((KRASOVSKY_A / sqrtMagic) * Math.cos(radLat) * Math.PI);
  return [lon + dLon, lat + dLat];
}

export function gcj02ToWgs84(gcjLon: number, gcjLat: number): [number, number] {
  if (!isInChina(gcjLon, gcjLat)) return [gcjLon, gcjLat];
  let wgsLon = gcjLon;
  let wgsLat = gcjLat;
  for (let i = 0; i < 10; i++) {
    const [forwardLon, forwardLat] = wgs84ToGcj02(wgsLon, wgsLat);
    const dLon = gcjLon - forwardLon;
    const dLat = gcjLat - forwardLat;
    wgsLon += dLon;
    wgsLat += dLat;
    if (Math.abs(dLon) < 1e-9 && Math.abs(dLat) < 1e-9) break;
  }
  return [wgsLon, wgsLat];
}

// ===== Cesium 适配入口 =====

/**
 * WGS84 (lon, lat, alt) → Cesium Cartesian3。
 * - BASE_IS_GCJ02=true：自动应用 wgs84→gcj02 偏移修正
 * - BASE_IS_GCJ02=false：直接 fromDegrees，无偏移
 */
export function wgs84ToCartesian3(
  lon: number,
  lat: number,
  alt: number = 0,
  result?: Cesium.Cartesian3,
): Cesium.Cartesian3 {
  if (BASE_IS_GCJ02) {
    const [gcjLon, gcjLat] = wgs84ToGcj02(lon, lat);
    return Cesium.Cartesian3.fromDegrees(gcjLon, gcjLat, alt, undefined, result);
  }
  return Cesium.Cartesian3.fromDegrees(lon, lat, alt, undefined, result);
}

/**
 * Cesium Cartesian3 → WGS84 (lon, lat, alt)。
 * - BASE_IS_GCJ02=true：Cartesian3 视为 GCJ-02 投影后的 ECEF，再反向转 WGS84
 * - BASE_IS_GCJ02=false：直接 Cartographic.fromCartesian 拿 WGS84
 */
export function cartesian3ToWgs84(
  cart: Cesium.Cartesian3,
): { lon: number; lat: number; alt: number } {
  const carto = Cesium.Cartographic.fromCartesian(cart);
  const rawLon = Cesium.Math.toDegrees(carto.longitude);
  const rawLat = Cesium.Math.toDegrees(carto.latitude);
  if (BASE_IS_GCJ02) {
    const [wgsLon, wgsLat] = gcj02ToWgs84(rawLon, rawLat);
    return { lon: wgsLon, lat: wgsLat, alt: carto.height };
  }
  return { lon: rawLon, lat: rawLat, alt: carto.height };
}
