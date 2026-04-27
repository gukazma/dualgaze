# DualGaze

**重眸（DualGaze）—— 倾斜摄影贴近航线规划框架**，提供 Cesium 跨平台可视化与交互。

> 本仓库当前为脚手架阶段（Step 7），只跑通最小启动回路；step1-6 的离线算法成果在 commit 历史中保留，将由后续 step 重新接入业务模块。

## 目录布局

```
DualGaze/
├── frontend/   # @dualgaze/frontend  Web 端 (React + TS + Vite + CesiumJS)
├── desktop/    # @dualgaze/desktop   桌面壳 (Tauri 2 + Rust)
├── shared/     # @dualgaze/shared    前端/桌面共享 TS 类型
├── backend/    # C++ HTTP server     CMake 独立编译，cpp-httplib
└── datas/      # 真实倾斜摄影 tileset 落点（后续 step 灌入）
```

`frontend/` 与 `desktop/` 复用同一份 Vite 构建产物：桌面端是 Tauri 把 `frontend/dist` 包起来的壳。

## 前后端边界

只有两条 HTTP 路由作为约定：

- `/api/*` — 业务 JSON 接口（健康检查 / 算法服务）
- `/datas/*` — 静态资源挂载（`datas/3dtiles.json`、`Tile/*.b3dm`）

dev 阶段 Vite 把 `:5173` 收到的 `/api`、`/datas` 都转发到后端 `:8080`。

## 开发

环境要求：Node ≥ 20、pnpm 10、CMake ≥ 3.20、Rust（仅桌面端需要）。

### Web 端

```bash
pnpm install
pnpm dev          # 起 frontend，浏览器打开 http://localhost:5173
```

### 桌面端

```bash
pnpm dev:desktop  # 自动起 Vite + Tauri 窗口
```

### 后端

```bash
cmake -S backend -B backend/build
cmake --build backend/build --config Release
./backend/build/Release/dualgaze_server.exe   # Windows
# ./backend/build/dualgaze_server             # Linux/macOS
curl http://127.0.0.1:8080/api/health
```

## 全套校验

```bash
pnpm typecheck    # TS 类型检查（三个 workspace package）
pnpm lint         # ESLint
pnpm format:check # Prettier
```

## 设计选择速览

- **彻底从零搭脚手架**（不复用 step1-6 旧 backend / datas / CLAUDE.md）
- **Tauri 2** 做桌面壳：包体小、内存低、原生 webview
- **直接用 CesiumJS**（不引入 Resium 抽象层）以便完全可控
- **默认关闭 Cesium ion**，用 OpenStreetMap 底图，避免每个开发者都要注册 ion token
- **pnpm workspace monorepo**：`frontend` / `desktop` / `shared` 三个 TS package + `backend` 独立 CMake
