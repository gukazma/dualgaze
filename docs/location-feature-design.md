# Location 定位功能 · 交互设计 v0

> **背景**：用户首启 DualGaze 进入默认 mission（empty / 无 tileset）时，相机位置可能远离地球或在某个奇怪角度，画面是黑屏看不到地表，新用户不知道下一步该干啥。需要一个轻量的「带我去看地球」入口。

## 决策摘要

| 项 | 选择 | 备注 |
|---|---|---|
| 地名搜索服务 | **高德 Web JS API** | 国内畅通；GCJ-02 需转 WGS84；需配 `VITE_AMAP_KEY` |
| IP 定位服务 | **ip-api.com** | 免费无 key，返回 WGS84，国内可访问 |
| 入口位置 | **TopBar 常驻按钮 + 空状态浮卡** | 两个入口都能调出同一个 popup |
| 自动行为 | **不自动调 IP**，但浮卡里有「📍 定位我」按钮 | 尊重用户控制权 + 不发未授权网络请求 |

## 整体交互流

```
                              ┌── TopBar 📍 按钮 ──┐
                              │  (任何时候可点击)   │
   首启 / mission 无 tileset ─►│                  ├──► Location Popup
                              │  空状态浮卡        │     ├─ 地名搜索 input
                              │  「先飞到一个位置吧」│     ├─ 坐标输入 input
                              └──────────────────┘     └─ 「📍 定位我」按钮

   用户选定结果 ──► Cesium viewer.flyTo({ destination, pitch -45° })
                  + localStorage 记最近一次（不自动飞，只是历史）
```

## 1. TopBar 常驻按钮

**位置**：`<TopBar>` 右侧靠近设置按钮的位置，📍 图标 + tooltip "定位 / 跳转"

**交互**：
- 单击 → 弹出 Location Popup（绝对定位的下拉卡片，固定 width 320px）
- 再次点击 / 点外部 / Esc → 关闭
- 不区分 mission 类型，所有视图（facade / mapping / 默认）都可用

**视觉**：和 TopBar 其它图标按钮统一风格（24×24 图标，hover 浅灰背景）

## 2. 空状态浮卡

**触发条件**：
- 当前没有 mission（mission 列表为空）OR
- 当前 mission 是 facade 但 `mission.tilesetSource` 未设 OR
- mapping mission 且 polygon 未画

**位置**：Cesium 画布中央偏上（不挡住下方 polygon picker 提示）

**内容**：
```
┌────────────────────────────────────┐
│  🌍 找不到地球？                    │
│                                    │
│  先飞到一个你熟悉的位置：           │
│                                    │
│  ┌──────────────────────────────┐ │
│  │ 🔍 输入地名（如：上海中山公园）│ │
│  └──────────────────────────────┘ │
│                                    │
│  或                                │
│                                    │
│  ┌──────────────────────────────┐ │
│  │ 121.4737, 31.2304            │ │
│  └──────────────────────────────┘ │
│  📍 经度,纬度  ·  支持复制粘贴      │
│                                    │
│         [📍 定位到我所在位置]      │
│                                    │
└────────────────────────────────────┘
```

**消失**：用户成功定位一次后浮卡自动消失（即使 mission 仍为空，避免遮挡）；下次创建 mission 又重新出现的话，可用 TopBar 📍 调出 popup。

## 3. Location Popup（TopBar 入口）

布局精简版（不带"找不到地球"标题，因为用户主动点的）：

```
┌────────────────────────────────────┐
│  📍 定位 / 跳转                    │
│  ┌──────────────────────────────┐ │
│  │ 🔍 地名 / 关键词             │ │
│  └──────────────────────────────┘ │
│   ▼ 下拉显示高德 suggest 结果 5 条 │
│                                    │
│  ┌──────────────────────────────┐ │
│  │ lon, lat 直接输入            │ │
│  └──────────────────────────────┘ │
│                                    │
│  [📍 定位我]   [最近: 上海中山公园] │
│                                    │
└────────────────────────────────────┘
```

最近一次定位（来自 localStorage）显示在右下角，点击直接复用，免得每次重输。

## 4. 三种定位方式细节

### 4.1 地名搜索（高德 Web JS API）

**实现**：用高德 `AMap.AutoComplete` + `AMap.PlaceSearch`，input 节流 300ms，下拉 5 条 suggest。
- 选中后调 PlaceSearch 拿到 `location: { lng, lat }`（GCJ-02）
- 调 `gcj02ToWgs84(lng, lat)` 转 WGS84
- flyTo

