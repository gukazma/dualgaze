import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  createAction as buildAction,
  createBlankMission,
  createWaypoint as buildWaypoint,
  MAPPING_DEFAULTS,
  migrateMissionToLatest,
  type MappingScanParams,
  type Mission,
  type MissionType,
  type PolygonVertex,
  type Waypoint,
  type WaypointAction,
  type WaypointActionType,
} from '../types/mission';
import { generateScanPath } from '../lib/mapping-scan';

interface MissionsState {
  missions: Mission[];
  currentMissionId: string | null;
  selectedWaypointId: string | null;

  // mission CRUD
  createMission: (init: {
    name: string;
    type: MissionType;
    droneId: string;
    payloadId: string;
  }) => string;
  selectMission: (id: string | null) => void;
  renameMission: (id: string, name: string) => void;
  duplicateMission: (id: string) => string | null;
  deleteMission: (id: string) => void;
  updateMission: (id: string, patch: Partial<Omit<Mission, 'id' | 'createdAt'>>) => void;

  // waypoint CRUD（针对 currentMission）
  addWaypoint: (init: { lon: number; lat: number; alt: number; heading?: number; pitch?: number; speed?: number; fov?: number }) => string | null;
  updateWaypoint: (waypointId: string, patch: Partial<Omit<Waypoint, 'id' | 'index'>>) => void;
  removeWaypoint: (waypointId: string) => void;
  reverseWaypoints: () => void;
  clearWaypoints: () => void;
  selectWaypoint: (id: string | null) => void;
  /** 拖拽重排：fromIdx 移到 toIdx；重排后 index 字段自动 reindex */
  reorderWaypoints: (fromIdx: number, toIdx: number) => void;

  // waypoint actions CRUD
  addAction: (waypointId: string, type: WaypointActionType) => string | null;
  updateAction: (waypointId: string, actionId: string, patch: Partial<Omit<WaypointAction, 'id'>>) => void;
  removeAction: (waypointId: string, actionId: string) => void;

  // mapping CRUD（针对 currentMission；要求 mission.type === 'mapping'）
  /** 设置多边形顶点，自动触发扫描路径重算 */
  setPolygon: (polygon: PolygonVertex[]) => void;
  /** 追加一个多边形顶点（用于地图画图） */
  addPolygonVertex: (v: PolygonVertex) => void;
  /** 更新单个顶点（用于拖动） */
  updatePolygonVertex: (idx: number, v: Partial<PolygonVertex>) => void;
  /** 删除单个顶点 */
  removePolygonVertex: (idx: number) => void;
  /** 更新扫描参数；自动触发扫描路径重算 */
  updateScanParams: (patch: Partial<MappingScanParams>) => void;
  /** 手动触发重算（一般 set/update 时自动；外部调用兜底） */
  recomputeScanPath: () => void;
}

const reindex = (waypoints: Waypoint[]): Waypoint[] =>
  waypoints.map((w, i) => (w.index === i ? w : { ...w, index: i }));

/**
 * mapping mission：根据当前 polygon + scanParams 重新生成 scanPath。
 * 非 mapping 类型直接返回原对象。
 */
const withRecomputedScan = (m: Mission): Mission => {
  if (m.type !== 'mapping') return m;
  const polygon = m.polygon ?? [];
  const params = m.scanParams ?? MAPPING_DEFAULTS;
  if (polygon.length < 3) return { ...m, scanPath: [] };
  const path = generateScanPath(polygon, params, {
    alt: m.globalHeight,
    speed: m.globalSpeed,
  });
  return { ...m, scanPath: path };
};

const touch = (m: Mission): Mission => ({ ...m, updatedAt: Date.now() });

const updateById = <T extends { id: string }>(arr: T[], id: string, updater: (item: T) => T): T[] =>
  arr.map((x) => (x.id === id ? updater(x) : x));

const updateCurrentMission =
  (set: (fn: (state: MissionsState) => Partial<MissionsState>) => void) =>
  (updater: (m: Mission) => Mission): void => {
    set((state) => {
      if (!state.currentMissionId) return {};
      const next = updateById(state.missions, state.currentMissionId, (m) => touch(updater(m)));
      return { missions: next };
    });
  };

