/**
 * 根据用户 IP 大致定位（城市级）。
 *
 * 用户原本指定 ip-api.com，但其免费层**只能 HTTP**，HTTPS 页面 fetch
 * 会被浏览器 mixed-content 拦截。这里挑了两个支持 HTTPS 的免 key 服务
 * 串成 fallback：
 *
 *   1. https://ipwho.is        — 主选；偶尔 403（区域 / 限流）就走 2.
 *   2. https://ipapi.co/json   — 备选；免费 1000/day 无 key
 *
 * 任何一个成功就返回；都失败抛 error 让 UI 弹 toast。
 *
 * 两家都直接给 WGS84 经纬度（不是 GCJ-02），可直接 flyTo。
 */
export interface IpLocateResult {
  lon: number;
  lat: number;
  city: string;
  country: string;
  ip: string;
}

interface ProviderResp {
  success?: boolean;
  message?: string;
  latitude?: number;
  longitude?: number;
  city?: string;
  country?: string;
  country_name?: string;
  ip?: string;
  error?: boolean | string;
  reason?: string;
}

async function tryProvider(url: string, timeoutMs: number): Promise<IpLocateResult> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`${new URL(url).host} HTTP ${res.status}`);
    const j: ProviderResp = await res.json();
    if (j.success === false || j.error === true) {
      throw new Error(j.message || j.reason || 'IP locate failed');
    }
    if (typeof j.latitude !== 'number' || typeof j.longitude !== 'number') {
      throw new Error('IP locate: bad response shape');
    }
    return {
      lon: j.longitude,
      lat: j.latitude,
      city: j.city ?? '',
      country: j.country_name ?? j.country ?? '',
      ip: j.ip ?? '',
    };
  } finally {
    window.clearTimeout(timer);
  }
}

export async function ipLocate(timeoutMs = 5000): Promise<IpLocateResult> {
  const providers = ['https://ipwho.is/', 'https://ipapi.co/json/'];
  const errors: string[] = [];
  for (const url of providers) {
    try {
      return await tryProvider(url, timeoutMs);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  throw new Error(`所有 IP 定位服务均失败：${errors.join(' / ')}`);
}
