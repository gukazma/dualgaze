/**
 * 高德 Web JS API 地名搜索封装。
 *
 * - 动态注入 `<script src="https://webapi.amap.com/maps?...&plugin=AMap.AutoComplete">`，
 *   通过 jsonp callback 拿到 `window.AMap`。
 * - 全局共享一个 promise，多次调用只 load 一次。
 * - 高德返回的经纬度是 **GCJ-02**（火星坐标），调 `gcj02ToWgs84` 转回
 *   WGS84 后才能直接 flyTo（DualGaze 全链路用 WGS84）。
 *
 * 需要环境变量 `VITE_AMAP_KEY`（用户去 https://lbs.amap.com 申请）。
 * 没配 key 时 `isAmapAvailable()` 返回 false，UI 自己 disable 地名 input。
 */
import { gcj02ToWgs84 } from './coord';

const AMAP_VERSION = '2.0';
const AMAP_PLUGINS = ['AMap.AutoComplete', 'AMap.PlaceSearch'];

interface AMapTip {
  id?: string;
  name?: string;
  district?: string;
  address?: string;
  location?: { lng: number; lat: number };
}

interface AMapAutoComplete {
  search(
    keyword: string,
    cb: (status: string, result: { tips?: AMapTip[]; info?: string }) => void,
  ): void;
}

interface AMapNamespace {
  AutoComplete: new (opts?: { city?: string }) => AMapAutoComplete;
}

declare global {
  interface Window {
    AMap?: AMapNamespace;
    __amap_init_cb__?: () => void;
    _AMapSecurityConfig?: { securityJsCode: string };
  }
}

let loadPromise: Promise<AMapNamespace> | null = null;

export function getAmapKey(): string {
  return (import.meta.env.VITE_AMAP_KEY as string | undefined) ?? '';
}

function getAmapJsCode(): string {
  return (import.meta.env.VITE_AMAP_JSCODE as string | undefined) ?? '';
}

export function isAmapAvailable(): boolean {
  return getAmapKey().trim().length > 0;
}

function loadAmap(): Promise<AMapNamespace> {
  if (window.AMap) return Promise.resolve(window.AMap);
  if (loadPromise) return loadPromise;

  const key = getAmapKey();
  if (!key) return Promise.reject(new Error('未配置 VITE_AMAP_KEY'));

  // 高德 2021-12-02 后新建的 key 都强制要 jscode 安全密钥；必须在
  // 加载 SDK 之前挂到 window._AMapSecurityConfig 上，否则 SDK 内部
  // 拒绝任何 API 调用（INVALID_USER_SCODE）。
  const jscode = getAmapJsCode();
  if (jscode) {
    window._AMapSecurityConfig = { securityJsCode: jscode };
  }

  loadPromise = new Promise((resolve, reject) => {
    window.__amap_init_cb__ = () => {
      if (window.AMap) resolve(window.AMap);
      else reject(new Error('AMap SDK loaded but window.AMap undefined'));
      delete window.__amap_init_cb__;
    };
    const script = document.createElement('script');
    const plugins = AMAP_PLUGINS.join(',');
    script.src = `https://webapi.amap.com/maps?v=${AMAP_VERSION}&key=${encodeURIComponent(
      key,
    )}&plugin=${plugins}&callback=__amap_init_cb__`;
    script.async = true;
    script.onerror = () => {
      loadPromise = null;
      reject(new Error('AMap SDK 加载失败（key 是否有效？网络是否通畅？）'));
    };
    document.head.appendChild(script);
  });
  return loadPromise;
}

export interface AmapSuggest {
  id: string;
  name: string;
  district: string;
  address: string;
  /** WGS84 经度（高德原始 GCJ-02 已转换） */
  lon: number;
  /** WGS84 纬度 */
  lat: number;
}

/**
 * 地名 autocomplete 搜索。返回最多 5 条带坐标的 tip。
 * 没坐标的 tip（高德有些 tip 只是分类提示词）会被过滤掉。
 */
export async function amapAutoComplete(keyword: string): Promise<AmapSuggest[]> {
  if (!keyword.trim()) return [];
  const AMap = await loadAmap();
  const ac = new AMap.AutoComplete({ city: '全国' });
  return new Promise((resolve, reject) => {
    ac.search(keyword, (status, result) => {
      if (status !== 'complete' || !result.tips) {
        if (status === 'error') {
          reject(new Error(result.info || 'AMap autocomplete error'));
          return;
        }
        resolve([]);
        return;
      }
      const out: AmapSuggest[] = [];
      for (const tip of result.tips) {
        if (!tip.location || typeof tip.location.lng !== 'number') continue;
        const [wgsLon, wgsLat] = gcj02ToWgs84(tip.location.lng, tip.location.lat);
        out.push({
          id: tip.id ?? `${out.length}`,
          name: tip.name ?? '',
          district: tip.district ?? '',
          address: tip.address ?? '',
          lon: wgsLon,
          lat: wgsLat,
        });
        if (out.length >= 5) break;
      }
      resolve(out);
    });
  });
}
