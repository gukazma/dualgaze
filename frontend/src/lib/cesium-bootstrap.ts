import {
  Cartesian3,
  Ion,
  OpenStreetMapImageryProvider,
  Viewer,
} from 'cesium';

Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN ?? '';

const OSM_URL = 'https://tile.openstreetmap.org/';

export function createViewer(container: HTMLElement): Viewer {
  const viewer = new Viewer(container, {
    baseLayer: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    timeline: false,
    animation: false,
    fullscreenButton: false,
    selectionIndicator: false,
    infoBox: false,
  });

  viewer.imageryLayers.addImageryProvider(
    new OpenStreetMapImageryProvider({ url: OSM_URL }),
  );

  const creditContainer = viewer.cesiumWidget.creditContainer as HTMLElement;
  creditContainer.style.display = 'none';

  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(116.397, 39.91, 8000),
    duration: 0,
  });

  return viewer;
}
