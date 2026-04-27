# desktop

DualGaze 桌面壳：Tauri 2 + Rust。把 `frontend/dist` 包成一个原生窗口程序。

## 启动

```bash
pnpm dev:desktop          # 会自动起 Vite (beforeDevCommand) + Tauri 窗口
```

> **首次启动**会下载并编译 Tauri 全套依赖（tao / wry / webview2-com 等约 200+ crate），耗时通常 5–10 分钟。之后增量编译只需几秒。

## 打包

```bash
pnpm build:desktop        # 生成 .msi / .exe / .nsis（Windows）
```

产物落在 `desktop/src-tauri/target/release/bundle/`。

## 目录

```
desktop/
├── package.json              仅依赖 @tauri-apps/cli
└── src-tauri/
    ├── Cargo.toml            crate "dualgaze-desktop"，lib 名 "dualgaze_desktop_lib"
    ├── tauri.conf.json       窗口/构建/打包配置
    ├── build.rs              tauri-build 入口
    ├── capabilities/
    │   └── default.json      默认权限（core:default for window "main"）
    ├── icons/                Tauri 默认 icon（可用 `pnpm exec tauri icon path/to/source.png` 替换）
    └── src/
        ├── main.rs           入口（Windows 下 release 隐藏 console）
        └── lib.rs            tauri::Builder + tauri-plugin-log
```

## 与前端的衔接

`tauri.conf.json` 配置：

- `build.frontendDist = "../../frontend/dist"` — 打包时打包这个目录
- `build.devUrl = "http://localhost:5173"` — dev 时加载 Vite server
- `beforeDevCommand` / `beforeBuildCommand` 自动起停 frontend

窗口 label 为 `"main"`，与 `capabilities/default.json` 的 `windows: ["main"]` 对应。

## 后续 step 入手点

- **接入 backend sidecar**：在 `tauri.conf.json` 的 `bundle` 加 `externalBin`，把 `dualgaze_server.exe` 一起打进安装包，并在 `lib.rs::run()` 里启动 `tauri_plugin_shell` 的 sidecar
- **替换 icon**：准备一张 ≥1024×1024 的 PNG，运行 `pnpm exec tauri icon path/to/source.png` 自动生成全套
- **更新版本号**：改 `tauri.conf.json` 的 `version` 与 `Cargo.toml` 的 `version`
