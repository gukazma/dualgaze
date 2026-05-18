import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import { useCesiumViewer } from '../cesium/CesiumContext';
import { useCurrentMission } from '../../store/missions';
import { useSimulationStore } from '../../store/simulation';
import { wgs84ToCartesian3 } from '../../lib/coord';
import type { Waypoint } from '../../types/mission';
import { effectiveWaypoints } from '../simulation/SimulationLoop';

const FAR_METERS = 3;
const ASPECT = 4 / 3;

/**
 * 模拟飞行时，drone 到达每个 waypoint 长出半透明视锥：apex 在 waypoint，
 * 4 远端角点按 waypoint.heading / pitch / fov 算。
 *
 * 几何：ENU 局部基底（East/North/Up）做朝向，4 三角面（apex + 相邻两个 corner）
 * 拼出锥体侧面。perPositionHeight=true 防止 polygon 被 globe 钳到地面。
 *
 * 触发：SimulationLoop 在 reachedWaypointIds 中加 id 时，本组件订阅 store 重建 entity。
 * 退出模拟时 reachedWaypointIds 清空 → entity 全部移除。
 */
export function FrustumLayer() {
  const viewer = useCesiumViewer();
  const mission = useCurrentMission();
  const reachedIds = useSimulationStore((s) => s.reachedWaypointIds);
  const dsRef = useRef<Cesium.CustomDataSource | null>(null);

  useEffect(() => {
    if (!viewer) return;
    const ds = new Cesium.CustomDataSource('frustums');
    void viewer.dataSources.add(ds);
    dsRef.current = ds;
    return () => {
      viewer.dataSources.remove(ds, true);
      dsRef.current = null;
    };
  }, [viewer]);

  useEffect(() => {
    const ds = dsRef.current;
    if (!ds) return;
    ds.entities.removeAll();
    if (!mission) return;
    for (const wp of effectiveWaypoints(mission)) {
      if (!reachedIds.has(wp.id)) continue;
      addFrustum(ds, wp);
    }
  }, [mission, reachedIds]);

  return null;
}

function addFrustum(ds: Cesium.CustomDataSource, wp: Waypoint): void {
  const { apex, corners } = frustumGeometry(wp);
  const fill = hueColor(wp.index, 0.22);
  const outline = hueColor(wp.index, 0.95);

  // 4 三角面（apex + Ci + C(i+1)）。perPositionHeight 保证不被钳地。
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    ds.entities.add({
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy([apex, corners[i], corners[j]]),
        perPositionHeight: true,
        material: fill,
        outline: true,
        outlineColor: outline,
        outlineWidth: 2,
      },
    });
  }

  // 4 corner 围成的"远平面"（独立 polygon，提示视场矩形）
  ds.entities.add({
    polygon: {
      hierarchy: new Cesium.PolygonHierarchy(corners),
      perPositionHeight: true,
      material: Cesium.Color.TRANSPARENT,
      outline: true,
      outlineColor: outline,
      outlineWidth: 1.5,
    },
  });
}

function frustumGeometry(wp: Waypoint): {
  apex: Cesium.Cartesian3;
  corners: Cesium.Cartesian3[];
} {
  const apex = wgs84ToCartesian3(wp.lon, wp.lat, wp.alt);
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(apex);

  const headingRad = Cesium.Math.toRadians(wp.heading);
  const pitchRad = Cesium.Math.toRadians(wp.pitch);
  const fovRad = Cesium.Math.toRadians(wp.fov);

  const cosH = Math.cos(headingRad);
  const sinH = Math.sin(headingRad);
  const cosP = Math.cos(pitchRad);
  const sinP = Math.sin(pitchRad);

  // forward in ENU：heading=0 → +Y(N)，pitch>0 → +Z（向上）
  const forward = new Cesium.Cartesian3(cosP * sinH, cosP * cosH, sinP);
  // right in ENU 水平面，heading=0 → +X(E)
  const right = new Cesium.Cartesian3(cosH, -sinH, 0);
  // up = right × forward
  const up = new Cesium.Cartesian3();
  Cesium.Cartesian3.cross(right, forward, up);
  Cesium.Cartesian3.normalize(up, up);

  const halfW = Math.tan(fovRad / 2) * FAR_METERS;
  const halfH = halfW / ASPECT;

  // 远端中心点（ENU 局部）
  const center = scale(forward, FAR_METERS);
  const cornersLocal = [
    add(add(center, scale(up, halfH)), scale(right, -halfW)), // TL
    add(add(center, scale(up, halfH)), scale(right, halfW)),  // TR
    add(add(center, scale(up, -halfH)), scale(right, halfW)), // BR
    add(add(center, scale(up, -halfH)), scale(right, -halfW)),// BL
  ];

  const corners = cornersLocal.map((c) =>
    Cesium.Matrix4.multiplyByPoint(enu, c, new Cesium.Cartesian3()),
  );
  return { apex, corners };
}

function add(a: Cesium.Cartesian3, b: Cesium.Cartesian3): Cesium.Cartesian3 {
  return Cesium.Cartesian3.add(a, b, new Cesium.Cartesian3());
}
function scale(a: Cesium.Cartesian3, s: number): Cesium.Cartesian3 {
  return Cesium.Cartesian3.multiplyByScalar(a, s, new Cesium.Cartesian3());
}

/** 按 waypoint index 取一组高对比度的 HSL hue（青 → 绿 → 黄 → 橙 → 红 → 紫 循环） */
function hueColor(idx: number, alpha: number): Cesium.Color {
  const hue = (((180 + idx * 55) % 360) + 360) % 360;
  return Cesium.Color.fromHsl(hue / 360, 0.75, 0.55, alpha);
}
