import { useEffect } from 'react';
import * as Cesium from 'cesium';
import { useCesiumViewer } from './CesiumContext';
import { useUiStore } from '../../store/ui';

/**
 * 主场景视图模式同步：
 * - 2D：相机 flyTo pitch=-90°（保持当前 lon/lat/height），禁 rotate/tilt/look。
 *   pickFromRay 直射下方，加航点不再因透视错位。
 * - 3D：还原所有 ScreenSpaceCameraController 开关，允许自由旋转倾斜。
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
          pitch: -Cesium.Math.PI_OVER_TWO,
          roll: 0,
        },
        duration: 0.6,
      });
      // 锁旋转 / 倾斜 / look，保留 pan + zoom
      ctrl.enableRotate = false;
      ctrl.enableTilt = false;
      ctrl.enableLook = false;
      ctrl.enableTranslate = true;
      ctrl.enableZoom = true;
    } else {
      // 3D：完全放开
      ctrl.enableRotate = true;
      ctrl.enableTilt = true;
      ctrl.enableLook = true;
      ctrl.enableTranslate = true;
      ctrl.enableZoom = true;
    }
  }, [viewer, mapView]);
}
