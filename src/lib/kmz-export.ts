/**
 * Mission → DJI WPML 1.0.6 KMZ 导出。
 *
 * KMZ 结构：zip 包含 `wpmz/template.kml` + `wpmz/waylines.wpml` 两份 XML。
 * 参考 dji_way_line/src/utils/kmzGenerator.js（396 行原版）。
 *
 * 类型分支：
 *   - patrol：用 mission.waypoints 当 Placemark 列表
 *   - mapping：用 scanPath 当飞行航点 + 额外 Placemark 包 polygon boundary +
 *     自定义 <wpml:dualgazeScanParams> 持久化扫描参数
 *
 * Round-trip 兼容性：所有 MissionConfig 字段都能写入并被 kmz-import 还原。
 * `isClosedLoop` / `fov` 这两个 DJI 标准没有对应字段的，按默认值还原（lossy）。
 */
import JSZip from 'jszip';
import {
  DRONE_CATALOG,
  PAYLOAD_CATALOG,
  type MappingScanParams,
  type Mission,
  type PolygonVertex,
  type Waypoint,
  type WaypointAction,
} from '../types/mission';

/** 飞行航点列表：mapping 用 scanPath，facade 用所有 enabled face 拼接，patrol 用 waypoints */
function flightWaypoints(mission: Mission): Waypoint[] {
  if (mission.type === 'mapping') return mission.scanPath ?? [];
  if (mission.type === 'facade') {
    const out: Waypoint[] = [];
    let idx = 0;
    for (const f of mission.facadeFaces ?? []) {
      if (!f.enabled) continue;
      for (const wp of f.scanPath ?? []) out.push({ ...wp, index: idx++ });
    }
    return out;
  }
  return mission.waypoints;
}

const WPML_NS = 'http://www.dji.com/wpmz/1.0.6';
const KML_NS = 'http://www.opengis.net/kml/2.2';

export async function exportMissionToKmz(mission: Mission): Promise<Blob> {
  const zip = new JSZip();
  const wpmz = zip.folder('wpmz');
  if (!wpmz) throw new Error('JSZip folder failed');
  wpmz.file('template.kml', buildTemplateKml(mission));
  wpmz.file('waylines.wpml', buildWaylinesWpml(mission));
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.google-earth.kmz' });
}

// ===== template.kml =====

