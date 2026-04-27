# backend

DualGaze 后端 HTTP 服务。CMake + cpp-httplib，独立于前端 pnpm workspace。

## 编译运行

```bash
cmake -S . -B build
cmake --build build --config Release

# Windows
./build/Release/dualgaze_server.exe

# Linux/macOS
./build/dualgaze_server
```

监听 `127.0.0.1:8080`。Ctrl+C 即可停止。

## 接口

- `GET /api/health` → `{"status":"ok","service":"dualgaze"}`
- `GET /datas/*` → 静态资源挂载（仓库根 `datas/` 目录）

## 目录

```
backend/
├── CMakeLists.txt
└── src/
    ├── main.cpp                启动入口 + 信号处理
    ├── http/
    │   ├── server.h / server.cpp   httplib::Server 封装
    │   └── routes.h / routes.cpp   路由注册（健康检查 + 静态挂载）
    └── core/                  业务模块占位（后续 step 灌入算法层）
```

## 依赖

通过 CMake `FetchContent` 拉取 `yhirose/cpp-httplib v0.15.3`，首次配置需要网络。

## 工作目录

后端通过 cwd 相对路径定位 `datas/`，依次探测：

1. `./datas` — 仓库根启动（dev）
2. `../datas` — exe 同级启动（桌面打包后）

启动后访问 `http://127.0.0.1:8080/api/health` 应返回 `ok`。
