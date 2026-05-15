import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import { useCesiumViewer } from '../cesium/CesiumContext';
import { useCurrentMission, useMissionsStore } from '../../store/missions';
import { PolygonPicker, polygonVertexToCartesian3 } from './PolygonPicker';
import { wgs84ToCartesian3 } from '../../lib/coord';

const COLOR_POLY_FILL = Cesium.Color.fromCssColorString('#ffd24a').withAlpha(0.18);
const COLOR_POLY_OUTLINE = Cesium.Color.fromCssColorString('#ffd24a');
const COLOR_VERTEX = Cesium.Color.fromCssColorString('#ffd24a');
const COLOR_SCAN_PATH = Cesium.Color.fromCssColorString('#00d2c0');
const COLOR_SCAN_WP = Cesium.Color.fromCssColorString('#00d2c0');

/**
 * mapping mission 图层：
 *   - 1 polygon entity（黄 fill alpha 0.18 + outline 实线，CallbackProperty 读 polygon）
 *   - n vertex entities（可拖动小点 + 数字 label，绑 __polygonVertexIdx）
 *   - 1 scan-path polyline（青色 CallbackProperty 读 scanPath）
 *   - n scan-waypoint entities（小青点，可视化扫描航点）
 *   - 挂 PolygonPicker 处理交互
 */
export function MappingLayer() {
  const viewer = useCesiumViewer();
  const mission = useCurrentMission();

  // picker lifecycle —— 跟 viewer 创建/销毁
  const pickerRef = useRef<PolygonPicker | null>(null);
  useEffect(() => {
    if (!viewer) return;
    pickerRef.current = new PolygonPicker(viewer);
    return () => {
      pickerRef.current?.destroy();
      pickerRef.current = null;
    };
  }, [viewer]);

  // entities lifecycle —— 跟 mission.id 变化
  const dataSourceRef = useRef<Cesium.CustomDataSource | null>(null);
  const vertexEntitiesRef = useRef<Cesium.Entity[]>([]);
  const scanWpEntitiesRef = useRef<Cesium.Entity[]>([]);

  useEffect(() => {
    if (!viewer || !mission || mission.type !== 'mapping') {
      if (dataSourceRef.current && viewer) {
        viewer.dataSources.remove(dataSourceRef.current, true);
      }
      dataSourceRef.current = null;
      vertexEntitiesRef.current = [];
      scanWpEntitiesRef.current = [];
      return;
    }

    const ds = new Cesium.CustomDataSource(`mapping-${mission.id}`);
    void viewer.dataSources.add(ds);
    dataSourceRef.current = ds;

    const missionId = mission.id;
    const readMission = () =>
      useMissionsStore.getState().missions.find((m) => m.id === missionId);

    // polygon fill + outline（CallbackProperty 让顶点改后跟随）
    ds.entities.add({
      polygon: {
        hierarchy: new Cesium.CallbackProperty(() => {
          const m = readMission();
          if (!m || !m.polygon || m.polygon.length < 3) return new Cesium.PolygonHierarchy([]);
          return new Cesium.PolygonHierarchy(
            m.polygon.map((v) => wgs84ToCartesian3(v.lon, v.lat, v.alt)),
          );
        }, false),
        material: COLOR_POLY_FILL,
        outline: true,
        outlineColor: COLOR_POLY_OUTLINE,
        outlineWidth: 2,
        perPositionHeight: true,
      },
    });

    // 外圈轮廓 polyline（Cesium polygon.outline 在某些角度被 globe 钳掉，用 polyline 补保险）
    ds.entities.add({
      polyline: {
        positions: new Cesium.CallbackProperty(() => {
          const m = readMission();
          if (!m || !m.polygon || m.polygon.length < 2) return [];
          const arr = m.polygon.map((v) => wgs84ToCartesian3(v.lon, v.lat, v.alt));
          if (m.polygon.length >= 3) arr.push(arr[0]); // 闭合
          return arr;
        }, false),
        width: 2.5,
        material: COLOR_POLY_OUTLINE,
        arcType: Cesium.ArcType.GEODESIC,
        clampToGround: false,
      },
    });

    // scan path polyline（CallbackProperty 读 scanPath）
    ds.entities.add({
      polyline: {
        positions: new Cesium.CallbackProperty(() => {
          const m = readMission();
          if (!m || !m.scanPath || m.scanPath.length === 0) return [];
          return m.scanPath.map((w) => polygonVertexToCartesian3(w));
        }, false),
        width: 2.5,
        material: new Cesium.PolylineDashMaterialProperty({
          color: COLOR_SCAN_PATH,
          dashLength: 12,
        }),
        arcType: Cesium.ArcType.GEODESIC,
        clampToGround: false,
      },
    });

    return () => {
      viewer.dataSources.remove(ds, true);
      dataSourceRef.current = null;
      vertexEntitiesRef.current = [];
      scanWpEntitiesRef.current = [];
    };
  }, [viewer, mission?.id, mission?.type]);

  // 同步 vertex entities —— polygon 数组变化时增删
  useEffect(() => {
    const ds = dataSourceRef.current;
    if (!ds || !mission || mission.type !== 'mapping') return;
    const verts = mission.polygon ?? [];
    const list = vertexEntitiesRef.current;

    // 多了 → 补建
    while (list.length < verts.length) {
      const idx = list.length;
      const entity = ds.entities.add({
        position: polygonVertexToCartesian3(verts[idx]),
        point: {
          pixelSize: 12,
          color: COLOR_VERTEX,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 1,
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
      (entity as unknown as { __polygonVertexIdx: number }).__polygonVertexIdx = idx;
      list.push(entity);
    }
    // 多余的删
    while (list.length > verts.length) {
      const e = list.pop();
      if (e) ds.entities.remove(e);
    }
    // 更新位置 + label
    for (let i = 0; i < verts.length; i++) {
      const e = list[i];
      e.position = new Cesium.ConstantPositionProperty(polygonVertexToCartesian3(verts[i]));
      if (e.label) e.label.text = new Cesium.ConstantProperty(String(i + 1));
    }
  }, [mission, mission?.polygon]);

  // 同步 scan-waypoint 小点
  useEffect(() => {
    const ds = dataSourceRef.current;
    if (!ds || !mission || mission.type !== 'mapping') return;
    const scan = mission.scanPath ?? [];
    const list = scanWpEntitiesRef.current;

    while (list.length < scan.length) {
      const idx = list.length;
      const entity = ds.entities.add({
        position: polygonVertexToCartesian3(scan[idx]),
        point: {
          pixelSize: 6,
          color: COLOR_SCAN_WP,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 1,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      list.push(entity);
    }
    while (list.length > scan.length) {
      const e = list.pop();
      if (e) ds.entities.remove(e);
    }
    for (let i = 0; i < scan.length; i++) {
      list[i].position = new Cesium.ConstantPositionProperty(
        polygonVertexToCartesian3(scan[i]),
      );
    }
  }, [mission, mission?.scanPath]);

  return null;
}
