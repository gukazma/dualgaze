import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import { useCesiumViewer } from './CesiumContext';
import { useCurrentMission } from '../../store/missions';
import { useLocationStore } from '../../store/location';
import { wgs84ToCartesian3 } from '../../lib/coord';

const DEFAULT_LON = 116.4074;
const DEFAULT_LAT = 39.9042;
const DEFAULT_ALT = 5000;
const DEFAULT_PITCH_DEG = -55;

/**
 * 当切换 / 选中 mission 时，自动把相机飞到该 mission 的几何中心。
 * - patrol：用 mission.waypoints 算包围球
 * - mapping：用 mission.polygon 算包围球（polygon 有 ≥1 点就够）
 * - 启动时无 mission：飞到 location store 里的 recent（如果有），否则飞北京
 *
 * 启动时 fallback 用 setView 立即就位（不动画），避免用户看到一段
 * "黑屏 → 飞过去" 的过渡（Cesium 默认相机在大西洋上空 12,000km，
 * 视野里几乎全是黑色 + 地球小球，体感是 "找不到地球"）。
 */
export function useFlyToMission(): void {
  const viewer = useCesiumViewer();
  const mission = useCurrentMission();
  const hasInitFlown = useRef(false);
  const lastFlownMissionRef = useRef<string | null>(null);
  const lastAnchorCountRef = useRef<number>(0);

  useEffect(() => {
    if (!viewer) return;

    const anchors = collectAnchors(mission);

    // === 路径 A：有 mission 且有 anchor → 飞 mission ===
    if (mission && anchors.length > 0) {
      const changedMission = mission.id !== lastFlownMissionRef.current;
      const firstAnchor =
        lastFlownMissionRef.current === mission.id &&
        lastAnchorCountRef.current === 0;

      if (changedMission || firstAnchor || !hasInitFlown.current) {
        const positions = anchors.map((p) => wgs84ToCartesian3(p.lon, p.lat, p.alt));
        const sphere = Cesium.BoundingSphere.fromPoints(positions);
        const range = Math.max(sphere.radius * 3, 400);
        viewer.camera.flyToBoundingSphere(sphere, {
          offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-50), range),
          duration: hasInitFlown.current ? 1.2 : 0,
        });
        lastFlownMissionRef.current = mission.id;
        hasInitFlown.current = true;
      }
      lastAnchorCountRef.current = anchors.length;
      return;
    }

    // === 路径 B：没 mission / 没 anchor → 仅启动时飞一次默认 ===
    if (!hasInitFlown.current) {
      const recent = useLocationStore.getState().recent;
      const lon = recent?.lon ?? DEFAULT_LON;
      const lat = recent?.lat ?? DEFAULT_LAT;
      // setView 立即就位 —— 用户首屏直接看到地球，不经历 12000km
      // 飞回 5km 的长动画（飞这种距离 Cesium 内部还会先穿太空，体验差）
      viewer.camera.setView({
        destination: wgs84ToCartesian3(lon, lat, DEFAULT_ALT),
        orientation: {
          heading: 0,
          pitch: Cesium.Math.toRadians(DEFAULT_PITCH_DEG),
          roll: 0,
        },
      });
      hasInitFlown.current = true;
    }
    lastFlownMissionRef.current = mission?.id ?? null;
    lastAnchorCountRef.current = 0;
  }, [viewer, mission?.id, mission?.waypoints.length, mission?.polygon?.length, mission]);
}

function collectAnchors(
  mission: ReturnType<typeof useCurrentMission>,
): Array<{ lon: number; lat: number; alt: number }> {
  if (!mission) return [];
  if (mission.type === 'mapping') {
    return mission.polygon ?? [];
  }
  return mission.waypoints;
}
