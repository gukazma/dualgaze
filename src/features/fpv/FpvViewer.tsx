import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { useSimulationStore } from '../../store/simulation';
import { useCurrentMission } from '../../store/missions';
import { loadTileset } from '../../lib/tileset';
import { wgs84ToCartesian3 } from '../../lib/coord';

/**
 * 独立 Cesium scene 渲染无人机第一人称视角。
 *
 * - 关闭 globe / imagery / atmosphere（FPV 只看 tileset 街景，省 GPU）
 * - SSE 32（远低于主 viewer 的 4），允许低 LOD 渲染
 * - 订阅 simulation store 每帧 setView 到 drone 位置/朝向
 * - 取当前 waypoint 的 gimbal pitch 作为相机俯仰
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
      baseLayer: false as unknown as Cesium.ImageryLayer,
      skyBox: false,
      skyAtmosphere: false,
    });
    viewer.scene.globe.show = false;
    viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#05080f');
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

    loadTileset(viewer, { maximumScreenSpaceError: 32, pointSize: 4 }).catch((err) => {
      console.error('[FpvViewer] tileset load failed', err);
    });

    return () => {
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
      const toWp = m?.waypoints[segIdx + 1] ?? m?.waypoints[segIdx];
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
