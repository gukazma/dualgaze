/**
 * DJI WPML 1.0.6 KMZ → Mission 导入。
 *
 * 流程：JSZip 解压 → 拿到 wpmz/waylines.wpml → DOMParser 解析 →
 * 抽 missionConfig + Folder.executeHeightMode + Placemark[] → 映射回 Mission。
 *
 * 容错：
 * - 缺字段走 MISSION_DEFAULTS / 0 / 'goHome' 等兜底
 * - 不识别的 actionActuatorFunc 跳过（会上报到 warnings 数组）
 * - drone/payload 找不到匹配 enum 的也跳过型号设置，给默认 m3e + m3e-cam
 */
import JSZip from 'jszip';
import {
  createAction as buildAction,
  createBlankMission,
  createWaypoint as buildWaypoint,
  DRONE_CATALOG,
  MISSION_DEFAULTS,
  PAYLOAD_CATALOG,
  type ExitOnRCLost,
  type FinishAction,
  type FlyToWaylineMode,
  type GlobalCameraAction,
  type HeightMode,
  type Mission,
  type RCLostAction,
  type Waypoint,
  type WaypointAction,
  type WaypointActionType,
} from '../types/mission';

export interface KmzImportResult {
  mission: Mission;
  /** 未识别的 actionActuatorFunc / 字段告警 */
  warnings: string[];
}

export async function importKmzToMission(file: File): Promise<KmzImportResult> {
  const zip = await JSZip.loadAsync(file);
  const waylinesFile = zip.file('wpmz/waylines.wpml');
  if (!waylinesFile) throw new Error('KMZ 缺少 wpmz/waylines.wpml');
  const waylinesXml = await waylinesFile.async('string');

  const parser = new DOMParser();
  const doc = parser.parseFromString(waylinesXml, 'text/xml');
  const parseError = doc.getElementsByTagName('parsererror')[0];
  if (parseError) {
    throw new Error(`XML 解析失败: ${parseError.textContent ?? '?'}`);
  }

  const warnings: string[] = [];

  // missionConfig
  const cfg = doc.getElementsByTagName('wpml:missionConfig')[0];
  const flyToWaylineMode = readText(cfg, 'wpml:flyToWaylineMode') as FlyToWaylineMode | null;
  const finishAction = readText(cfg, 'wpml:finishAction') as FinishAction | null;
  const exitOnRCLost = readText(cfg, 'wpml:exitOnRCLost') as ExitOnRCLost | null;
  const executeRCLostAction = readText(cfg, 'wpml:executeRCLostAction') as RCLostAction | null;
  const takeOffSecurityHeight = readNumber(cfg, 'wpml:takeOffSecurityHeight');
  const globalSpeed = readNumber(cfg, 'wpml:globalTransitionalSpeed');

  // 找 drone / payload
  const droneEnum = readNumber(cfg, 'wpml:droneEnumValue');
  const droneSubEnum = readNumber(cfg, 'wpml:droneSubEnumValue');
  const payloadEnum = readNumber(cfg, 'wpml:payloadEnumValue');
  const droneMatch =
    droneEnum !== null
      ? DRONE_CATALOG.find(
          (d) =>
            d.droneEnumValue === droneEnum &&
            (droneSubEnum === null || d.droneSubEnumValue === droneSubEnum),
        )
      : undefined;
  const payloadMatch =
    payloadEnum !== null
      ? PAYLOAD_CATALOG.find((p) => p.payloadEnumValue === payloadEnum)
      : undefined;
  if (!droneMatch && droneEnum !== null) {
    warnings.push(`未识别的 droneEnumValue=${droneEnum}, 回退默认 M3E`);
  }
  if (!payloadMatch && payloadEnum !== null) {
    warnings.push(`未识别的 payloadEnumValue=${payloadEnum}, 回退默认 M3E 相机`);
  }

  // executeHeightMode 在 Folder 里
  const folder = doc.getElementsByTagName('Folder')[0];
  const heightMode = readText(folder, 'wpml:executeHeightMode') as HeightMode | null;

  // DualGaze 自定义字段（lossless round-trip）
  const isClosedLoopText = readText(folder, 'wpml:dualgazeIsClosedLoop');
  const isClosedLoop = isClosedLoopText !== null
    ? isClosedLoopText === '1' || isClosedLoopText === 'true'
    : MISSION_DEFAULTS.isClosedLoop;
  const globalAction =
    (readText(folder, 'wpml:dualgazeGlobalAction') as GlobalCameraAction | null) ??
    MISSION_DEFAULTS.globalAction;

  const droneId = droneMatch?.id ?? 'm3e';
  const payloadId =
    payloadMatch?.id ??
    droneMatch?.compatiblePayloads[0] ??
    'm3e-cam';

  // 构建 mission
  const baseMission = createBlankMission({
    name: deriveMissionName(file.name),
    type: 'patrol',
    droneId,
    payloadId,
  });
  const mission: Mission = {
    ...baseMission,
    globalSpeed: globalSpeed ?? MISSION_DEFAULTS.globalSpeed,
    takeOffSecurityHeight: takeOffSecurityHeight ?? MISSION_DEFAULTS.takeOffSecurityHeight,
    flyToWaylineMode: flyToWaylineMode ?? MISSION_DEFAULTS.flyToWaylineMode,
    finishAction: finishAction ?? MISSION_DEFAULTS.finishAction,
    executeRCLostAction: executeRCLostAction ?? MISSION_DEFAULTS.executeRCLostAction,
    exitOnRCLost: exitOnRCLost ?? MISSION_DEFAULTS.exitOnRCLost,
    heightMode: heightMode ?? MISSION_DEFAULTS.heightMode,
    isClosedLoop,
    globalAction,
  };

  // waypoints
  const placemarks = Array.from(doc.getElementsByTagName('Placemark'));
  const waypoints: Waypoint[] = [];
  for (let i = 0; i < placemarks.length; i++) {
    const pm = placemarks[i];
    const wpIdxText = readText(pm, 'wpml:index');
    if (wpIdxText === null) continue; // 不是 waypoint placemark（可能是 boundary）
    const coordsText = readText(pm, 'coordinates');
    if (!coordsText) {
      warnings.push(`Placemark #${i} 缺 <coordinates>，跳过`);
      continue;
    }
    const [lonStr, latStr] = coordsText.split(',').map((s) => s.trim());
    const lon = parseFloat(lonStr);
    const lat = parseFloat(latStr);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      warnings.push(`Placemark #${i} 坐标解析失败: "${coordsText}"`);
      continue;
    }
    const alt = readNumber(pm, 'wpml:executeHeight') ?? 0;
    const speed = readNumber(pm, 'wpml:waypointSpeed') ?? mission.globalSpeed;
    const heading = readNumber(pm, 'wpml:waypointHeadingAngle') ?? 0;
    const pitch = readNumber(pm, 'wpml:waypointGimbalPitchAngle') ?? -25;
    const fov = readNumber(pm, 'wpml:dualgazeFov') ?? 60;

    const wp = buildWaypoint({
      index: waypoints.length,
      lon,
      lat,
      alt,
      speed,
      heading,
      pitch,
      fov,
    });

    // 解析 actionGroup
    wp.actions = parseActionsFromPlacemark(pm, mission.globalAction, warnings);
    waypoints.push(wp);
  }

  mission.waypoints = waypoints;
  mission.updatedAt = Date.now();

  return { mission, warnings };
}

