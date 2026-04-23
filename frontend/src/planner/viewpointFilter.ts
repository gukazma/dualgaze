import * as Cesium from 'cesium';
import type { Dsm } from './dsm';
import type { ShellSample } from './proxyMesh';

export interface InterestMaskOptions {
  groundThreshold: number;
}

export interface FilterStats {
  total: number;
  kept: number;
  droppedTop: number;
  keptWall: number;
  keptTop: number;
}

export function filterByInterestMask(
  samples: ShellSample[],
  dsm: Dsm,
  opts: InterestMaskOptions,
): { kept: ShellSample[]; stats: FilterStats } {
  const groundCut = dsm.minH + opts.groundThreshold;
  const kept: ShellSample[] = [];
  let keptWall = 0;
  let keptTop = 0;
  let droppedTop = 0;

  for (const sample of samples) {
    if (sample.isWall) {
      kept.push(sample);
      keptWall++;
      continue;
    }
    const carto = Cesium.Cartographic.fromCartesian(sample.positionEcef);
    if (carto && carto.height > groundCut) {
      kept.push(sample);
      keptTop++;
    } else {
      droppedTop++;
    }
  }

  return {
    kept,
    stats: {
      total: samples.length,
      kept: kept.length,
      droppedTop,
      keptWall,
      keptTop,
    },
  };
}
