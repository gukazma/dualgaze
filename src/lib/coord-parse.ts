/**
 * 解析用户在 LocationSearchTab 输入的经纬度字符串。
 *
 * 接受的写法（默认 lon, lat 顺序，与 Cesium / DJI / KMZ 一致）：
 *   - "121.4737, 31.2304"
 *   - "121.4737 31.2304"
 *   - "121.4737,31.2304"
 *   - "E121.4737, N31.2304" / "E 121.47 N 31.23"
 *   - "N31.2304, E121.4737"  ←方向前缀就以方向为准，不看顺序
 *
 * 校验：经度 [-180, 180]，纬度 [-90, 90]。失败返回 null。
 *
 * 一律视为 WGS84（DJI / Cesium / KMZ 习惯）。
 */
export interface ParsedCoord {
  lon: number;
  lat: number;
}

export function parseCoord(input: string): ParsedCoord | null {
  const t = input.trim();
  if (!t) return null;

  // 抽出所有数字（含负号、小数点），并记录每个数字在原字符串里的位置
  const re = /-?\d+(?:\.\d+)?/g;
  const nums: { value: number; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    nums.push({ value: parseFloat(m[0]), start: m.index, end: m.index + m[0].length });
    if (nums.length === 2) break;
  }
  if (nums.length < 2) return null;

  // 找每个数字旁边的 N/S/E/W 标记（前 1 个字符 或 后 1 个字符）
  const dirOf = (n: (typeof nums)[number]): 'N' | 'S' | 'E' | 'W' | null => {
    const before = n.start > 0 ? t[n.start - 1] : '';
    const after = n.end < t.length ? t[n.end] : '';
    for (const ch of [before, after]) {
      if (!ch) continue;
      const u = ch.toUpperCase();
      if (u === 'N' || u === 'S' || u === 'E' || u === 'W') return u;
    }
    return null;
  };

  const d0 = dirOf(nums[0]);
  const d1 = dirOf(nums[1]);

  let lon: number;
  let lat: number;
  if (d0 === 'N' || d0 === 'S' || d1 === 'E' || d1 === 'W') {
    // 方向显式：第一个是纬度
    lat = d0 === 'S' ? -nums[0].value : nums[0].value;
    lon = d1 === 'W' ? -nums[1].value : nums[1].value;
  } else if (d0 === 'E' || d0 === 'W' || d1 === 'N' || d1 === 'S') {
    // 方向显式：第一个是经度
    lon = d0 === 'W' ? -nums[0].value : nums[0].value;
    lat = d1 === 'S' ? -nums[1].value : nums[1].value;
  } else {
    // 无方向标记 → 默认 lon, lat 顺序
    lon = nums[0].value;
    lat = nums[1].value;
  }

  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  if (lon < -180 || lon > 180) return null;
  if (lat < -90 || lat > 90) return null;

  return { lon, lat };
}

/**
 * 反向：把经纬度格式化成短字符串显示 / 写入 localStorage。
 * 用 4 位小数 ≈ 11m 精度，足够城市级定位。
 */
export function formatCoord(lon: number, lat: number, fractionDigits = 4): string {
  return `${lon.toFixed(fractionDigits)}, ${lat.toFixed(fractionDigits)}`;
}
