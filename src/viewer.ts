import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

// 关掉 Cesium ion 默认 token —— 不用 ion 资产
Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN ?? '';

export function createViewer(container: HTMLElement): Cesium.Viewer {
  const viewer = new Cesium.Viewer(container, {
    baseLayer: false,
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
  });

  // 纯点云场景：关掉地球 / 天空 / 大气，只剩 tileset 浮在暗色背景上
  viewer.scene.globe.show = false;
  viewer.scene.skyBox.show = false;
  viewer.scene.skyAtmosphere.show = false;
  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#0c0d10');

  // 让 pickPosition 能从深度缓冲拿坐标
  viewer.scene.pickTranslucentDepth = true;

  return viewer;
}
