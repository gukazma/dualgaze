/**
 * 高德 AMap 公开瓦片 URL（无 key、无频次限制声明，但仅用于 demo / 内部 dev）。
 *
 * style 含义：
 *   - 6 = 卫星
 *   - 7 = 街道（无注记）
 *   - 8 = 路网 + 注记叠加（透明，盖在卫星上用）
 *   - 4 = 标准卫星 + 注记一体（不太好搭路网叠加，建议 6+8 分层）
 *
 * 主机两组：
 *   - webst0X.is.autonavi.com — 卫星 / 注记叠加
 *   - webrd0X.is.autonavi.com — 街道矢量瓦片
 *
 * subdomains 用 1/2/3/4 轮换分发，提高加载并发。
 */

export const AMAP_SUBDOMAINS = ['1', '2', '3', '4'];

export const AMAP_SATELLITE_URL =
  'https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}';

export const AMAP_LABELS_URL =
  'https://webst0{s}.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}';

export const AMAP_STREET_URL =
  'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}';

/** Cesium 用：返回 UrlTemplateImageryProvider 的 init opts */
export function amapSatelliteImageryOptions() {
  return {
    url: AMAP_SATELLITE_URL,
    subdomains: AMAP_SUBDOMAINS,
    maximumLevel: 18,
    credit: 'AMap',
  };
}

export function amapLabelsImageryOptions() {
  return {
    url: AMAP_LABELS_URL,
    subdomains: AMAP_SUBDOMAINS,
    maximumLevel: 18,
    credit: 'AMap',
  };
}
