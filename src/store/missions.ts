import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  createBlankMission,
  createWaypoint as buildWaypoint,
  migrateMissionToLatest,
  type Mission,
  type MissionType,
  type Waypoint,
} from '../types/mission';

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
}

const reindex = (waypoints: Waypoint[]): Waypoint[] =>
  waypoints.map((w, i) => (w.index === i ? w : { ...w, index: i }));

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
      };
    },
    {
      name: 'dualgaze.missions',
      version: 2,
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
