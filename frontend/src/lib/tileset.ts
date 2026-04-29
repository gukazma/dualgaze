import { Cesium3DTileset, HeadingPitchRange, Math as CMath } from 'cesium';
import type { Viewer } from 'cesium';

export interface LoadedTileset {
  url: string;
  primitive: Cesium3DTileset;
}

export async function loadTileset(viewer: Viewer, url: string): Promise<LoadedTileset> {
  const primitive = await Cesium3DTileset.fromUrl(url);
  viewer.scene.primitives.add(primitive);
  // Use flyToBoundingSphere with an explicit HPR offset. `viewer.zoomTo(primitive)`
  // and the default `viewBoundingSphere` offset produce a direction vector that
  // is sometimes the zero vector and trip Cesium's normalize() with
  // "DeveloperError: normalized result is not a number".
  await new Promise<void>((resolve, reject) => {
    viewer.camera.flyToBoundingSphere(primitive.boundingSphere, {
      duration: 1.0,
      offset: new HeadingPitchRange(
        0,
        -CMath.PI_OVER_FOUR,
        Math.max(primitive.boundingSphere.radius * 4, 200),
      ),
      complete: () => resolve(),
      cancel: () => resolve(),
    });
    setTimeout(() => reject(new Error('flyTo timed out')), 5000);
  }).catch(() => {
    /* fly-to may be cancelled; tileset is still added */
  });
  return { url, primitive };
}

export function unloadTileset(viewer: Viewer, loaded: LoadedTileset): void {
  viewer.scene.primitives.remove(loaded.primitive);
}
