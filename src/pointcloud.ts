import * as Cesium from 'cesium';

export interface LoadPointCloudOptions {
  pointSize?: number;
  maximumScreenSpaceError?: number;
}

export async function loadPointCloud(
  viewer: Cesium.Viewer,
  url: string,
  opts: LoadPointCloudOptions = {},
): Promise<Cesium.Cesium3DTileset> {
  const tileset = await Cesium.Cesium3DTileset.fromUrl(url, {
    maximumScreenSpaceError: opts.maximumScreenSpaceError ?? 4,
  });
  viewer.scene.primitives.add(tileset);

  // 把点画大一点，吸附更容易命中
  tileset.style = new Cesium.Cesium3DTileStyle({
    pointSize: String(opts.pointSize ?? 8),
  });

  await viewer.zoomTo(tileset);
  return tileset;
}
