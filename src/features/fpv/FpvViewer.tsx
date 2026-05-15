import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { useSimulationStore } from '../../store/simulation';
import { useCurrentMission } from '../../store/missions';
import { arcgisWorldImageryOptions } from '../../lib/amap';
import { wgs84ToCartesian3 } from '../../lib/coord';
import { effectiveWaypoints } from '../simulation/SimulationLoop';

/**
 * 独立 Cesium scene 渲染无人机第一人称视角。
 *
 * - ArcGIS 卫星底图 + globe + skyBox + skyAtmosphere（drone 视角看真实地表）
 * - 订阅 simulation store 每帧 setView 到 drone 位置/朝向
 * - 取当前 waypoint 的 gimbal pitch 作为相机俯仰
 * - 锁相机：不接受用户拖拽/缩放，纯播放
 */
export function FpvViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const mission = useCurrentMission();
  const missionRef = useRef(mission);
  missionRef.current = mission;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const imagery = new Cesium.UrlTemplateImageryProvider(arcgisWorldImageryOptions());

    const viewer = new Cesium.Viewer(container, {
      timeline: false,
      animation: false,
      homeButton: false,
      geocoder: false,
      sceneModePicker: false,
      baseLayerPicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      requestRenderMode: false,
      baseLayer: new Cesium.ImageryLayer(imagery),
    });
    viewer.scene.globe.show = true;
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#0c0d10');
    if (viewer.scene.skyBox) viewer.scene.skyBox.show = true;
    if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = true;
    viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#0c0d10');
    // FPV 窗虽然小但用户最关心清晰度（近距离俯瞰），SSE 设更激进
    viewer.scene.globe.maximumScreenSpaceError = 1.0;
    viewer.scene.globe.preloadAncestors = true;
    // 完全锁定相机：FPV 只接受 store 驱动
    const ctrl = viewer.scene.screenSpaceCameraController;
    ctrl.enableRotate = false;
    ctrl.enableTranslate = false;
    ctrl.enableZoom = false;
    ctrl.enableTilt = false;
    ctrl.enableLook = false;
    // 隐藏 credit container
    const creditEl = viewer.cesiumWidget.creditContainer as HTMLElement;
    if (creditEl) creditEl.style.display = 'none';

    // FPV 视场角 75°（比默认 60° 稍宽，更像无人机相机）
    if (viewer.scene.camera.frustum instanceof Cesium.PerspectiveFrustum) {
      viewer.scene.camera.frustum.fov = Cesium.Math.toRadians(75);
    }

    viewerRef.current = viewer;
    if (import.meta.env.DEV) {
      (window as unknown as { __fpvViewer?: Cesium.Viewer }).__fpvViewer = viewer;
    }

    // overlay：mission 轨迹 + 已飞段 + mapping polygon（CallbackProperty 实时读 store）
    const ds = new Cesium.CustomDataSource('fpv-overlay');
    void viewer.dataSources.add(ds);

    const COLOR_PATH = Cesium.Color.fromCssColorString('#00d2c0').withAlpha(0.75);
    const COLOR_PATH_DONE = Cesium.Color.fromCssColorString('#00d2c0');
    const COLOR_POLY_OUTLINE = Cesium.Color.fromCssColorString('#ffd24a').withAlpha(0.9);

    // 完整 mission 路径（半透明 cyan）+ depthFailMaterial 让线穿过地形可见
    ds.entities.add({
      polyline: {
        positions: new Cesium.CallbackProperty(() => {
          const m = missionRef.current;
          if (!m) return [];
          return effectiveWaypoints(m).map((wp) =>
            wgs84ToCartesian3(wp.lon, wp.lat, wp.alt),
          );
        }, false),
        width: 5,
        material: COLOR_PATH,
        depthFailMaterial: COLOR_PATH,
        arcType: Cesium.ArcType.GEODESIC,
        clampToGround: false,
      },
    });

    // 已飞段（实色 cyan 加粗）
    ds.entities.add({
      polyline: {
        positions: new Cesium.CallbackProperty(() => {
          const s = useSimulationStore.getState();
          const m = missionRef.current;
          if (!m || !s.droneState) return [];
          const positions: Cesium.Cartesian3[] = [];
          const wps = effectiveWaypoints(m);
          for (let i = 0; i <= s.currentSegmentIndex; i++) {
            const wp = wps[i];
            if (wp) positions.push(wgs84ToCartesian3(wp.lon, wp.lat, wp.alt));
          }
          positions.push(
            wgs84ToCartesian3(s.droneState.lon, s.droneState.lat, s.droneState.alt),
          );
          return positions;
        }, false),
        width: 7,
        material: COLOR_PATH_DONE,
        depthFailMaterial: COLOR_PATH_DONE,
        arcType: Cesium.ArcType.GEODESIC,
        clampToGround: false,
      },
    });

    // 航点小标（青色点）—— disableDepthTestDistance 让相机背后也别出错；
    // 用 EntityCollection 同步：跟着 mission.waypoints / scanPath 增删
    // 简化做法：dataSource 起一组 ConstantPositionProperty entities，
    // 重建时间复杂度 O(n)，FPV 期待 mission 不会频繁加点
    const wpPointsCallbackId = setInterval(() => {
      const m = missionRef.current;
      const wps = m ? effectiveWaypoints(m) : [];
      const existing = ds.entities.values.filter(
        (e) => (e as unknown as { __fpvWp?: boolean }).__fpvWp,
      );
      if (existing.length === wps.length) return;
      for (const e of existing) ds.entities.remove(e);
      wps.forEach((wp) => {
        const e = ds.entities.add({
          position: wgs84ToCartesian3(wp.lon, wp.lat, wp.alt),
          point: {
            pixelSize: 8,
            color: Cesium.Color.fromCssColorString('#00d2c0'),
            outlineColor: Cesium.Color.fromCssColorString('#0c0d10'),
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
        (e as unknown as { __fpvWp: boolean }).__fpvWp = true;
      });
    }, 500);

    // mapping 多边形边界（fill + outline polyline）
    ds.entities.add({
      polygon: {
        hierarchy: new Cesium.CallbackProperty(() => {
          const m = missionRef.current;
          if (!m || m.type !== 'mapping' || !m.polygon || m.polygon.length < 3) {
            return new Cesium.PolygonHierarchy([]);
          }
          return new Cesium.PolygonHierarchy(
            m.polygon.map((v) => wgs84ToCartesian3(v.lon, v.lat, v.alt)),
          );
        }, false),
        material: Cesium.Color.fromCssColorString('#ffd24a').withAlpha(0.12),
        perPositionHeight: true,
      },
    });
    ds.entities.add({
      polyline: {
        positions: new Cesium.CallbackProperty(() => {
          const m = missionRef.current;
          if (!m || m.type !== 'mapping' || !m.polygon || m.polygon.length < 2) return [];
          const arr = m.polygon.map((v) => wgs84ToCartesian3(v.lon, v.lat, v.alt));
          if (m.polygon.length >= 3) arr.push(arr[0]); // 闭合
          return arr;
        }, false),
        width: 2,
        material: COLOR_POLY_OUTLINE,
        depthFailMaterial: COLOR_POLY_OUTLINE,
        arcType: Cesium.ArcType.GEODESIC,
        clampToGround: false,
      },
    });

    return () => {
      clearInterval(wpPointsCallbackId);
      viewer.destroy();
      viewerRef.current = null;
    };
  }, []);

  // 订阅 drone 位置 → setView
  useEffect(() => {
    const apply = (): void => {
      const v = viewerRef.current;
      if (!v) return;
      const state = useSimulationStore.getState();
      const d = state.droneState;
      if (!d) return;
      // 取当前段终点 waypoint 的云台俯仰（相机朝下/朝前），找不到就 -10°
      const m = missionRef.current;
      const segIdx = state.currentSegmentIndex;
      const wps = m ? effectiveWaypoints(m) : [];
      const toWp = wps[segIdx + 1] ?? wps[segIdx];
      const pitchDeg = toWp?.pitch ?? -10;
      v.camera.setView({
        destination: wgs84ToCartesian3(d.lon, d.lat, d.alt),
        orientation: {
          heading: Cesium.Math.toRadians(d.heading),
          pitch: Cesium.Math.toRadians(pitchDeg),
          roll: 0,
        },
      });
    };
    apply();
    const unsub = useSimulationStore.subscribe(apply);
    return unsub;
  }, []);

  return <div ref={containerRef} className="absolute inset-0" />;
}
