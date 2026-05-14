/**
 * 多边形 → S 型扫描路径算法。
 *
 * 移植 dji_way_line/src/utils/polygonRouteGenerator.js:162-306 → TS。
 * 输入多边形顶点（WGS84）+ scanParams，输出 Waypoint[]（也是 WGS84）。
 *
 * 步骤：
 *  1. 投影到平面坐标（小区域近似线性、误差 < 1m）
 *  2. 缩进 margin
 *  3. 旋转对齐 direction
 *  4. 求平行扫描线（间距 spacing）与多边形交点
 *  5. 交错排序成 S 型
 *  6. 删除三点共线中间点（path 优化）
 *  7. 反旋转 + 反投影回 WGS84
 */
import {
  createWaypoint,
  type MappingScanParams,
  type PolygonVertex,
  type Waypoint,
} from '../types/mission';

const EARTH_RADIUS = 6378137;

interface PlanePoint {
  x: number;
  y: number;
}

interface Origin {
  lon: number;
  lat: number;
}

/**
 * 给定 mapping mission 的多边形 + 扫描参数 + 飞行高度 + 速度，
 * 生成 S 型扫描航点数组（WGS84）。
 *
 * @param polygon 多边形顶点（≥ 3）
 * @param params 扫描参数
 * @param flight 飞行参数：alt（高度 m）、speed（速度 m/s）
 */
export function generateScanPath(
  polygon: PolygonVertex[],
  params: MappingScanParams,
  flight: { alt: number; speed: number },
): Waypoint[] {
  if (polygon.length < 3) return [];

  const { spacing, direction, margin, gimbalPitchAngle } = params;
  if (spacing <= 0) return [];

  const origin: Origin = { lon: polygon[0].lon, lat: polygon[0].lat };

  // 1. 投影到平面
  let plane: PlanePoint[] = polygon.map((p) => projectToMeters(p.lat, p.lon, origin));

  // 2. 缩进
  if (margin > 0) {
    plane = shrinkPolygon(plane, margin);
    if (plane.length < 3) return [];
  }

  // 3. 旋转：direction=0 时扫描线沿东西方向（水平 Y 等高线），扫描方向沿南北
  //    direction=90 时旋转 -90°，让多边形横置，扫描方向变东西
  const center = polygonCenter(plane);
  const angleRad = (-direction * Math.PI) / 180;
  const rotated = plane.map((p) => rotatePoint(p, angleRad, center));

  // 4. bbox + 水平扫描
  const bbox = boundingBox(rotated);
  const waypointsRotated: PlanePoint[] = [];
  let currentY = bbox.minY + spacing / 2;
  let lineIndex = 0;

  while (currentY <= bbox.maxY) {
    const intersections = scanLineIntersections(rotated, currentY);
    intersections.sort((a, b) => a - b);

    // 5. S 型：偶数行 left→right，奇数行 right→left
    const leftToRight = lineIndex % 2 === 0;
    for (let k = 0; k + 1 < intersections.length; k += 2) {
      const x1 = intersections[k];
      const x2 = intersections[k + 1];
      if (leftToRight) {
        waypointsRotated.push({ x: x1, y: currentY });
        waypointsRotated.push({ x: x2, y: currentY });
      } else {
        waypointsRotated.push({ x: x2, y: currentY });
        waypointsRotated.push({ x: x1, y: currentY });
      }
    }
    currentY += spacing;
    lineIndex++;
  }

  if (waypointsRotated.length === 0) return [];

  // 6. 删除三点共线中间点
  const optimized = waypointsRotated.length > 4 ? optimizePath(waypointsRotated) : waypointsRotated;

  // 7. 反旋转 + 反投影回 lat/lon
  const unrotated = optimized.map((p) => rotatePoint(p, -angleRad, center));
  return unrotated.map((p, i) => {
    const ll = unprojectFromMeters(p.x, p.y, origin);
    return createWaypoint({
      index: i,
      lon: Number(ll.lon.toFixed(7)),
      lat: Number(ll.lat.toFixed(7)),
      alt: flight.alt,
      speed: flight.speed,
      heading: 0,
      pitch: gimbalPitchAngle,
      fov: 60,
    });
  });
}

// ============ helpers ============

function projectToMeters(lat: number, lon: number, origin: Origin): PlanePoint {
  const dLat = ((lat - origin.lat) * Math.PI) / 180;
  const dLon = ((lon - origin.lon) * Math.PI) / 180;
  const x = dLon * EARTH_RADIUS * Math.cos((origin.lat * Math.PI) / 180);
  const y = dLat * EARTH_RADIUS;
  return { x, y };
}

function unprojectFromMeters(x: number, y: number, origin: Origin): { lon: number; lat: number } {
  const dLat = y / EARTH_RADIUS;
  const lat = origin.lat + (dLat * 180) / Math.PI;
  const dLon = x / (EARTH_RADIUS * Math.cos((origin.lat * Math.PI) / 180));
  const lon = origin.lon + (dLon * 180) / Math.PI;
  return { lon, lat };
}

function rotatePoint(p: PlanePoint, angleRad: number, center: PlanePoint): PlanePoint {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

function boundingBox(poly: PlanePoint[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

function polygonCenter(poly: PlanePoint[]): PlanePoint {
  let sx = 0, sy = 0;
  for (const p of poly) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / poly.length, y: sy / poly.length };
}

/** 等比缩向中心（dji_way_line 简化实现，非真正 offset polygon） */
function shrinkPolygon(poly: PlanePoint[], marginMeters: number): PlanePoint[] {
  const center = polygonCenter(poly);
  const distances = poly.map((p) => Math.hypot(p.x - center.x, p.y - center.y));
  const avg = distances.reduce((a, b) => a + b, 0) / distances.length;
  const scale = Math.max(0.1, (avg - marginMeters) / avg);
  return poly.map((p) => ({
    x: center.x + (p.x - center.x) * scale,
    y: center.y + (p.y - center.y) * scale,
  }));
}

function scanLineIntersections(poly: PlanePoint[], y: number): number[] {
  const xs: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p1 = poly[i];
    const p2 = poly[(i + 1) % poly.length];
    // 半开区间：恰好命中顶点不重复计数
    const crosses = (p1.y <= y && p2.y > y) || (p1.y > y && p2.y <= y);
    if (!crosses) continue;
    const t = (y - p1.y) / (p2.y - p1.y);
    xs.push(p1.x + t * (p2.x - p1.x));
  }
  return xs;
}

/** 三点共线（叉积 < epsilon）时删中间点；保留端点 */
function optimizePath(path: PlanePoint[]): PlanePoint[] {
  const EPS = 0.5; // 0.5 m² 容差
  const out: PlanePoint[] = [path[0]];
  for (let i = 1; i < path.length - 1; i++) {
    const a = out[out.length - 1];
    const b = path[i];
    const c = path[i + 1];
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (Math.abs(cross) > EPS) out.push(b);
  }
  out.push(path[path.length - 1]);
  return out;
}
