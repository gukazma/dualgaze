# DualGaze · DJI 航线规划工具

在浏览器里规划 DJI 无人机航线 → 模拟飞行预览 → 一键导出 KMZ 给 Pilot 2 / FlightHub 2。

支持两种航线模式：

- **点航线 (patrol)** —— 在地图点 N 个航点，按顺序飞过去
- **面航线 (mapping)** —— 画多边形边界，自动生成 S 型扫描路径（航测式覆盖）

## 跑起来

```powershell
pnpm install
pnpm dev     # http://localhost:5173
```

首次启动空 mission list 会自动加载「Bavaria 点航线演示」给你 reference。

## 主要功能

### 🛩️ 点航线（patrol）

- 地图左键加航点，右键切到编辑模式拖顶点
- 6 字段编辑：经度 / 纬度 / 高度 / 速度 / 航向 / 云台
- 拖拽重排航点顺序（dnd-kit）
- 模拟飞行 playback + 倍速（1x/2x/5x/10x）+ 全局飞行速度滑块
- FPV 浮窗：drone 视角看 ArcGIS 卫星图地表 + HUD（ALT/YAW/LON/LAT）
- 视锥触发：飞过每个航点长出半透明锥（HSL hue 循环色）
- 每航点动作组：拍照 / 录像开 / 录像停 / 悬停 N 秒

### 🌐 面航线（mapping）

- 地图左键画多边形顶点 → 右键 ≥3 顶点闭合 → 切编辑模式拖顶点
- 实时生成 S 型扫描航点（航测覆盖）
- 6 个扫描参数实时联动：spacing / direction / margin / 云台 / 横向 + 纵向重叠
- 「扫描列表」tab 只读列出生成的航点 + 总距离 + 估时
- 模拟飞行沿扫描路径飞，KMZ 导出 = boundary Polygon + scanPath + startRecord

### 📋 任务配置 (5 组 10 字段)

完整对齐 dji_way_line：基础（飞行速度/高度模式）/ 起降（安全起飞/飞向首航点）/ 结束动作（完成动作/航线模式）/ 失控保护（失控动作/失联行为）/ 全局动作（拍照/录像）

### 📦 KMZ 双向（DJI WPML 1.0.6）

- 导出：`{mission.name}.kmz`，含 `wpmz/template.kml` + `wpmz/waylines.wpml`
- 导入：识别 patrol / mapping 两种类型，round-trip 字段全等
- 兼容 DJI Pilot 2 / FlightHub 2 系统；非 DJI 标准字段（isClosedLoop / fov / mapping scanParams）走自定义 `<wpml:dualgaze*>` 命名空间存储

### 🗺️ 地图

- ArcGIS World Imagery（z=19 全球免 token，WGS84 原生）
- 主场景 3D / 2D 视图切换（俯视锁旋转，方便点航点）
- 中国境内 GCJ-02 坐标系自动修正（境外不转换）

## 技术栈

| 层 | 选型 |
|---|---|
| Frontend | React 18 + Vite 5 + TypeScript |
| UI | Tailwind 3 + shadcn/ui (15 primitives) |
| 3D | CesiumJS 1.124 |
| State | Zustand + localStorage persist |
| 拖拽 | @dnd-kit/sortable |
| KMZ I/O | jszip + 浏览器原生 DOMParser |
| Toast | sonner |

## 验收路径（5 分钟跑全功能）

1. 打开 http://localhost:5173 → 自动加载 Bavaria 点航线演示
2. **TopBar 「模拟飞行」** → drone 沿 4 航点矩形飞 + FPV 显示卫星图俯视
3. 退出模拟 → MissionLibrary **Grid3x3 按钮** 加载 Bavaria 面航线演示
4. **「任务配置」tab** 改 spacing 从 20 → 10 → 40 → S 路径条数实时变化
5. 拖多边形顶点 → polygon 变形 + scanPath 重算
6. **「扫描列表」tab** 看 readonly 扫描航点 + 总距离 + 估时
7. **「模拟飞行」** → drone 沿 S 路径飞，视锥每个 scanWaypoint 触发
8. **「导出 KMZ」** → 浏览器下载 `Bavaria 面航线演示.kmz`
9. 删 mission → **「导入 KMZ」** 选刚才文件 → 多边形 + scanParams + scanPath 全还原

## 目录结构

```
src/
├── App.tsx                          根布局 + 模式判断
├── main.tsx                         React mount
├── components/                      业务组件
│   ├── TopBar / MissionLibrary
│   ├── CreateMissionModal / RightSheet
│   ├── PlaybackBar / FpvWindow / ViewToggle
│   ├── WaypointList / WaypointActionsPanel
│   ├── MissionConfigPanel / MappingScanList
│   └── ui/*                         shadcn primitives
├── features/
│   ├── cesium/                      CesiumViewer + Context + useFlyToMission + useMapViewSync
│   ├── waypoint/                    WaypointPicker + WaypointLayer (patrol)
│   ├── mapping/                     PolygonPicker + MappingLayer (mapping)
│   ├── simulation/                  SimulationLoop + DroneLayer
│   └── frustum/                     FrustumLayer
├── lib/
│   ├── coord.ts                     WGS84 ↔ GCJ-02
│   ├── amap.ts                      底图 imagery options
│   ├── mapping-scan.ts              多边形 → S 路径算法
│   ├── kmz-export.ts / kmz-import.ts  WPML 1.0.6 双向
│   └── demo-mission.ts              Bavaria 演示常量
├── store/
│   ├── missions.ts                  Mission CRUD + persist v4
│   ├── ui.ts                        tabs / filter / sort / mapView
│   └── simulation.ts                mode / play / speed / droneState
└── types/mission.ts                 schema + MISSION_DEFAULTS + MAPPING_DEFAULTS
```

## 参考 / 致谢

- **`dji_way_line`** (Vue + 高德地图版航线工具) —— DualGaze 的 schema / KMZ 模板 / S 扫描算法基础都参考自这里
- **Cesium** —— 3D viewer / pickFromRay / Cartesian 坐标
- **DJI WPML 1.0.6 spec** —— KMZ XML 元素

## License

GPL-3.0
