/**
 * WGS84 ↔ GCJ-02 坐标转换（"火星坐标系"）。
 *
 * GCJ-02 是中国国家测绘局对 WGS84 加密的坐标系，AMap / 腾讯 / 百度（之上又加 BD-09）等
 * 中国境内地图服务全部用 GCJ-02 显示。WGS84 数据（GPS / DJI 输出 / KMZ 标准）渲染到
 * AMap 上不修正会偏移 50-500m。
 *
 * 偏移算法基于 Krasovsky 1940 椭球 + 公开偏移多项式，多年间已在开源项目中验证。
 * 反向（GCJ-02 → WGS84）用迭代法，10 步内可收敛到 < 1e-9°。
 *
 * 注意：境外（中国陆地 bounding box 外）不做任何偏移 —— Bavaria 点云在德国，
 * 不应被转换。
 */
import * as Cesium from 'cesium';

// Krasovsky 1940 椭球长半轴 (m) 与第一偏心率平方
const KRASOVSKY_A = 6378245.0;
const KRASOVSKY_EE = 0.00669342162296594323;

// 中国陆地范围（粗略 bbox，与 AMap 实际覆盖一致）
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

/** WGS84 → GCJ-02. 境外原样返回。 */
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

/** GCJ-02 → WGS84. 用 10 步迭代逼近 (< 1e-9° 收敛)。境外原样返回。 */
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

/**
 * WGS84 → Cesium Cartesian3，自动 GCJ-02 修正后才转 ECEF。
 * 这是航点 / drone 位置等所有 WGS84 数据落到 AMap 地图上的标准入口。
 */
export function wgs84ToCartesian3(
  lon: number,
  lat: number,
  alt: number = 0,
  result?: Cesium.Cartesian3,
): Cesium.Cartesian3 {
  const [gcjLon, gcjLat] = wgs84ToGcj02(lon, lat);
  return Cesium.Cartesian3.fromDegrees(gcjLon, gcjLat, alt, undefined, result);
}

/**
 * Cesium Cartesian3 → WGS84 (lon, lat, alt)，认为 Cartesian3 是 GCJ-02-投影后的 ECEF。
 * 在用户点击地图后还原回真实 WGS84 坐标。
 */
export function cartesian3ToWgs84(
  cart: Cesium.Cartesian3,
): { lon: number; lat: number; alt: number } {
  const carto = Cesium.Cartographic.fromCartesian(cart);
  const gcjLon = Cesium.Math.toDegrees(carto.longitude);
  const gcjLat = Cesium.Math.toDegrees(carto.latitude);
  const [wgsLon, wgsLat] = gcj02ToWgs84(gcjLon, gcjLat);
  return { lon: wgsLon, lat: wgsLat, alt: carto.height };
}
