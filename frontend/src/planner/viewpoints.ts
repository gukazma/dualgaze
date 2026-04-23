import * as Cesium from 'cesium';
import type { Waypoint } from './types';
import type { Dsm } from './dsm';
import type { SamplePoint } from './safetyShell';

export interface ViewpointOptions {
  safetyDistance: number;
}

/**
 * MVP 版：每个有效 DSM 格子直接 = 1 视点。保留作调试对照，主路径已切到泊松。
 */
export function generateViewpointsDense(d: Dsm, opts: ViewpointOptions): Waypoint[] {
  const result: Waypoint[] = [];
  if (!d.normals) return result;
  const safety = opts.safetyDistance;

  for (let k = 0; k < d.heights.length; k++) {
    const hv = d.heights[k];
    const ne = d.normals[3 * k];
    const nn = d.normals[3 * k + 1];
    const nu = d.normals[3 * k + 2];
    if (
      !Number.isFinite(hv) ||
      !Number.isFinite(ne) ||
      !Number.isFinite(nn) ||
      !Number.isFinite(nu)
    ) continue;

    const carto = Cesium.Cartographic.clone(d.cartographics[k]);
    carto.height = hv;
    const surfacePos = Cesium.Cartographic.toCartesian(carto);

    const eastTerm = Cesium.Cartesian3.multiplyByScalar(d.east, ne, new Cesium.Cartesian3());
    const northTerm = Cesium.Cartesian3.multiplyByScalar(d.north, nn, new Cesium.Cartesian3());
    const upTerm = Cesium.Cartesian3.multiplyByScalar(d.up, nu, new Cesium.Cartesian3());
    const nWorld = Cesium.Cartesian3.add(eastTerm, northTerm, new Cesium.Cartesian3());
    Cesium.Cartesian3.add(nWorld, upTerm, nWorld);
    Cesium.Cartesian3.normalize(nWorld, nWorld);

    const offset = Cesium.Cartesian3.multiplyByScalar(nWorld, safety, new Cesium.Cartesian3());
    const position = Cesium.Cartesian3.add(surfacePos, offset, new Cesium.Cartesian3());

    const heading = Math.atan2(-ne, -nn);
    const pitch = Math.asin(-nu);
    const roll = 0;

    result.push({ position, heading, pitch, roll });
  }
  return result;
}

/**
 * 主路径：从泊松采样点（已在安全罩上）生成视点。
 * 位置 = samplePoint.positionEcef
 * 朝向 = -samplePoint.normalEcef
 */
export function generateViewpoints(samples: SamplePoint[], dsm: Dsm): Waypoint[] {
  const result: Waypoint[] = [];
  for (const s of samples) {
    if (!Number.isFinite(s.positionEcef.x) || !Number.isFinite(s.normalEcef.x)) continue;

    // ECEF 法线投影回 ENU 局部
    const ne = Cesium.Cartesian3.dot(s.normalEcef, dsm.east);
    const nn = Cesium.Cartesian3.dot(s.normalEcef, dsm.north);
    const nu = Cesium.Cartesian3.dot(s.normalEcef, dsm.up);

    const heading = Math.atan2(-ne, -nn);
    const pitch = Math.asin(Math.max(-1, Math.min(1, -nu)));
    const roll = 0;

    result.push({
      position: s.positionEcef,
      heading,
      pitch,
      roll,
    });
  }
  return result;
}
