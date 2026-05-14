# DualGaze · 点云贴近航线规划

在 3D Tiles 点云（pnts）上**画多边形选择目标区域 + 编辑顶点**，作为后续贴近航线生成算法的输入。

> v0 起步阶段：点云上的多边形 picker。航线生成、KMZ 导出、相机视锥渲染等后续 step 还没做。

## 技术栈

- Vite 5 + TypeScript（无框架，纯 TS 模块）
- CesiumJS 1.124（`vite-plugin-cesium` 处理静态资源）

## 当前能干嘛

| 状态 | 行为 |
|---|---|
| `drawing` | 鼠标在点云上 hover → 青色 snap 标记吸到光标下的渲染点（用 `scene.pickFromRay`）<br>左键加顶点（带数字 label）<br>顶点数 ≥ 3 时主 polyline 自动闭合<br>预览线从最后一个顶点延伸到 snap 位置<br>**右键 / 完成绘制按钮**结束选择<br>Esc 清空 |
| `editing` | 显示中点 handle（每条边一个小灰点）<br>拖顶点 → polyline + 相邻中点实时跟随<br>拖中点 → 在该边上立刻插入新顶点并跟手<br>Esc 重新开始 |

## 关键实现点

- **所有 entity 用 `CallbackPositionProperty(() => ref.pos)` 而不是 `ConstantPositionProperty(pos)`** —— 拖动时只改 ref.pos，所有引用该 ref 的 entity（顶点 marker、polyline、相邻两条边的中点）自动跟随。
- **`pickFromRay` 而不是 `pickPosition`** —— pnts 默认渲染不一定往标准 depth buffer 写，`scene.pickPosition` 在点云上经常返回 null，沿射线找几何交点更可靠。
- **`pickFromRay` 必须传 `objectsToExclude`** —— 否则光标移到自己的顶点 / 中点 / snap marker 上时会拾取到自己的 handle 而不是底下的点云。
- **拖动时锁相机**：`scene.screenSpaceCameraController.enableRotate/Translate/Tilt/Look = false`，松开恢复。
- **`disableDepthTestDistance: Number.POSITIVE_INFINITY`** 让 handles 永远在点云之上可见。
- **`canvas.addEventListener('contextmenu', preventDefault)`** —— 否则浏览器原生右键菜单遮住 Cesium 右键。

## 跑起来

```powershell
pnpm install
pnpm dev    # http://localhost:5173
```

## 放点云数据

`public/datas/pnts/` 是空的（被 gitignore）。需要放一份 3D Tiles 1.0 spec 的 pnts 数据集进去：

```
public/datas/pnts/
├── tileset.json
└── Tile/
    └── ... (.pnts 文件)
```

**已验证可用的数据源**：
- **ContextCapture / Smart3D Master** 工程导出，"PNTS" 输出格式（不要 prototype 或 CESIUM_B3DM）
- **Cesium 官方合成 sample**（小、零配置）：从 `https://raw.githubusercontent.com/CesiumGS/cesium/main/Apps/SampleData/Cesium3DTiles/PointCloud/PointCloudRGB/` 抓 `tileset.json` + `pointCloudRGB.pnts`

**已验证不可用**：
- mattshax/cesium_pnt_generator (2017 prototype 格式，Cesium 1.124 拒收)
- Cesium ion 加密 / Draco 强压缩的 pnts（需要 token + 解码器）

加载入口在 `src/pointcloud.ts`，URL 默认 `/datas/pnts/tileset.json`（在 `src/main.ts` 改）。

## 目录结构

```
src/
├── main.ts            入口 + HUD 接线
├── viewer.ts          createViewer（无底图、无 globe、无 sky、暗背景）
├── pointcloud.ts      loadPointCloud（默认 pointSize=8、SSE=4）
├── polygon-picker.ts  核心 picker 类
└── style.css

public/datas/pnts/     pnts 数据落点（gitignored）
```

## 后续

- 多边形选区 + 法线 → 贴近航线生成算法
- 顶点删除（hover + Delete 键 / 右键菜单）
- 多边形 export（GeoJSON / KML）
- 多个多边形共存
- KMZ 导出（WPML 1.0.6）

## License

未定 —— 本仓库代码原创，三方依赖各自 license（Cesium Apache-2.0，Vite MIT，vite-plugin-cesium MIT）。
