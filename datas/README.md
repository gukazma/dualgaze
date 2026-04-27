# datas/

真实倾斜摄影 tileset 落点目录。

> **脚手架阶段（Step 7）此目录为空。** 真实数据由后续 step（"加载 3dtiles"）灌入并做端到端验证。

## 预期内容

- `3dtiles.json` — Cesium 3D Tiles 入口（root.boundingVolume / geometricError / children）
- `Tile/`        — `Tile_L*.b3dm` 等 LOD 切片资源
- `metadata.xml` — 可选元数据

## 暴露方式

后端 `dualgaze_server` 通过 `set_mount_point("/datas", "datas/")` 把本目录挂到 HTTP `/datas/*`。

dev 阶段前端走 Vite proxy：`http://localhost:5173/datas/...` → `http://127.0.0.1:8080/datas/...`。

## 约束

不要在前端代码里 `import` 本目录下的任何文件，统一通过 HTTP 请求，保证 dev 与桌面打包后的路径一致。
