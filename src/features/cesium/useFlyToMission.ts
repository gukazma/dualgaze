import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import { useCesiumViewer } from './CesiumContext';
import { useCurrentMission } from '../../store/missions';
import { wgs84ToCartesian3 } from '../../lib/coord';

/**
 * 当切换 / 选中 mission 时，自动把相机飞到该 mission 的航点中心。
 * - 有 ≥1 航点：飞到航点几何中心，俯视角 -50°，距离按包围球半径 × 3
 * - 没航点：飞到中国境内默认视角（一个安全的初始位置），让用户开始画
 */
export function useFlyToMission(): void {
  const viewer = useCesiumViewer();
  const mission = useCurrentMission();
  const lastFlownMissionRef = useRef<string | null>(null);
  const lastWaypointCountRef = useRef<number>(0);

  useEffect(() => {
    if (!viewer) return;

    // 启动时：没 mission 或 mission 没航点 → 飞到默认（北京视角）
    if (!mission || mission.waypoints.length === 0) {
      if (lastFlownMissionRef.current !== (mission?.id ?? null) && lastFlownMissionRef.current === null) {
        // 只第一次启动 fly default
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
      return;
    }

    // 切到新 mission 或者首次加点 → 飞过去
    const changedMission = mission.id !== lastFlownMissionRef.current;
    const firstWaypoint =
      lastFlownMissionRef.current === mission.id &&
      lastWaypointCountRef.current === 0 &&
      mission.waypoints.length > 0;

    if (changedMission || firstWaypoint) {
      const positions = mission.waypoints.map((w) => wgs84ToCartesian3(w.lon, w.lat, w.alt));
      const sphere = Cesium.BoundingSphere.fromPoints(positions);
      const range = Math.max(sphere.radius * 3, 400);
      viewer.camera.flyToBoundingSphere(sphere, {
        offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-50), range),
        duration: 1.2,
      });
      lastFlownMissionRef.current = mission.id;
    }

    lastWaypointCountRef.current = mission.waypoints.length;
  }, [viewer, mission?.id, mission?.waypoints.length, mission]);
}
