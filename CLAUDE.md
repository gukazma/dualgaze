# DualGaze — Claude 工作约定

## 项目定位

DualGaze（重眸）是倾斜摄影贴近航线规划框架。前期（step1-6）做的是离线算法（hull / dsm / proxyMesh / safetyShell / viewpoints / interest mask）；从 step7 起搭跨平台 Cesium 可视化与交互平台。

## 仓库布局

```
DualGaze/
├── package.json          (pnpm workspace 根)
├── pnpm-workspace.yaml
├── tsconfig.base.json    (前端三 package 共享 TS 配置)
├── eslint.config.js      (ESLint 9 flat config)
├── frontend/             @dualgaze/frontend  React + TS + Vite + CesiumJS
├── desktop/              @dualgaze/desktop   Tauri 2 桌面壳
├── shared/               @dualgaze/shared    前端/桌面共享 TS 类型（只放类型，不打包）
├── backend/              C++ HTTP server，CMake 独立编译，cpp-httplib
└── datas/                真实 tileset 落点（脚手架阶段为空，后续 step 灌入）
```

`backend/` 与 `datas/` **不在** pnpm workspace 内。

## 前后端契约

唯一两条边界：

- `/api/*` → JSON 接口
- `/datas/*` → 静态资源挂载（`datas/` 目录）

dev 阶段 Vite 把这两条 path 都 proxy 到 `http://127.0.0.1:8080`（backend）。打包后桌面端走 Tauri 内嵌请求 + sidecar backend。

## 启动指令

```bash
# Web
pnpm install
pnpm dev                 # http://localhost:5173

# 桌面
pnpm dev:desktop         # Tauri 窗口

# Backend
cmake -S backend -B backend/build
cmake --build backend/build --config Release
./backend/build/Release/dualgaze_server.exe

# 校验
pnpm typecheck && pnpm lint
```

## 关键工程约定

- **Cesium ion 默认关闭**。`frontend/src/lib/cesium-bootstrap.ts` 把 `Cesium.Ion.defaultAccessToken = ''` 并使用 OpenStreetMapImageryProvider。需要 ion 资产时在 `.env.local` 设 `VITE_CESIUM_ION_TOKEN`，bootstrap 会自动读取。
- **静态资源必须走 `/datas/*`**。前端代码里禁止 `import` `datas/` 下文件，统一通过 HTTP 拿，保证 dev / 桌面打包路径一致。
- **`shared/` 只放纯 TS 类型**，不放运行时代码。这样三处 import 不会引入额外构建。
- **不要把 backend 加进 pnpm workspace**。它是独立的 C++ 项目。
- **测试 / CI / 状态管理 / 路由 暂未引入**，等首个业务 feature 出现再选型。

## 已实现 feature 模块

### `frontend/src/features/sketch/` — 多边形草绘 + 挤出 (v1.5, SolidWorks 语义)

- **范围**：在 globe / 3D Tiles 上点选多边形顶点、闭合后**鼠标拖拽实时挤出**，半透明青色棱柱
- **基面语义**：B 方案——首点定 baseAltitude，后续点强制吸附到该水平面（严格平面 sketch）
- **拾取**：`viewer.scene.pickPosition`（命中 3D Tiles / 地形优先），未命中回退 `pickEllipsoid`。tileset 灌进 datas/ 后自动支持
- **状态机**：`idle → drawing → extruding → extruded`（闭合多边形后自动进入 extruding，初始默认 50m）
- **入口**：rail 上的 "Sketch & Extrude" 槽（`Tool` 类型 = `'sketch'`）
- **拖拽挤出**：extruding 状态下鼠标 Y 上下拖拽 = 实时调高度（scale 自适应相机高度）；input 框同步显示，可手动改写（focus 时自动暂停鼠标驱动）；左键单击 / 面板"完成挤出"按钮 commit；ESC 取消
- **键盘**：`Enter` 闭合（drawing）、`Escape` 取消（drawing / extruding）；input focused 时键盘事件不触达 controller
- **切 tool 时自动取消** drawing / extruding 未提交的 sketch；extruded 棱柱跨 tool 切换保留
- **不做（v2+）**：顶点编辑 / 多 sketch 共存 / 撤销重做 / extruded 后再次 edit

### `frontend/src/features/viewer/` — 主 Cesium viewer + rail + tiles 面板

- `CesiumViewer.tsx` 是顶层组合：Cesium 容器 + Rail + 上下文面板（按 `activeTool` 选）
- `useCesiumViewer` 返回 `Viewer | null` state（不是 ref），下游组件按 `viewer && ...` 条件渲染依赖
- dev 模式 `__cesiumViewer` 暴露到 `window` 用于 Playwright / 调试

## 后续 step 入手点

- **加载真实 tileset**（按 memory 约定用 `datas/3dtiles.json` 端到端验证）：`TilesetPanel.tsx` 已经接 `Cesium3DTileset.fromUrl`，等 datas/ 灌真数据
- **sketch v2**：拖拽实时挤出 → `SketchController.applyExtrude` 改成接 mouse 事件流；顶点编辑 → 加 vertex handle entities
- **新增 `/api/*` 接口**：`backend/src/http/routes.cpp`
- **新增前端 feature**：`frontend/src/features/<name>/`（按 feature 切分，不按文件类型切）
- **Tauri sidecar 自动启 backend**：`desktop/src-tauri/tauri.conf.json` 的 `bundle.externalBin`
