# CHANGELOG

跨主要版本的变更记录。日期是首个 commit 的本地时间。

---

## v2.0.0 — 面航线 (mapping)

新增 mapping mission type：用户在地图画多边形 → 自动 S 型扫描航点 → 模拟飞行 → 与 DJI Pilot 2 互通 KMZ。

| Milestone | 内容 |
|---|---|
| **M12** schema + 算法 | `MappingScanParams` + `Mission.{polygon,scanPath,scanParams}` + `lib/mapping-scan.ts`（~190 行，移植 dji_way_line `polygonRouteGenerator.js` → TS）+ store 6 个 mapping action + persist v3→v4 |
| **M13** 交互层 | `PolygonPicker` 左键加顶点 / 右键闭合 / 拖动顶点；`MappingLayer` 渲染 polygon fill+outline + S 路径 dashed + scan 小点 |
| **M14** UI 面板 | MissionConfigPanel 加扫描参数 card（spacing/direction/margin/gimbalPitch/overlapH/overlapW）；RightSheet 加「扫描列表」tab + 顶部统计 + 重算；WaypointList mapping 模式切顶点编辑分支 |
| **M15** 模拟飞行 + KMZ | `effectiveWaypoints` helper 让 sim 全链路 mapping/patrol 共用；KMZ 导出加 mapping 分支（Polygon + dualgazeScanParams + 首点 startRecord + 末点 stopRecord）；导入识别 mapping 后本地重算 scanPath |

**收尾 polish**：
- KMZ 导入后镜头自动飞过去
- 切 2D→3D 回弹时还原前次 pitch（默认 -50°）
- 模拟飞行结束自动 toast
- mapping mission 隐藏不适用的「动作组」tab
- mapping Bavaria 演示一键载入（Grid3x3 按钮）
- missions 为空时自动 seed patrol Bavaria 演示

---

## v1.0.0 — 点航线 (patrol)

DualGaze 完整可用版：DJI 点航线规划工具。

| Milestone | 内容 |
|---|---|
| **M0** | React 18 + Vite 5 + TypeScript + Tailwind 3 + shadcn/ui + Zustand 全栈迁移 |
| **M1** | AMap 卫星底图 + WGS84 ↔ GCJ-02 转换（国测局算法） |
| **M2** | Mission CRUD：库 / 新建模态（4 卡片，仅 patrol 启用）/ localStorage persist |
| **M3** | 航点编辑器：左键加点 + 拖动 + RightSheet 列表数值编辑 |
| **M4** | 模拟飞行 playback：requestAnimationFrame + 线性插值 + 倍速 + 飞行速度分离 |
| **M5** | FPV 浮窗：独立 Cesium scene + 同源 tileset + 拖动/最小化/HUD |
| **M6** | 视锥触发：reach → 半透明锥（HSL hue 循环）+ waypoint ✓ |
| **MissionConfig** | 任务配置面板 5 组 10 字段（对齐 dji_way_line） |
| **M7** | Tileset 退役（删 12 MB pnts + pointcloud.ts 死代码）+ FPV 改 ArcGIS imagery |
| **M8** | 动作组 tab：waypoint.actions[] (takePhoto/startRecord/stopRecord/hover) + 编辑面板 |
| **M9** | KMZ 双向（DJI WPML 1.0.6）：jszip + DOMParser；round-trip 12 字段全等 |
| **M10** | Polish：mission 筛选 + 排序 + 航点拖拽重排（@dnd-kit）+ sonner toast |
| **M11** | 主场景 3D/2D 视图切换浮按钮（pickFromRay 准） |

**底图切换**：v1 中 AMap → ArcGIS World Imagery（z=19 全球免 token，WGS84 原生）。

**关键决策**：
- WGS84 全程存储，仅渲染时 wgs84ToGcj02 修正（境外不转换）
- KMZ 兼容 DJI 标准的同时用自定义 `<wpml:dualgaze*>` ns 保 lossless round-trip 没标准对应的字段（isClosedLoop / fov / globalAction）

---

## Out of scope（v3+ 候选）

- AI 智能识别 / targetDetection（dji_way_line 风格 person/vehicle/boat）
- 相机 GSD 自动算 spacing（v2 只持久化 overlapH/W，不联动）
- 带状航线（strip / corridor）
- 贴近摄影航线（facade，点云法线驱动 — 需 tileset 回归）
- 实时地形跟随（realTimeFollowSurface 字段已有，扫描算法未实装）
- 真飞控对接（DJI Mobile SDK / Pilot 2 协议 push）
- undo-redo / 版本历史 / 多人协同
- I18n / 自动化测试 CI