export const useMissionsStore = create<MissionsState>()(
  persist(
    (set, get) => {
      const updCurrent = updateCurrentMission(set);
      return {
        missions: [],
        currentMissionId: null,
        selectedWaypointId: null,

        createMission: (init) => {
          const m = createBlankMission(init);
          set((s) => ({
            missions: [m, ...s.missions],
            currentMissionId: m.id,
            selectedWaypointId: null,
          }));
          return m.id;
        },

        selectMission: (id) => set({ currentMissionId: id, selectedWaypointId: null }),

        renameMission: (id, name) =>
          set((s) => ({ missions: updateById(s.missions, id, (m) => touch({ ...m, name })) })),

        duplicateMission: (id) => {
          const src = get().missions.find((m) => m.id === id);
          if (!src) return null;
          const copy = createBlankMission({
            name: `${src.name} (副本)`,
            type: src.type,
            droneId: src.droneId,
            payloadId: src.payloadId,
          });
          copy.waypoints = src.waypoints.map((w, i) => ({ ...w, id: `${copy.id}_wp_${i}`, index: i }));
          copy.globalSpeed = src.globalSpeed;
          copy.globalHeight = src.globalHeight;
          copy.heightMode = src.heightMode;
          set((s) => ({
            missions: [copy, ...s.missions],
            currentMissionId: copy.id,
            selectedWaypointId: null,
          }));
          return copy.id;
        },

        deleteMission: (id) =>
          set((s) => {
            const missions = s.missions.filter((m) => m.id !== id);
            const currentMissionId =
              s.currentMissionId === id ? (missions[0]?.id ?? null) : s.currentMissionId;
            return { missions, currentMissionId, selectedWaypointId: null };
          }),

        updateMission: (id, patch) =>
          set((s) => ({ missions: updateById(s.missions, id, (m) => touch({ ...m, ...patch })) })),

        addWaypoint: (init) => {
          const current = get().missions.find((m) => m.id === get().currentMissionId);
          if (!current) return null;
          const wp = buildWaypoint({
            ...init,
            index: current.waypoints.length,
          });
          updCurrent((m) => ({ ...m, waypoints: [...m.waypoints, wp] }));
          return wp.id;
        },

        updateWaypoint: (waypointId, patch) =>
          updCurrent((m) => ({
            ...m,
            waypoints: m.waypoints.map((w) =>
              w.id === waypointId ? { ...w, ...patch } : w,
            ),
          })),

        removeWaypoint: (waypointId) =>
          updCurrent((m) => ({
            ...m,
            waypoints: reindex(m.waypoints.filter((w) => w.id !== waypointId)),
          })),

        reverseWaypoints: () =>
          updCurrent((m) => ({ ...m, waypoints: reindex([...m.waypoints].reverse()) })),

        clearWaypoints: () => updCurrent((m) => ({ ...m, waypoints: [] })),

        selectWaypoint: (id) => set({ selectedWaypointId: id }),

        reorderWaypoints: (fromIdx, toIdx) =>
          updCurrent((m) => {
            if (fromIdx === toIdx) return m;
            if (fromIdx < 0 || fromIdx >= m.waypoints.length) return m;
            if (toIdx < 0 || toIdx >= m.waypoints.length) return m;
            const next = [...m.waypoints];
            const [moved] = next.splice(fromIdx, 1);
            next.splice(toIdx, 0, moved);
            return { ...m, waypoints: reindex(next) };
          }),

        addAction: (waypointId, type) => {
          const action = buildAction(type);
          updCurrent((m) => ({
            ...m,
            waypoints: m.waypoints.map((w) =>
              w.id === waypointId ? { ...w, actions: [...w.actions, action] } : w,
            ),
          }));
          return action.id;
        },

        updateAction: (waypointId, actionId, patch) =>
          updCurrent((m) => ({
            ...m,
            waypoints: m.waypoints.map((w) =>
              w.id === waypointId
                ? {
                    ...w,
                    actions: w.actions.map((a) =>
                      a.id === actionId ? { ...a, ...patch } : a,
                    ),
                  }
                : w,
            ),
          })),

        removeAction: (waypointId, actionId) =>
          updCurrent((m) => ({
            ...m,
            waypoints: m.waypoints.map((w) =>
              w.id === waypointId
                ? { ...w, actions: w.actions.filter((a) => a.id !== actionId) }
                : w,
            ),
          })),

        // ===== mapping =====

        setPolygon: (polygon) =>
          updCurrent((m) => withRecomputedScan({ ...m, polygon })),

        addPolygonVertex: (v) =>
          updCurrent((m) => withRecomputedScan({ ...m, polygon: [...(m.polygon ?? []), v] })),

        updatePolygonVertex: (idx, patch) =>
          updCurrent((m) => {
            const poly = m.polygon ?? [];
            if (idx < 0 || idx >= poly.length) return m;
            const next = poly.map((v, i) => (i === idx ? { ...v, ...patch } : v));
            return withRecomputedScan({ ...m, polygon: next });
          }),

        removePolygonVertex: (idx) =>
          updCurrent((m) => {
            const poly = m.polygon ?? [];
            if (idx < 0 || idx >= poly.length) return m;
            return withRecomputedScan({
              ...m,
              polygon: poly.filter((_, i) => i !== idx),
            });
          }),

        updateScanParams: (patch) =>
          updCurrent((m) => {
            const params = { ...(m.scanParams ?? MAPPING_DEFAULTS), ...patch };
            return withRecomputedScan({ ...m, scanParams: params });
          }),

        recomputeScanPath: () =>
          updCurrent((m) => withRecomputedScan(m)),
      };
    },
    {
      name: 'dualgaze.missions',
      version: 4,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        missions: state.missions,
        currentMissionId: state.currentMissionId,
      }),
      migrate: (persisted, _version) => {
        const p = persisted as { missions?: unknown; currentMissionId?: string | null } | undefined;
        if (!p || !Array.isArray(p.missions)) return p as never;
        return {
          ...p,
          missions: p.missions.map((m) => migrateMissionToLatest(m as Parameters<typeof migrateMissionToLatest>[0])),
        } as never;
      },
    },
  ),
);

// Selector helpers
export const useCurrentMission = (): Mission | null => {
  const id = useMissionsStore((s) => s.currentMissionId);
  const missions = useMissionsStore((s) => s.missions);
  if (!id) return null;
  return missions.find((m) => m.id === id) ?? null;
};