function buildTemplateKml(mission: Mission): string {
  const drone = DRONE_CATALOG.find((d) => d.id === mission.droneId);
  const payload = PAYLOAD_CATALOG.find((p) => p.id === mission.payloadId);
  const now = Date.now();
  const takeOffPointXml = buildTakeOffPointXml(mission);
  const wps = flightWaypoints(mission);
  const isMapping = mission.type === 'mapping';
  const polygonPlacemarkXml = isMapping
    ? buildPolygonPlacemarkXml(mission.polygon ?? [])
    : '';
  const scanParamsXml = isMapping
    ? buildScanParamsXml(mission.scanParams)
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="${KML_NS}" xmlns:wpml="${WPML_NS}">
  <Document>
    <wpml:author>DualGaze</wpml:author>
    <wpml:createTime>${now}</wpml:createTime>
    <wpml:updateTime>${now}</wpml:updateTime>
    <wpml:missionConfig>
      <wpml:flyToWaylineMode>${mission.flyToWaylineMode}</wpml:flyToWaylineMode>
      <wpml:finishAction>${mission.finishAction}</wpml:finishAction>
      <wpml:exitOnRCLost>${mission.exitOnRCLost}</wpml:exitOnRCLost>
      <wpml:executeRCLostAction>${mission.executeRCLostAction}</wpml:executeRCLostAction>
      <wpml:takeOffSecurityHeight>${mission.takeOffSecurityHeight}</wpml:takeOffSecurityHeight>
      <wpml:globalTransitionalSpeed>${mission.globalSpeed}</wpml:globalTransitionalSpeed>
      <wpml:droneInfo>
        <wpml:droneEnumValue>${drone?.droneEnumValue ?? 0}</wpml:droneEnumValue>
        <wpml:droneSubEnumValue>${drone?.droneSubEnumValue ?? 0}</wpml:droneSubEnumValue>
      </wpml:droneInfo>
      <wpml:waylineAvoidLimitAreaMode>0</wpml:waylineAvoidLimitAreaMode>
      <wpml:payloadInfo>
        <wpml:payloadEnumValue>${payload?.payloadEnumValue ?? 0}</wpml:payloadEnumValue>
        <wpml:payloadSubEnumValue>0</wpml:payloadSubEnumValue>
        <wpml:payloadPositionIndex>${payload?.payloadPositionIndex ?? 0}</wpml:payloadPositionIndex>
      </wpml:payloadInfo>
    </wpml:missionConfig>
    <Folder>
      <wpml:templateType>waypoint</wpml:templateType>
      <wpml:dualgazeMissionType>${mission.type}</wpml:dualgazeMissionType>
      <wpml:templateId>0</wpml:templateId>
      <wpml:waylineCoordinateSysParam>
        <wpml:coordinateMode>WGS84</wpml:coordinateMode>
        <wpml:heightMode>${mission.heightMode}</wpml:heightMode>
      </wpml:waylineCoordinateSysParam>
      <wpml:autoFlightSpeed>${mission.globalSpeed}</wpml:autoFlightSpeed>${takeOffPointXml}
      <wpml:globalWaypointTurnMode>toPointAndStopWithDiscontinuityCurvature</wpml:globalWaypointTurnMode>
      <wpml:globalUseStraightLine>1</wpml:globalUseStraightLine>
${polygonPlacemarkXml}${wps.map((wp, i) => buildTemplatePlacemark(wp, i)).join('\n')}
      <wpml:dualgazeIsClosedLoop>${mission.isClosedLoop ? 1 : 0}</wpml:dualgazeIsClosedLoop>
      <wpml:dualgazeGlobalAction>${mission.globalAction}</wpml:dualgazeGlobalAction>
${scanParamsXml}    </Folder>
  </Document>
</kml>`;
}

function buildTemplatePlacemark(wp: Waypoint, index: number): string {
  return `      <Placemark>
        <Point>
          <coordinates>${wp.lon.toFixed(7)},${wp.lat.toFixed(7)}</coordinates>
        </Point>
        <wpml:index>${index}</wpml:index>
        <wpml:executeHeight>${wp.alt}</wpml:executeHeight>
        <wpml:waypointSpeed>${wp.speed}</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>smoothTransition</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>${wp.heading}</wpml:waypointHeadingAngle>
          <wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>
        </wpml:waypointHeadingParam>
        <wpml:waypointGimbalHeadingParam>
          <wpml:waypointGimbalPitchAngle>${wp.pitch}</wpml:waypointGimbalPitchAngle>
          <wpml:waypointGimbalYawAngle>${wp.gimbalYaw ?? 0}</wpml:waypointGimbalYawAngle>
        </wpml:waypointGimbalHeadingParam>
        <wpml:dualgazeFov>${wp.fov}</wpml:dualgazeFov>
      </Placemark>`;
}

// ===== waylines.wpml =====

function buildWaylinesWpml(mission: Mission): string {
  const drone = DRONE_CATALOG.find((d) => d.id === mission.droneId);
  const payload = PAYLOAD_CATALOG.find((p) => p.id === mission.payloadId);
  const wps = flightWaypoints(mission);
  const distance = totalPathDistance(wps).toFixed(1);
  const duration = mission.globalSpeed > 0
    ? Math.round(parseFloat(distance) / mission.globalSpeed)
    : 0;
  const takeOffPointXml = buildTakeOffPointXml(mission);
  const isMapping = mission.type === 'mapping';
  const polygonPlacemarkXml = isMapping
    ? buildPolygonPlacemarkXml(mission.polygon ?? [])
    : '';
  const scanParamsXml = isMapping ? buildScanParamsXml(mission.scanParams) : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="${KML_NS}" xmlns:wpml="${WPML_NS}">
  <Document>
    <wpml:missionConfig>
      <wpml:flyToWaylineMode>${mission.flyToWaylineMode}</wpml:flyToWaylineMode>
      <wpml:finishAction>${mission.finishAction}</wpml:finishAction>
      <wpml:exitOnRCLost>${mission.exitOnRCLost}</wpml:exitOnRCLost>
      <wpml:executeRCLostAction>${mission.executeRCLostAction}</wpml:executeRCLostAction>
      <wpml:takeOffSecurityHeight>${mission.takeOffSecurityHeight}</wpml:takeOffSecurityHeight>
      <wpml:globalTransitionalSpeed>${mission.globalSpeed}</wpml:globalTransitionalSpeed>
      <wpml:droneInfo>
        <wpml:droneEnumValue>${drone?.droneEnumValue ?? 0}</wpml:droneEnumValue>
        <wpml:droneSubEnumValue>${drone?.droneSubEnumValue ?? 0}</wpml:droneSubEnumValue>
      </wpml:droneInfo>
      <wpml:waylineAvoidLimitAreaMode>0</wpml:waylineAvoidLimitAreaMode>
      <wpml:payloadInfo>
        <wpml:payloadEnumValue>${payload?.payloadEnumValue ?? 0}</wpml:payloadEnumValue>
        <wpml:payloadSubEnumValue>0</wpml:payloadSubEnumValue>
        <wpml:payloadPositionIndex>${payload?.payloadPositionIndex ?? 0}</wpml:payloadPositionIndex>
      </wpml:payloadInfo>
    </wpml:missionConfig>
    <Folder>
      <wpml:templateId>0</wpml:templateId>
      <wpml:waylineId>0</wpml:waylineId>
      <wpml:dualgazeMissionType>${mission.type}</wpml:dualgazeMissionType>
      <wpml:distance>${distance}</wpml:distance>
      <wpml:duration>${duration}</wpml:duration>
      <wpml:autoFlightSpeed>${mission.globalSpeed}</wpml:autoFlightSpeed>
      <wpml:executeHeightMode>${mission.heightMode}</wpml:executeHeightMode>${takeOffPointXml}
${isMapping ? buildStartActionGroupXml(mission.scanParams?.gimbalPitchAngle ?? -45) : ''}${polygonPlacemarkXml}${wps.map((wp, i, all) => buildWaylinePlacemark(wp, i, all.length, mission.globalAction, isMapping)).join('\n')}
      <wpml:dualgazeIsClosedLoop>${mission.isClosedLoop ? 1 : 0}</wpml:dualgazeIsClosedLoop>
      <wpml:dualgazeGlobalAction>${mission.globalAction}</wpml:dualgazeGlobalAction>
${scanParamsXml}    </Folder>
  </Document>
</kml>`;
}

