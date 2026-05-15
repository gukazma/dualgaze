import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import { useCesiumViewer } from '../cesium/CesiumContext';
import { useCurrentMission } from '../../store/missions';
import { useSimulationStore } from '../../store/simulation';
import { wgs84ToCartesian3 } from '../../lib/coord';
import { effectiveWaypoints } from './SimulationLoop';

/**
 * 模拟飞行可视化层：
 *   - 完整参考轨迹（cyan 半透明，贯穿 mission 全程，让用户一眼看见整条路径）
 *   - 已飞段实色 cyan 覆盖完整轨迹（实时进度可视化）
 *   - drone entity（青色圆 + label）位置随 droneState 变化
 *
 * 只在 mode === 'simulating' 时渲染；exitSim 时清理。
 * patrol 用 mission.waypoints；mapping 用 mission.scanPath（走 effectiveWaypoints）。
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

    // 完整参考轨迹（贯穿全程，cyan 半透明实线）
    ds.entities.add({
      polyline: {
        positions: new Cesium.CallbackProperty(() => {
          const wps = effectiveWaypoints(mission);
          return wps.map((wp) => wgs84ToCartesian3(wp.lon, wp.lat, wp.alt));
        }, false),
        width: 2.5,
        material: Cesium.Color.fromCssColorString('#00d2c0').withAlpha(0.35),
        arcType: Cesium.ArcType.GEODESIC,
        clampToGround: false,
      },
    });

    // 已飞段（实色 cyan 加粗，覆盖完整轨迹的前半段）
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
        width: 4,
        material: Cesium.Color.fromCssColorString('#00d2c0'),
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
