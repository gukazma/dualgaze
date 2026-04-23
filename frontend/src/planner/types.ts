import * as Cesium from 'cesium';

export interface HullBox {
  center: Cesium.Cartesian3;
  halfAxes: Cesium.Matrix3;
}

export interface Waypoint {
  position: Cesium.Cartesian3;
  heading: number;
  pitch: number;
  roll: number;
}

export interface PlanOptions {
  safetyDistance: number;
  sampleSpacing: number;
  cameraDistance: number;
  tiltDeg: number;
  maxTargetLevel: number;
}

export interface PlanResult {
  hull: HullBox[];
  waypoints: Waypoint[];
  pathOrder: number[];
  totalDistanceMeters: number;
}