function buildWaylinePlacemark(
  wp: Waypoint,
  index: number,
  total: number,
  globalAction: Mission['globalAction'],
  isMapping: boolean,
): string {
  const isEndpoint = index === 0 || index === total - 1;
  const turnMode = isEndpoint
    ? 'toPointAndStopWithContinuityCurvature'
    : 'coordinateTurn';
  const dampDist = isEndpoint ? '0' : '0.2';

  const actions: WaypointAction[] = [...wp.actions];
  if (globalAction !== 'none') {
    // 全局动作在每个航点 reachPoint 时触发一次
    actions.push({ id: `__global_${index}`, type: globalAction });
  }
  // mapping 模式：末点自动追加 stopRecord（startRecord 在 startActionGroup 里）
  if (isMapping && index === total - 1) {
    actions.push({ id: `__mapping_stop`, type: 'stopRecord' });
  }
  const actionGroupXml = actions.length > 0 ? buildActionGroupXml(index, actions) : '';

  return `      <Placemark>
        <Point>
          <coordinates>${wp.lon.toFixed(7)},${wp.lat.toFixed(7)}</coordinates>
        </Point>
        <wpml:index>${index}</wpml:index>
        <wpml:executeHeight>${wp.alt}</wpml:executeHeight>
        <wpml:waypointSpeed>${wp.speed}</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>smoothTransition</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>${wp.heading}</wpml:waypointHeadingAngle>
          <wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>${turnMode}</wpml:waypointTurnMode>
          <wpml:waypointTurnDampingDist>${dampDist}</wpml:waypointTurnDampingDist>
        </wpml:waypointTurnParam>
        <wpml:useStraightLine>1</wpml:useStraightLine>
        <wpml:waypointGimbalHeadingParam>
          <wpml:waypointGimbalPitchAngle>${wp.pitch}</wpml:waypointGimbalPitchAngle>
          <wpml:waypointGimbalYawAngle>${wp.gimbalYaw ?? 0}</wpml:waypointGimbalYawAngle>
        </wpml:waypointGimbalHeadingParam>
        <wpml:waypointWorkType>0</wpml:waypointWorkType>
        <wpml:isRisky>0</wpml:isRisky>
        <wpml:dualgazeFov>${wp.fov}</wpml:dualgazeFov>
${actionGroupXml}      </Placemark>`;
}

function buildActionGroupXml(wpIndex: number, actions: WaypointAction[]): string {
  const actionElements = actions
    .map((a, i) => buildActionXml(a, i))
    .filter((x) => x.length > 0)
    .join('\n');
  if (!actionElements) return '';
  return `        <wpml:actionGroup>
          <wpml:actionGroupId>${wpIndex}</wpml:actionGroupId>
          <wpml:actionGroupStartIndex>${wpIndex}</wpml:actionGroupStartIndex>
          <wpml:actionGroupEndIndex>${wpIndex}</wpml:actionGroupEndIndex>
          <wpml:actionGroupMode>sequence</wpml:actionGroupMode>
          <wpml:actionTrigger>
            <wpml:actionTriggerType>reachPoint</wpml:actionTriggerType>
          </wpml:actionTrigger>
${actionElements}
        </wpml:actionGroup>
`;
}

