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

/**
 * AMap 公开免费端点的卫星瓦片实测**到 z=18 封顶**（z≥19 一律返回
 * 192-byte 的"此区域无卫星图"占位 PNG）。提高 maximumLevel 没用，
 * 只会让 Cesium 多拉一堆空瓦片浪费流量。
 *
 * 想要 z=19+ 的真高分辨率卫星需要切到：
 *   - ArcGIS World Imagery（z=19 全球免 token）
 *   - Bing Aerial / Mapbox Satellite（需 token）
 *
 * 见 `arcgisWorldImageryOptions` 作为可选 fallback。
 */

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

/**
 * ArcGIS World Imagery —— 全球免 token 卫星，z=19 可用，WGS84 原生
 * （不需要 GCJ-02 偏移）。当用户切到这个 baseLayer 时，coord.ts 的
 * wgs84ToCartesian3 仍兼容（境内 / 境外都直接 fromDegrees 即可）。
 */
export const ARCGIS_WORLD_IMAGERY_URL =
  'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

export function arcgisWorldImageryOptions() {
  return {
    url: ARCGIS_WORLD_IMAGERY_URL,
    maximumLevel: 19,
    credit: 'Esri, Maxar, Earthstar Geographics',
  };
}
