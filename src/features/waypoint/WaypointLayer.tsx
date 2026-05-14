import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import type { Viewer } from 'cesium';
import { useCesiumViewer } from '../cesium/CesiumContext';
import { useCurrentMission, useMissionsStore } from '../../store/missions';
import { WaypointPicker, waypointToCartesian3 } from './WaypointPicker';
import type { Waypoint } from '../../types/mission';

/**
 * 在 viewer 上挂航点 layer + WaypointPicker。
 * 渲染：waypoint entities + polyline (CallbackProperty)。
 * 当前 mission 变化 / waypoints 变化 → 重建 entities。
 * 选中的 waypoint 描金色光环。
 */
export function WaypointLayer() {
  const viewer = useCesiumViewer();
  const mission = useCurrentMission();
  const selectedWaypointId = useMissionsStore((s) => s.selectedWaypointId);

  // picker lifecycle —— 只跟 viewer 创建/销毁，不随 mission 重建
  const pickerRef = useRef<WaypointPicker | null>(null);
  useEffect(() => {
    if (!viewer) return;
    pickerRef.current = new WaypointPicker(viewer);
    return () => {
      pickerRef.current?.destroy();
      pickerRef.current = null;
    };
  }, [viewer]);

  // entities lifecycle —— 跟 mission.id 变化
  const dataSourceRef = useRef<Cesium.CustomDataSource | null>(null);
  const entityByIdRef = useRef<Map<string, Cesium.Entity>>(new Map());

  useEffect(() => {
    if (!viewer || !mission) {
      // 当前没 mission 或 viewer 还没初始化 → 清空
      if (dataSourceRef.current && viewer) {
        viewer.dataSources.remove(dataSourceRef.current, true);
      }
      dataSourceRef.current = null;
      entityByIdRef.current.clear();
      return;
    }

    const ds = new Cesium.CustomDataSource(`waypoints-${mission.id}`);
    viewer.dataSources.add(ds);
    dataSourceRef.current = ds;
    entityByIdRef.current = new Map();

    // polyline 连线 —— CallbackProperty 读取最新 waypoints
    ds.entities.add({
      polyline: {
        positions: new Cesium.CallbackProperty(() => {
          const m = useMissionsStore.getState().missions.find((mm) => mm.id === mission.id);
          if (!m) return [];
          return m.waypoints.map((w) => waypointToCartesian3(w));
        }, false),
        width: 2.5,
        material: Cesium.Color.fromCssColorString('#ffd24a'),
        arcType: Cesium.ArcType.GEODESIC,
        clampToGround: false,
      },
    });

    return () => {
      viewer.dataSources.remove(ds, true);
      dataSourceRef.current = null;
      entityByIdRef.current.clear();
    };
  }, [viewer, mission?.id]);

  // 同步 waypoint entities —— 增量 add/remove/update
  useEffect(() => {
    const ds = dataSourceRef.current;
    if (!ds || !mission) return;

    const map = entityByIdRef.current;
    const currentIds = new Set<string>();

    mission.waypoints.forEach((wp, idx) => {
      currentIds.add(wp.id);
      const isSelected = wp.id === selectedWaypointId;
      const existing = map.get(wp.id);
      const position = waypointToCartesian3(wp);
      if (existing) {
        existing.position = new Cesium.ConstantPositionProperty(position);
        if (existing.point) {
          existing.point.pixelSize = new Cesium.ConstantProperty(isSelected ? 14 : 11);
          existing.point.outlineColor = new Cesium.ConstantProperty(
            isSelected ? Cesium.Color.WHITE : Cesium.Color.BLACK,
          );
          existing.point.outlineWidth = new Cesium.ConstantProperty(isSelected ? 3 : 1);
        }
        if (existing.label) {
          existing.label.text = new Cesium.ConstantProperty(String(idx + 1));
        }
      } else {
        const entity = ds.entities.add({
          position,
          point: {
            pixelSize: isSelected ? 14 : 11,
            color: Cesium.Color.fromCssColorString('#ffd24a'),
            outlineColor: isSelected ? Cesium.Color.WHITE : Cesium.Color.BLACK,
            outlineWidth: isSelected ? 3 : 1,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: String(idx + 1),
            font: '11px sans-serif',
            fillColor: Cesium.Color.BLACK,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(0, -16),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
        // 给 picker 用：从 entity 上读 waypointId
        (entity as unknown as { __waypointId: string }).__waypointId = wp.id;
        map.set(wp.id, entity);
      }
    });

    // 删除不存在的
    for (const [id, entity] of map) {
      if (!currentIds.has(id)) {
        ds.entities.remove(entity);
        map.delete(id);
      }
    }
  }, [mission, mission?.waypoints, selectedWaypointId]);

  return null;
}

// hook re-export for picker subscribers
export type { WaypointPicker };

export function useWaypoints(): Waypoint[] {
  const mission = useCurrentMission();
  return mission?.waypoints ?? [];
}

export function useWaypointViewer(): Viewer | null {
  return useCesiumViewer();
}
