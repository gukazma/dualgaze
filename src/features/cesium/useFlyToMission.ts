import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import { useCesiumViewer } from './CesiumContext';
import { useCurrentMission } from '../../store/missions';
import { wgs84ToCartesian3 } from '../../lib/coord';

/**
 * 当切换 / 选中 mission 时，自动把相机飞到该 mission 的几何中心。
 * - patrol：用 mission.waypoints 算包围球
 * - mapping：用 mission.polygon 算包围球（polygon 有 ≥1 点就够）
 * - 都空：飞默认（北京视角）
 */
export function useFlyToMission(): void {
  const viewer = useCesiumViewer();
  const mission = useCurrentMission();
  const lastFlownMissionRef = useRef<string | null>(null);
  const lastAnchorCountRef = useRef<number>(0);

  useEffect(() => {
    if (!viewer) return;

    const anchors = collectAnchors(mission);

    // 启动时：没 mission 或没有任何锚点 → 飞到默认（北京视角）
    if (!mission || anchors.length === 0) {
      if (lastFlownMissionRef.current !== (mission?.id ?? null) && lastFlownMissionRef.current === null) {
        viewer.camera.flyTo({
          destination: wgs84ToCartesian3(116.40, 39.91, 5000),
          orientation: {
            heading: 0,
            pitch: Cesium.Math.toRadians(-55),
            roll: 0,
          },
          duration: 1.2,
        });
        lastFlownMissionRef.current = mission?.id ?? null;
      }
      lastAnchorCountRef.current = 0;
      return;
    }

    // 切到新 mission 或者首次加点 → 飞过去
    const changedMission = mission.id !== lastFlownMissionRef.current;
    const firstAnchor =
      lastFlownMissionRef.current === mission.id &&
      lastAnchorCountRef.current === 0 &&
      anchors.length > 0;

    if (changedMission || firstAnchor) {
      const positions = anchors.map((p) => wgs84ToCartesian3(p.lon, p.lat, p.alt));
      const sphere = Cesium.BoundingSphere.fromPoints(positions);
      const range = Math.max(sphere.radius * 3, 400);
      viewer.camera.flyToBoundingSphere(sphere, {
        offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-50), range),
        duration: 1.2,
      });
      lastFlownMissionRef.current = mission.id;
    }

    lastAnchorCountRef.current = anchors.length;
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
