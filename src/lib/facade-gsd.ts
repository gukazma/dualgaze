import type { PayloadModel } from '../types/mission';

/**
 * 摄影测量标准公式：
 *
 *   GSD (m/pixel) = standoff (m) × sensorWidth (mm) / focal (mm) / imageWidthPx
 *
 * 反推：
 *   standoff = GSD × focal × imageWidthPx / sensorWidth
 *
 * Footprint：
 *   footprintWidth  = standoff × sensorWidth  / focal = GSD × imageWidthPx
 *   footprintHeight = standoff × sensorHeight / focal = GSD × imageHeightPx
 *
 * 间距（DPGO / DJI Terra 标准）：
 *   spacing_along = footprintHeight × (1 - overlapFront)   ← 沿航线方向
 *   spacing_side  = footprintWidth  × (1 - overlapSide)    ← 航线之间
 *
 * 注：对 facade 来说 along = 垂直方向（向上沿墙）, side = 水平方向（沿墙走）。
 * 我们 FacadeScanParams.spacingH 对应 side, spacingV 对应 along。
 */

/** smart 模式参数 → 标准参数。需要 payload 有 sensor/focal 字段；不全则返回 null。 */
export function deriveFromGSD(input: {
  gsdMm: number;
  overlapFront: number;
  overlapSide: number;
  payload: Pick<PayloadModel, 'sensorWidthMm' | 'sensorHeightMm' | 'focalLengthMm' | 'imageWidthPx' | 'imageHeightPx'>;
}): { standoff: number; spacingH: number; spacingV: number; footprintWidth: number; footprintHeight: number } | null {
  const { gsdMm, overlapFront, overlapSide, payload } = input;
  const { sensorWidthMm, sensorHeightMm, focalLengthMm, imageWidthPx, imageHeightPx } = payload;
  if (
    sensorWidthMm == null ||
    sensorHeightMm == null ||
    focalLengthMm == null ||
    imageWidthPx == null ||
    imageHeightPx == null
  ) {
    return null;
  }
  const gsdM = gsdMm / 1000;
  // standoff = GSD × focal × imageWidthPx / sensorWidth
  const standoff = (gsdM * focalLengthMm * imageWidthPx) / sensorWidthMm;
  // footprint = GSD × imagePx
  const footprintWidth = gsdM * imageWidthPx;
  const footprintHeight = gsdM * imageHeightPx;
  // spacing
  const spacingH = Math.max(0.1, footprintWidth * (1 - overlapSide));
  const spacingV = Math.max(0.1, footprintHeight * (1 - overlapFront));
  return { standoff, spacingH, spacingV, footprintWidth, footprintHeight };
}

/** 反向：给定 standoff 求 GSD（用于 manual 模式想看 GSD 时） */
export function gsdFromStandoff(
  standoff: number,
  payload: Pick<PayloadModel, 'sensorWidthMm' | 'focalLengthMm' | 'imageWidthPx'>,
): number | null {
  const { sensorWidthMm, focalLengthMm, imageWidthPx } = payload;
  if (sensorWidthMm == null || focalLengthMm == null || imageWidthPx == null) return null;
  // GSD = standoff × sensorWidth / (focal × imageWidthPx) （米/像素）
  return (standoff * sensorWidthMm) / (focalLengthMm * imageWidthPx);
}