**前置依赖**：用户需要去 [高德开放平台](https://lbs.amap.com) 申请 Web JS API key，写入 `.env`：
```
VITE_AMAP_KEY=xxx
```
未配置 key 时这一栏 disabled + tooltip "未配置 AMAP_KEY"。

### 4.2 坐标直接输入

**支持格式**（用正则 / parser 容错）：
- `121.4737, 31.2304` —— lon, lat 顺序（地理学习惯，与 Cesium 一致）
- `121.4737 31.2304` —— 空格分
- `E121.4737, N31.2304` —— 含方向前缀
- `31.2304, 121.4737` 顺序混乱？**不支持**，因为无法判断哪个是经度哪个是纬度——但若 first|second 显然超 90 就推断为 lon（提示用户）

**默认坐标系**：WGS84（DJI / Cesium / KMZ 都用 WGS84，不必再问）

**校验**：lon ∈ [-180, 180]，lat ∈ [-90, 90]，越界 input 标红 + 错误提示。

### 4.3 IP 定位（ip-api.com）

**调用**：`GET http://ip-api.com/json/?fields=status,country,city,lat,lon,query`

**响应**（成功）：
```json
{
  "status": "success",
  "country": "China",
  "city": "Shanghai",
  "lat": 31.2222,
  "lon": 121.4581,
  "query": "1.2.3.4"
}
```
**注意**：ip-api 用 WGS84 直接给经纬度，免转换。

**失败处理**：网络错误 / status=fail / 5 秒超时 → toast 报错 + 推荐用地名搜索。

## 5. flyTo 行为

```ts
viewer.camera.flyTo({
  destination: Cesium.Cartesian3.fromDegrees(lon, lat, 2000), // 2km altitude
  orientation: {
    heading: 0,
    pitch: Cesium.Math.toRadians(-60), // 微俯视，能看到地表又有立体感
    roll: 0,
  },
  duration: 1.5,
});
```

altitude 2000m 是兼顾「能看到周边地标」+「不太远」的折中。城市地标用户期望可见；如果是山区或郊区可能略远但用户后续可自己缩放。

## 6. localStorage 持久化

key：`dualgaze.location.recent`
value：
```ts
{
  label: '上海中山公园' | '121.47, 31.23' | 'IP: 上海',
  lon: 121.4737,
  lat: 31.2304,
  source: 'amap' | 'manual' | 'ip',
  at: 1716000000000,
}
```

只存一条（覆盖式），用于"最近一次"按钮。**不**自动飞——只有用户点了"最近"才飞。

## 7. 错误与边界

| 情况 | 表现 |
|---|---|
| 未配置 AMAP_KEY | 地名 input disabled + tooltip 提示去 .env 配置 |
| 高德 suggest 返回空 | 下拉显示"未找到，试试坐标或定位我" |
| 坐标格式非法 | input 边框变红 + 下方 helper text 提示格式 |
| IP 定位超时（5s） | toast "IP 定位失败，请用地名搜索或手动输坐标" |
| 坐标越界 (lon > 180 等) | 拒绝提交 + 错误提示 |
| 高德 key 失效 / 配额耗尽 | catch 异常 + toast 提示 |

## 8. 不在范围（v3.x+）

- 反向地理编码（点地图反查地名）—— 当前需求是"飞过去"不是"这是哪"
- 多 POI 选择 / 收藏夹 —— 用 localStorage 多条历史
- 高德地图叠加显示 —— 当前底图是 ArcGIS World Imagery，高德只用 API 不切底图
- 离线地址库 —— 全靠在线 API
- WGS84 / GCJ-02 / BD09 三种坐标系切换 —— v3 假设用户输入都是 WGS84（DJI 一致）

## 9. 开发顺序

1. ✅ 本文档（交互设计）
2. **Pencil 原型**（FrameL1~L4，4 帧）
   - L1: 空状态浮卡
   - L2: TopBar Popup（含 suggest 下拉）
   - L3: 坐标输入校验态（error）
   - L4: IP 定位 loading + success
3. **代码实现**（M19）
   - M19-1: 高德 SDK 动态加载 + GCJ02→WGS84 转换 (`src/lib/amap-geocode.ts`)
   - M19-2: ip-api 封装 (`src/lib/ip-locate.ts`)
   - M19-3: 坐标 parser (`src/lib/coord-parse.ts`)
   - M19-4: `<LocationPopup>` 组件（带三种输入）
   - M19-5: `<EmptyLocationCard>` 浮卡（与 Popup 复用 form）
   - M19-6: TopBar 加 📍 按钮
   - M19-7: 接入 viewer flyTo + localStorage
   - M19-8: playwright 测试（mock 高德/ip-api 响应）

预计 0.5–0.75 session。
