import * as Cesium from 'cesium';
import type { HullBox } from './types';

export function extractCoarseHull(
  tileset: Cesium.Cesium3DTileset,
  maxLevel: number
): HullBox[] {
  const boxes: HullBox[] = [];
  const root = tileset.root;
  if (!root) return boxes;

  const queue: Array<{ tile: Cesium.Cesium3DTile; level: number }> = [
    { tile: root, level: 0 },
  ];

  while (queue.length > 0) {
    const { tile, level } = queue.shift()!;
    const reachedLeaf = !tile.children || tile.children.length === 0;
    if (level >= maxLevel || reachedLeaf) {
      const box = toBox(tile);
      if (box) boxes.push(box);
      continue;
    }
    for (const c of tile.children) {
      queue.push({ tile: c, level: level + 1 });
    }
  }
  return boxes;
}

function toBox(tile: Cesium.Cesium3DTile): HullBox | undefined {
  const bv: any = (tile as any).contentBoundingVolume ?? (tile as any).boundingVolume;
  const obb =
    bv?._orientedBoundingBox ??
    bv?.boundingVolume?._orientedBoundingBox ??
    bv?.boundingVolume;
  if (obb && obb.center && obb.halfAxes) {
    return {
      center: Cesium.Cartesian3.clone(obb.center),
      halfAxes: Cesium.Matrix3.clone(obb.halfAxes),
    };
  }
  const sphere = tile.boundingSphere;
  if (!sphere) return undefined;
  const r = sphere.radius;
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(sphere.center);
  const enuRot = Cesium.Matrix4.getMatrix3(enu, new Cesium.Matrix3());
  const halfAxes = Cesium.Matrix3.multiplyByScalar(enuRot, r, new Cesium.Matrix3());
  return {
    center: Cesium.Cartesian3.clone(sphere.center),
    halfAxes,
  };
}

export function offsetHull(hull: HullBox[], safety: number): HullBox[] {
  return hull.map((box) => {
    const newAxes = Cesium.Matrix3.clone(box.halfAxes);
    for (let col = 0; col < 3; col++) {
      const axis = Cesium.Matrix3.getColumn(newAxes, col, new Cesium.Cartesian3());
      const len = Cesium.Cartesian3.magnitude(axis);
      if (len < 1e-6) continue;
      const scaled = Cesium.Cartesian3.multiplyByScalar(
        axis,
        (len + safety) / len,
        new Cesium.Cartesian3()
      );
      Cesium.Matrix3.setColumn(newAxes, col, scaled, newAxes);
    }
    return {
      center: Cesium.Cartesian3.clone(box.center),
      halfAxes: newAxes,
    };
  });
}
