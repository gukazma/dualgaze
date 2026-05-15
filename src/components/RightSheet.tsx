import { useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { WaypointList } from './WaypointList';
import { MissionConfigPanel } from './MissionConfigPanel';
import { WaypointActionsPanel } from './WaypointActionsPanel';
import { MappingScanList } from './MappingScanList';
import { useCurrentMission } from '../store/missions';
import { useUiStore } from '../store/ui';
import { cn } from '../lib/utils';

const TAB_CLS =
  'h-full rounded-none border-b-2 border-transparent text-[12px] data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:text-accent data-[state=active]:shadow-none';

export function RightSheet() {
  const mission = useCurrentMission();
  const tab = useUiStore((s) => s.rightSheetTab);
  const setTab = useUiStore((s) => s.setRightSheetTab);
  const isMapping = mission?.type === 'mapping';

  // 切到 patrol 时如果当前 tab=scan 自动回退到 waypoints
  // 切到 mapping 时如果当前 tab=actions（v2 不支持 mapping per-waypoint actions）自动回退
  useEffect(() => {
    if (!isMapping && tab === 'scan') setTab('waypoints');
    if (isMapping && tab === 'actions') setTab('waypoints');
  }, [isMapping, tab, setTab]);

  const headerCount = isMapping
    ? `${mission?.polygon?.length ?? 0} 顶点 · ${mission?.scanPath?.length ?? 0} 扫描点`
    : `${mission?.waypoints.length ?? 0} 航点`;

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex h-12 items-center justify-between border-b border-border-subtle px-4">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold">
            {mission ? mission.name : '航线详情'}
          </span>
          {mission && (
            <span className="rounded-full bg-bg-input px-2 py-0.5 text-[10px] font-semibold text-text-secondary">
              {headerCount}
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
          <TabsList
            className={cn(
              'grid h-9 w-full gap-0 rounded-none border-b border-border-subtle bg-transparent p-0',
              isMapping ? 'grid-cols-3' : 'grid-cols-3',
            )}
          >
            <TabsTrigger value="waypoints" className={TAB_CLS}>
              {isMapping ? '顶点' : '航点'}
            </TabsTrigger>
            <TabsTrigger value="config" className={TAB_CLS}>
              任务配置
            </TabsTrigger>
            {!isMapping && (
              <TabsTrigger value="actions" className={TAB_CLS}>
                动作组
              </TabsTrigger>
            )}
            {isMapping && (
              <TabsTrigger value="scan" className={TAB_CLS}>
                扫描列表
              </TabsTrigger>
            )}
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
          {isMapping && (
            <TabsContent value="scan" className="mt-0 flex-1 overflow-hidden">
              <MappingScanList />
            </TabsContent>
          )}
        </Tabs>
      ) : (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-[12px] text-text-secondary">
          从左侧选择或新建一个任务
        </div>
      )}
    </div>
  );
}

