/**
 * Mission / Waypoint 数据模型。
 *
 * 所有坐标全程以 **WGS84** 存储；只有渲染到 AMap 时才走 wgs84ToGcj02 修正。
 * 这样 KMZ 导出 / DJI Pilot 2 / FlightHub 2 看到的坐标都是 GPS 标准。
 */

export type MissionType = 'patrol' | 'mapping' | 'strip' | 'facade';

/** v1 仅 'patrol' 可编辑；其它 3 个在 CreateMissionModal 上展示为 disabled */
export const ENABLED_MISSION_TYPES: ReadonlySet<MissionType> = new Set(['patrol']);

export interface MissionTypeMeta {
  id: MissionType;
  label: string;
  description: string;
  iconName: string; // lucide icon name
  disabled: boolean;
}

export const MISSION_TYPE_CATALOG: ReadonlyArray<MissionTypeMeta> = [
  {
    id: 'patrol',
    label: '巡逻航线',
    description: '逐点添加 · 模拟飞行 · 视锥可视',
    iconName: 'route',
    disabled: false,
  },
  {
    id: 'mapping',
    label: '面状航线',
    description: '多边形 → S 型扫描',
    iconName: 'grid-3x3',
    disabled: true,
  },
  {
    id: 'strip',
    label: '带状航线',
    description: '线状目标巡检',
    iconName: 'spline',
    disabled: true,
  },
  {
    id: 'facade',
    label: '贴近摄影航线',
    description: '点云驱动 · 法线采样',
    iconName: 'scan-eye',
    disabled: true,
  },
];

// ---------- Drone / Payload ----------

export interface DroneModel {
  id: string;
  label: string;
  /** DJI WPML droneEnumValue */
  droneEnumValue: number;
  droneSubEnumValue: number;
  /** 兼容的 payload id 白名单 */
  compatiblePayloads: string[];
}

export interface PayloadModel {
  id: string;
  label: string;
  /** DJI WPML payloadEnumValue */
  payloadEnumValue: number;
  payloadPositionIndex: number;
}

/** v1 内置型号；后续可扩到 ThirdParty / 配置 */
export const DRONE_CATALOG: ReadonlyArray<DroneModel> = [
  { id: 'm3e', label: 'DJI Matrice 3E', droneEnumValue: 77, droneSubEnumValue: 0, compatiblePayloads: ['m3e-cam'] },
  { id: 'm3t', label: 'DJI Matrice 3T', droneEnumValue: 77, droneSubEnumValue: 1, compatiblePayloads: ['m3t-cam'] },
  { id: 'm3m', label: 'DJI Matrice 3M', droneEnumValue: 77, droneSubEnumValue: 2, compatiblePayloads: ['m3m-cam'] },
  { id: 'm30', label: 'DJI Matrice 30', droneEnumValue: 67, droneSubEnumValue: 0, compatiblePayloads: ['m30-cam'] },
  { id: 'm30t', label: 'DJI Matrice 30T', droneEnumValue: 67, droneSubEnumValue: 1, compatiblePayloads: ['m30t-cam'] },
  { id: 'm300', label: 'DJI Matrice 300 RTK', droneEnumValue: 60, droneSubEnumValue: 0, compatiblePayloads: ['h20', 'h20t', 'h20n', 'p1', 'l1'] },
  { id: 'm350', label: 'DJI Matrice 350 RTK', droneEnumValue: 89, droneSubEnumValue: 0, compatiblePayloads: ['h20', 'h20t', 'h20n', 'p1', 'l1', 'l2'] },
];

export const PAYLOAD_CATALOG: ReadonlyArray<PayloadModel> = [
  { id: 'm3e-cam', label: 'M3E 主云台相机', payloadEnumValue: 80, payloadPositionIndex: 0 },
  { id: 'm3t-cam', label: 'M3T 主云台相机', payloadEnumValue: 81, payloadPositionIndex: 0 },
  { id: 'm3m-cam', label: 'M3M 多光谱相机', payloadEnumValue: 80, payloadPositionIndex: 0 },
  { id: 'm30-cam', label: 'M30 主云台相机', payloadEnumValue: 52, payloadPositionIndex: 0 },
  { id: 'm30t-cam', label: 'M30T 主云台 (红外)', payloadEnumValue: 53, payloadPositionIndex: 0 },
  { id: 'h20', label: 'H20 (RGB)', payloadEnumValue: 42, payloadPositionIndex: 0 },
  { id: 'h20t', label: 'H20T (RGB+红外)', payloadEnumValue: 43, payloadPositionIndex: 0 },
  { id: 'h20n', label: 'H20N (夜视)', payloadEnumValue: 61, payloadPositionIndex: 0 },
  { id: 'p1', label: 'P1 测绘相机', payloadEnumValue: 50, payloadPositionIndex: 0 },
  { id: 'l1', label: 'L1 激光雷达', payloadEnumValue: 41, payloadPositionIndex: 0 },
  { id: 'l2', label: 'L2 激光雷达', payloadEnumValue: 90, payloadPositionIndex: 0 },
];

// ---------- Waypoint / Mission ----------

export interface Waypoint {
  id: string;
  index: number;
  /** WGS84 经度 */
  lon: number;
  /** WGS84 纬度 */
  lat: number;
  /** 高度 (m, 椭球面或相对起飞点；由 mission heightMode 决定语义) */
  alt: number;
  /** 飞行速度 m/s（不填用 mission.globalSpeed） */
  speed: number;
  /** 朝向 ° (0=正北，顺时针) */
  heading: number;
  /** 云台俯仰 ° (-90=朝下，0=朝前，30=朝上) */
  pitch: number;
  /** 水平视场角 ° (默认 60) */
  fov: number;
}

export type HeightMode = 'WGS84' | 'relativeToStartPoint' | 'realTimeFollowSurface';

export interface Mission {
  id: string;
  name: string;
  type: MissionType;
  droneId: string;
  payloadId: string;
  waypoints: Waypoint[];
  /** 全局飞行速度 m/s */
  globalSpeed: number;
  /** 全局高度 m */
  globalHeight: number;
  /** 高度模式 */
  heightMode: HeightMode;
  createdAt: number;
  updatedAt: number;
}

// ---------- Factory ----------

let _waypointSeq = 0;
const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${(++_waypointSeq).toString(36)}`;

export function createBlankMission(init: {
  name: string;
  type: MissionType;
  droneId: string;
  payloadId: string;
}): Mission {
  const now = Date.now();
  return {
    id: newId('m'),
    name: init.name,
    type: init.type,
    droneId: init.droneId,
    payloadId: init.payloadId,
    waypoints: [],
    globalSpeed: 5,
    globalHeight: 60,
    heightMode: 'relativeToStartPoint',
    createdAt: now,
    updatedAt: now,
  };
}

export function createWaypoint(init: {
  lon: number;
  lat: number;
  alt: number;
  index: number;
  speed?: number;
  heading?: number;
  pitch?: number;
  fov?: number;
}): Waypoint {
  return {
    id: newId('wp'),
    index: init.index,
    lon: init.lon,
    lat: init.lat,
    alt: init.alt,
    speed: init.speed ?? 5,
    heading: init.heading ?? 0,
    pitch: init.pitch ?? -25,
    fov: init.fov ?? 60,
  };
}
