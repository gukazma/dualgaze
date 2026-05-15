import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { arcgisWorldImageryOptions } from './lib/amap';

// 关掉 Cesium ion 默认 token —— 不用 ion 资产
Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN ?? '';

export function createViewer(container: HTMLElement): Cesium.Viewer {
  // ArcGIS World Imagery：免 token、WGS84 原生、全球 z=19 真卫星
  // （AMap 公开端点 z=18 封顶 + 境外不覆盖 → 不适合 demo）
  const imagery = new Cesium.UrlTemplateImageryProvider(arcgisWorldImageryOptions());

  const viewer = new Cesium.Viewer(container, {
    baseLayer: new Cesium.ImageryLayer(imagery),
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

  // 底图清晰度提升：default globe SSE 是 2.0，降到 1.0 让贴图更早切到高 LOD
  viewer.scene.globe.maximumScreenSpaceError = 1.0;
  // 预载父/兄瓦片，切换 LOD 时减少模糊
  viewer.scene.globe.preloadAncestors = true;
  viewer.scene.globe.preloadSiblings = true;
  // FXAA 抗锯齿
  viewer.scene.postProcessStages.fxaa.enabled = true;

  // 让 pickPosition 能从深度缓冲拿坐标（点云 picker 用）
  viewer.scene.pickTranslucentDepth = true;

  return viewer;
}
