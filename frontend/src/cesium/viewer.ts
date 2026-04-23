import * as Cesium from 'cesium';

export function createViewer(container: HTMLElement): Cesium.Viewer {
  Cesium.Ion.defaultAccessToken = '';
  const viewer = new Cesium.Viewer(container, {
    baseLayer: false,
    terrainProvider: new Cesium.EllipsoidTerrainProvider(),
    animation: false,
    timeline: false,
    baseLayerPicker: false,
    geocoder: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    homeButton: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
  });
  viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#1a1a1a');
  if (viewer.scene.skyAtmosphere) {
    viewer.scene.skyAtmosphere.show = false;
  }
  (viewer.scene as any).backgroundColor = Cesium.Color.fromCssColorString('#0b0b0f');
  return viewer;
}

export async function loadTileset(
  viewer: Cesium.Viewer,
  url: string
): Promise<Cesium.Cesium3DTileset> {
  const tileset = await Cesium.Cesium3DTileset.fromUrl(url, {
    maximumScreenSpaceError: 32,
  });
  viewer.scene.primitives.add(tileset);
  await viewer.zoomTo(tileset);
  return tileset;
}