function buildActionXml(action: WaypointAction, id: number): string {
  switch (action.type) {
    case 'takePhoto':
    case 'startRecord':
    case 'stopRecord':
      return `          <wpml:action>
            <wpml:actionId>${id}</wpml:actionId>
            <wpml:actionActuatorFunc>${action.type}</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>`;
    case 'hover':
      return `          <wpml:action>
            <wpml:actionId>${id}</wpml:actionId>
            <wpml:actionActuatorFunc>hover</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:hoverTime>${action.hoverSeconds ?? 3}</wpml:hoverTime>
            </wpml:actionActuatorFuncParam>
          </wpml:action>`;
    default:
      return '';
  }
}

function buildTakeOffPointXml(mission: Mission): string {
  if (mission.heightMode === 'WGS84') return '';
  const wps = flightWaypoints(mission);
  if (wps.length === 0) return '';
  const first = wps[0];
  return `
      <wpml:takeOffPoint>
        <wpml:latitude>${first.lat.toFixed(7)}</wpml:latitude>
        <wpml:longitude>${first.lon.toFixed(7)}</wpml:longitude>
        <wpml:height>${first.alt}</wpml:height>
      </wpml:takeOffPoint>`;
}

// ===== mapping XML 片段 =====

/** mapping 多边形 boundary：包成一个无 index 的 Placemark+Polygon，DJI Pilot 2 当 hint */
function buildPolygonPlacemarkXml(polygon: PolygonVertex[]): string {
  if (polygon.length < 3) return '';
  const coords = polygon
    .map((v) => `${v.lon.toFixed(7)},${v.lat.toFixed(7)},${v.alt}`)
    .join(' ');
  return `      <Placemark>
        <Polygon>
          <outerBoundaryIs>
            <LinearRing>
              <coordinates>${coords}</coordinates>
            </LinearRing>
          </outerBoundaryIs>
        </Polygon>
      </Placemark>
`;
}

function buildScanParamsXml(params: MappingScanParams | undefined): string {
  if (!params) return '';
  return `      <wpml:dualgazeScanParams>
        <wpml:spacing>${params.spacing}</wpml:spacing>
        <wpml:direction>${params.direction}</wpml:direction>
        <wpml:margin>${params.margin}</wpml:margin>
        <wpml:gimbalPitchAngle>${params.gimbalPitchAngle}</wpml:gimbalPitchAngle>
        <wpml:overlapH>${params.overlapH}</wpml:overlapH>
        <wpml:overlapW>${params.overlapW}</wpml:overlapW>
      </wpml:dualgazeScanParams>
`;
}

/** mapping 起飞 actionGroup：gimbalRotate + startRecord（dji_way_line 模式） */
function buildStartActionGroupXml(gimbalPitch: number): string {
  return `      <wpml:startActionGroup>
        <wpml:action>
          <wpml:actionId>0</wpml:actionId>
          <wpml:actionActuatorFunc>gimbalRotate</wpml:actionActuatorFunc>
          <wpml:actionActuatorFuncParam>
            <wpml:gimbalPitchRotateEnable>1</wpml:gimbalPitchRotateEnable>
            <wpml:gimbalPitchRotateAngle>${gimbalPitch}</wpml:gimbalPitchRotateAngle>
          </wpml:actionActuatorFuncParam>
        </wpml:action>
        <wpml:action>
          <wpml:actionId>1</wpml:actionId>
          <wpml:actionActuatorFunc>startRecord</wpml:actionActuatorFunc>
          <wpml:actionActuatorFuncParam>
            <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
          </wpml:actionActuatorFuncParam>
        </wpml:action>
      </wpml:startActionGroup>
`;
}

// ===== helpers =====

const EARTH_R = 6378137;
function totalPathDistance(waypoints: Waypoint[]): number {
  let d = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const phi1 = (a.lat * Math.PI) / 180;
    const phi2 = (b.lat * Math.PI) / 180;
    const dPhi = ((b.lat - a.lat) * Math.PI) / 180;
    const dLam = ((b.lon - a.lon) * Math.PI) / 180;
    const s =
      Math.sin(dPhi / 2) ** 2 +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLam / 2) ** 2;
    d += EARTH_R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }
  return d;
}
