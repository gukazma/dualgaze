import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { amapSatelliteImageryOptions } from './lib/amap';

// 关掉 Cesium ion 默认 token —— 不用 ion 资产
Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN ?? '';

export function createViewer(container: HTMLElement): Cesium.Viewer {
  // M1：以高德卫星瓦片为 baseLayer
  const amap = new Cesium.UrlTemplateImageryProvider(amapSatelliteImageryOptions());

  const viewer = new Cesium.Viewer(container, {
    baseLayer: new Cesium.ImageryLayer(amap),
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

  // M1：globe / skyBox / skyAtmosphere 全打开（之前为纯点云视图关掉了）
  viewer.scene.globe.show = true;
  viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#0c0d10');
  if (viewer.scene.skyBox) viewer.scene.skyBox.show = true;
  if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = true;
  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#0c0d10');

  // 让 pickPosition 能从深度缓冲拿坐标（点云 picker 用）
  viewer.scene.pickTranslucentDepth = true;

  return viewer;
}
