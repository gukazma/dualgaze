import * as Cesium from 'cesium';
import type { Waypoint } from './types';
import type { Dsm } from './dsm';
import type { SamplePoint } from './safetyShell';
import type { ShellSample } from './proxyMesh';

export interface ViewpointOptions {
  safetyDistance: number;
}

/**
 * 早期 MVP（Step 5-A~5-D）：每个有效 DSM 格子 = 1 视点。保留作调试对照。
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
 * Step 5-E~5-H 的泊松采样路径。保留作调试对照。
 */
export function generateViewpointsFromGridSamples(
  samples: SamplePoint[],
  dsm: Dsm,
): Waypoint[] {
  const result: Waypoint[] = [];
  for (const s of samples) {
    if (!Number.isFinite(s.positionEcef.x) || !Number.isFinite(s.normalEcef.x)) continue;

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

/**
 * Step 5-K 主路径：
 *   - 视点位置 = shellSample.positionEcef + offsetDistance × shellSample.normalEcef
 *   - 视点朝向 = -shellSample.normalEcef
 *   - HPR 用视点自己位置的局部 ENU 基底（墙面视点 pitch ≈ 0 水平）
 */
export function generateViewpoints(
  shellSamples: ShellSample[],
  offsetDistance: number,
): Waypoint[] {
  const result: Waypoint[] = [];
  for (const s of shellSamples) {
    if (!Number.isFinite(s.positionEcef.x) || !Number.isFinite(s.normalEcef.x)) continue;

    const offset = Cesium.Cartesian3.multiplyByScalar(
      s.normalEcef,
      offsetDistance,
      new Cesium.Cartesian3(),
    );
    const pos = Cesium.Cartesian3.add(s.positionEcef, offset, new Cesium.Cartesian3());

    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(pos);
    const c0 = Cesium.Matrix4.getColumn(enu, 0, new Cesium.Cartesian4());
    const c1 = Cesium.Matrix4.getColumn(enu, 1, new Cesium.Cartesian4());
    const c2 = Cesium.Matrix4.getColumn(enu, 2, new Cesium.Cartesian4());
    const east = Cesium.Cartesian3.normalize(
      new Cesium.Cartesian3(c0.x, c0.y, c0.z),
      new Cesium.Cartesian3(),
    );
    const north = Cesium.Cartesian3.normalize(
      new Cesium.Cartesian3(c1.x, c1.y, c1.z),
      new Cesium.Cartesian3(),
    );
    const up = Cesium.Cartesian3.normalize(
      new Cesium.Cartesian3(c2.x, c2.y, c2.z),
      new Cesium.Cartesian3(),
    );

    const dir = Cesium.Cartesian3.negate(s.normalEcef, new Cesium.Cartesian3());
    const de = Cesium.Cartesian3.dot(dir, east);
    const dn = Cesium.Cartesian3.dot(dir, north);
    const du = Cesium.Cartesian3.dot(dir, up);

    const heading = Math.atan2(de, dn);
    const pitch = Math.asin(Math.max(-1, Math.min(1, du)));
    const roll = 0;

    result.push({ position: pos, heading, pitch, roll });
  }
  return result;
}