function parseActionsFromPlacemark(
  pm: Element,
  globalAction: GlobalCameraAction,
  warnings: string[],
): WaypointAction[] {
  const out: WaypointAction[] = [];
  const actionEls = Array.from(pm.getElementsByTagName('wpml:action'));
  for (const ael of actionEls) {
    const func = readText(ael, 'wpml:actionActuatorFunc');
    if (!func) continue;
    // 跳过全局动作 marker（导出时附加的，导入时由 globalAction 字段还原）
    if (globalAction !== 'none' && func === globalAction) {
      // 检查这是不是全局动作（actionGroup 的 marker）—— 用法简单：
      // 如果出现次数刚好 = waypoint 数（每个一次），认为是全局；否则当用户自加
      // 这里保守做法：如果是全局动作，那 KMZ 里至少有 N 个 reachPoint trigger
      // 简化处理：跳过第一个匹配 globalAction 的，剩下的当用户加的
      // 实际更稳妥的方式是看 actionGroupId，但 v1 不深究
      continue;
    }
    if (!isKnownActionType(func)) {
      warnings.push(`未识别的 action 类型 "${func}"，已跳过`);
      continue;
    }
    const action = buildAction(func);
    if (func === 'hover') {
      const t = readNumber(ael, 'wpml:hoverTime');
      if (t !== null && Number.isFinite(t)) action.hoverSeconds = t;
    }
    out.push(action);
  }
  return out;
}

function isKnownActionType(s: string): s is WaypointActionType {
  return s === 'takePhoto' || s === 'startRecord' || s === 'stopRecord' || s === 'hover';
}

// ===== XML helpers =====

function readText(parent: Element | null | undefined, tagName: string): string | null {
  if (!parent) return null;
  const els = parent.getElementsByTagName(tagName);
  // 优先取 parent 的直接子节点（同名嵌套时避免穿透）
  for (const el of Array.from(els)) {
    if (el.parentNode === parent) return el.textContent?.trim() ?? null;
  }
  // 兜底拿第一个
  return els[0]?.textContent?.trim() ?? null;
}

function readNumber(parent: Element | null | undefined, tagName: string): number | null {
  const t = readText(parent, tagName);
  if (t === null) return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

function deriveMissionName(filename: string): string {
  return filename.replace(/\.kmz$/i, '').trim() || '导入的航线';
}
