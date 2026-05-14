import { useEffect } from 'react';
import * as Cesium from 'cesium';
import { useCesiumViewer } from './CesiumContext';
import { useUiStore } from '../../store/ui';

const NADIR_PITCH = -Cesium.Math.PI_OVER_TWO;
const PITCH_TOLERANCE = 0.001; // ~0.06°，足够吸收浮点误差又能感知到拖拽 tilt

/**
 * 主场景视图模式同步：
 * - 2D：相机 flyTo pitch=-90°（保留当前 lon/lat/height），preRender 每帧钳 pitch；
 *   tilt/look 锁住、rotate 留着（3D scene 下 drag-pan 是绕 lookAt 点 orbit，
 *   靠 enableRotate 实现，关掉就完全不能拖了 —— Cesium 的 enableTranslate
 *   只在 2D/Columbus scene 起作用）。
 * - 3D：还原所有 ScreenSpaceCameraController 开关，pitch 不再钳。
 *
 * 切换时维持当前相机的 lon/lat，避免视角跳到别处。
 */
export function useMapViewSync(): void {
  const viewer = useCesiumViewer();
  const mapView = useUiStore((s) => s.mapView);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;
    const ctrl = viewer.scene.screenSpaceCameraController;

    if (mapView === '2d') {
      // 保留当前 lon/lat/height，相机俯瞰
      const carto = Cesium.Cartographic.fromCartesian(viewer.camera.position);
      const dest = Cesium.Cartesian3.fromRadians(
        carto.longitude,
        carto.latitude,
        carto.height,
      );
      viewer.camera.flyTo({
        destination: dest,
        orientation: {
          heading: 0,
          pitch: NADIR_PITCH,
          roll: 0,
        },
        duration: 0.6,
      });
      // rotate 保留：drag 时绕 nadir 目标点 orbit 表现为 pan
      // tilt / look 禁掉：用户不能改俯仰
      ctrl.enableRotate = true;
      ctrl.enableTilt = false;
      ctrl.enableLook = false;
      ctrl.enableTranslate = true;
      ctrl.enableZoom = true;

      // preRender 每帧把 pitch / roll 钳回 nadir，防止罕见路径上 pitch 漂移
      const clamp = (): void => {
        const cam = viewer.camera;
        if (
          Math.abs(cam.pitch - NADIR_PITCH) > PITCH_TOLERANCE ||
          Math.abs(cam.roll) > PITCH_TOLERANCE
        ) {
          const c = Cesium.Cartographic.fromCartesian(cam.position);
          cam.setView({
            destination: Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, c.height),
            orientation: { heading: cam.heading, pitch: NADIR_PITCH, roll: 0 },
          });
        }
      };
      const remove = viewer.scene.preRender.addEventListener(clamp);
      return () => remove();
    }

    // 3D：完全放开
    ctrl.enableRotate = true;
    ctrl.enableTilt = true;
    ctrl.enableLook = true;
    ctrl.enableTranslate = true;
    ctrl.enableZoom = true;
  }, [viewer, mapView]);
}
