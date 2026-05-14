import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { WaypointList } from './WaypointList';
import { MissionConfigPanel } from './MissionConfigPanel';
import { WaypointActionsPanel } from './WaypointActionsPanel';
import { useCurrentMission } from '../store/missions';
import { useUiStore } from '../store/ui';

export function RightSheet() {
  const mission = useCurrentMission();
  const tab = useUiStore((s) => s.rightSheetTab);
  const setTab = useUiStore((s) => s.setRightSheetTab);

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex h-12 items-center justify-between border-b border-border-subtle px-4">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold">
            {mission ? mission.name : '航线详情'}
          </span>
          {mission && (
            <span className="rounded-full bg-bg-input px-2 py-0.5 text-[10px] font-semibold text-text-secondary">
              {mission.waypoints.length} 航点
            </span>
          )}
        </div>
      </div>

      {mission ? (
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as typeof tab)}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <TabsList className="grid h-9 w-full grid-cols-3 gap-0 rounded-none border-b border-border-subtle bg-transparent p-0">
            <TabsTrigger
              value="waypoints"
              className="h-full rounded-none border-b-2 border-transparent text-[12px] data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:text-accent data-[state=active]:shadow-none"
            >
              航点
            </TabsTrigger>
            <TabsTrigger
              value="config"
              className="h-full rounded-none border-b-2 border-transparent text-[12px] data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:text-accent data-[state=active]:shadow-none"
            >
              任务配置
            </TabsTrigger>
            <TabsTrigger
              value="actions"
              className="h-full rounded-none border-b-2 border-transparent text-[12px] data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:text-accent data-[state=active]:shadow-none"
            >
              动作组
            </TabsTrigger>
          </TabsList>
          <TabsContent value="waypoints" className="mt-0 flex-1 overflow-hidden">
            <WaypointList />
          </TabsContent>
          <TabsContent value="config" className="mt-0 flex-1 overflow-hidden">
            <MissionConfigPanel />
          </TabsContent>
          <TabsContent value="actions" className="mt-0 flex-1 overflow-hidden">
            <WaypointActionsPanel />
          </TabsContent>
        </Tabs>
      ) : (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-[12px] text-text-secondary">
          从左侧选择或新建一个任务
        </div>
      )}
    </div>
  );
}

