import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import { useCesiumViewer } from '../cesium/CesiumContext';
import { useCurrentMission } from '../../store/missions';
import { useSimulationStore } from '../../store/simulation';
import { wgs84ToCartesian3 } from '../../lib/coord';
import { effectiveWaypoints } from './SimulationLoop';

/**
 * 模拟飞行可视化层：
 *   - drone entity（青色圆 + plane billboard）位置随 droneState 变化
 *   - 已飞段（cyan 实线）：从 waypoint[0] → … → waypoint[segIdx] → drone
 *   - 未飞段（yellow 虚线）：drone → waypoint[segIdx+1] → … → waypoint[last]
 *
 * 只在 mode === 'simulating' 时渲染；exitSim 时清理。
 */
export function DroneLayer() {
  const viewer = useCesiumViewer();
  const mission = useCurrentMission();
  const mode = useSimulationStore((s) => s.mode);

  const dataSourceRef = useRef<Cesium.CustomDataSource | null>(null);

  useEffect(() => {
    if (!viewer || !mission || mode !== 'simulating') {
      if (dataSourceRef.current && viewer) {
        viewer.dataSources.remove(dataSourceRef.current, true);
      }
      dataSourceRef.current = null;
      return;
    }

    const ds = new Cesium.CustomDataSource(`drone-${mission.id}`);
    viewer.dataSources.add(ds);
    dataSourceRef.current = ds;

    // 已飞段
    ds.entities.add({
      polyline: {
        positions: new Cesium.CallbackProperty(() => {
          const s = useSimulationStore.getState();
          const m = mission;
          if (!s.droneState) return [];
          const positions: Cesium.Cartesian3[] = [];
          for (let i = 0; i <= s.currentSegmentIndex; i++) {
            const wp = effectiveWaypoints(m)[i];
            if (wp) positions.push(wgs84ToCartesian3(wp.lon, wp.lat, wp.alt));
          }
          positions.push(
            wgs84ToCartesian3(s.droneState.lon, s.droneState.lat, s.droneState.alt),
          );
          return positions;
        }, false),
        width: 3,
        material: Cesium.Color.fromCssColorString('#00d2c0'),
        arcType: Cesium.ArcType.GEODESIC,
        clampToGround: false,
      },
    });

    // 未飞段（drone → 剩余 waypoints）
    ds.entities.add({
      polyline: {
        positions: new Cesium.CallbackProperty(() => {
          const s = useSimulationStore.getState();
          const m = mission;
          if (!s.droneState) return [];
          const positions: Cesium.Cartesian3[] = [
            wgs84ToCartesian3(s.droneState.lon, s.droneState.lat, s.droneState.alt),
          ];
          for (let i = s.currentSegmentIndex + 1; i < effectiveWaypoints(m).length; i++) {
            const wp = effectiveWaypoints(m)[i];
            if (wp) positions.push(wgs84ToCartesian3(wp.lon, wp.lat, wp.alt));
          }
          return positions;
        }, false),
        width: 2,
        material: new Cesium.PolylineDashMaterialProperty({
          color: Cesium.Color.fromCssColorString('#ffd24a'),
          dashLength: 12,
        }),
        arcType: Cesium.ArcType.GEODESIC,
        clampToGround: false,
      },
    });

    // drone entity —— position 走 CallbackPositionProperty
    ds.entities.add({
      position: new Cesium.CallbackPositionProperty(() => {
        const s = useSimulationStore.getState();
        if (!s.droneState) return Cesium.Cartesian3.ZERO;
        return wgs84ToCartesian3(s.droneState.lon, s.droneState.lat, s.droneState.alt);
      }, false),
      point: {
        pixelSize: 14,
        color: Cesium.Color.fromCssColorString('#00d2c0'),
        outlineColor: Cesium.Color.fromCssColorString('#0c0d10'),
        outlineWidth: 3,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: 'UAV',
        font: '10px sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -22),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });

    return () => {
      viewer.dataSources.remove(ds, true);
      dataSourceRef.current = null;
    };
  }, [viewer, mission, mode]);

  return null;
}
