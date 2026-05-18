# Facade / 贴近摄影 扫描航线算法 — 原理 + DualGaze 实现差距

## 来源

- DPGO（武汉多普云）贴近智航 whitepaper（PDF 主要是图，提不出文字，靠 slides 推断）
- DJI Terra 文档（GSD + overlap 计算）
- 公开摄影测量教材标准公式（GFW = flight × tan(HFOV/2) 等）
- MDPI / ScienceDirect 多篇 UAV facade inspection 论文（"three-steps region division"、BIM-aware path planning）

---

## 标准算法 8 步

### Step 1 · 几何拟合（角点 → 平面）

**输入**：用户点的角点（3 或 4 个）+ 3D Tiles 表面命中坐标
**输出**：`FacadePlane { origin, normal, uAxis, vAxis, width, height }`

- 4 角：4 个 ECEF 点 → 协方差矩阵 SVD → **最小特征向量 = normal** → uAxis 取 corner[1]-corner[0] 投影到平面 → vAxis = normal × uAxis → 4 点投影到 (u,v) 取包围盒得 width/height
- 3 角："L" 形拾取（左上 → 左下 → 右下）→ 自动推 4 角 = `c0 + (c2 - c1)` 平行四边形闭合
- 退化检查：4 点共线 / width 或 height < 0.1m 报错

**DualGaze 现状**：✅ 4 角 SVD 写对了；3 角闭合刚加（待验）

---

### Step 2 · 相机参数 → GSD（地面分辨率）

**核心公式**：
```
GSD = (standoff × sensor_width_mm) / (focal_length_mm × image_width_px)
```

反向：给定目标 GSD，求 standoff：
```
standoff = (GSD × focal_length × image_width_px) / sensor_width
```

**M3E 实例**：sensor=17.3mm, focal=12.29mm, 5280×3956px
- 1 cm GSD → standoff ≈ 37.5m
- 5 mm GSD → standoff ≈ 18.7m
- 2 mm GSD → standoff ≈ 7.5m

DPGO 案例集里 standoff 多在 7-10m，对应 GSD 1.5-3mm（毫米级建模需求）

**DualGaze 现状**：❌ standoff 用户直接填默认 8m，没和 GSD 联动；没读 drone/payload 的 focal_length / sensor 参数

---

### Step 3 · 图像 footprint（一张照片覆盖的实际范围）

```
footprint_width  = standoff × sensor_width  / focal_length = GSD × image_width_px
footprint_height = standoff × sensor_height / focal_length = GSD × image_height_px
```

**M3E @ standoff=8m**：footprint ≈ 11.26m × 8.45m

---

### Step 4 · 间距 ← 重叠率 + footprint

```
spacing_along = footprint_height × (1 - front_overlap)   # 同一航线相邻拍照间距
spacing_side  = footprint_width  × (1 - side_overlap)    # 相邻航线间距
```

**标准推荐**：
- 倾斜摄影：航向 75% / 旁向 80%
- 贴近摄影：航向 80% / 旁向 80%（更密以提精度）
- 农业 / 森林：80-85% / 80-85%

**M3E @ standoff=8m, overlap 80/80%**：
- spacing_along = 8.45 × 0.2 = 1.69m
- spacing_side  = 11.26 × 0.2 = 2.25m

**DualGaze 现状**：❌ spacingH=3 / spacingV=3 用户直接填，没用重叠率反推；同样没读相机参数

---

### Step 5 · 网格生成 + S 排序

```
u_count = ceil(plane.width  / spacing_side) + 1   # 横向航线数
v_count = ceil(plane.height / spacing_along) + 1  # 每航线拍照数
```

S 路径（蛇形）：偶数行 u 正向，奇数行 u 反向；或反过来按 marchOrder 切。

**DualGaze 现状**：✅ 网格 + S 排序逻辑正确（grid 是 spacingH × spacingV 而非按重叠推；Step 4 修了即对）

---

### Step 6 · 相机位 + 姿态（关键！）

**位置**：纯平面相对，**不** raycast 表面
```
P_camera = origin + u·uAxis + v·vAxis + N · standoff
```

raycast 表面会因树木/凸出物把相机算到非均匀距离 → 路径毛刺 + 潜在穿模（用户原话："和 mesh 有交叉，会产生碰撞"）。正确做法是**平面距离恒定** standoff。

**姿态**：相机 look 方向 = -N
1. 把 -N 转到该位置的 ENU 局部系（用 `Cesium.Transforms.eastNorthUpToFixedFrame`）
2. heading = atan2(east, north)（0=正北，CW）
3. pitch = atan2(up, sqrt(east² + north²))
4. gimbalYaw = heading（同步，per-waypoint，KMZ 走 `<wpml:waypointGimbalYawAngle>`）

**DualGaze 现状**：
- ❌ 之前 raycast 表面 → 已修为纯平面（M17.5-5 改动）
- ✅ heading/pitch ENU 转换写对了

---

### Step 7 · 安全（避障 + standoff 验证）

风险：
- 树/雨棚/凸出物挡在 standoff 平面前 → 相机位被障碍占据 → 碰撞
- 用户 standoff 设小（如 3m）实际墙面凸出物有 4m → 撞

**简单策略**（DJI Terra / DPGO 都用）：
1. 每个相机位 → 沿 -N 方向 raycast → 命中距离 d
2. 若 d < standoff → 标红警告，建议改大 standoff
3. 优级：自动把该点 standoff 扩展到 d + safety_margin（局部往后退）

**当前 DualGaze**：❌ 没做。standoff 默认 8m 大概率够，但需要加 raycast 检测 + warning

---

### Step 8 · 多面拼接

mission 内多 face → 按 face 顺序拼 scanPath（已实装于 `effectiveWaypoints`）

转场策略：
- 简单：face[i] 末点 → face[i+1] 首点 直线（当前实现，DJI Pilot 自然飞）
- 推荐：face 间抬升到 takeOffSecurityHeight 避免相邻立面间的障碍物
- 高级（DPGO AI）：旅行商问题优化 face 访问顺序 / 起降点

---

## DualGaze 差距汇总（按用户反馈优先级）

| 问题 | 用户提的 | 标准做法 | DualGaze 现状 | 优先级 |
|---|---|---|---|---|
| 3 角闭合 | ✅ 第 3 点该闭合 | 平行四边形 c4 = c0 + (c2-c1) | M17.5-5 已加 | 已修待验 |
| 航线均匀 | ✅ 距立面恒定 | Step 6 纯平面相对 | M17.5-5 已改 raycast → 平面 | 已修待验 |
| 不穿模 | ✅ 不撞 mesh | Step 7 raycast 验障+warning | ❌ 没做 | M17.6 加 |
| GSD/overlap 联动 | （用户没明说但隐含） | Step 2-4 公式驱动 | ❌ spacing/standoff 用户硬填 | M18 加 |
| 法向歧义 | ✅ F 翻转可用 | 同 DJI Terra | ✅ 已支持 | OK |
| 多面拼接 | ✅ 多 face | 顺序拼 | ✅ 顺序拼实装 | OK |
| 转场 / 安全爬升 | （未提） | 升 takeOffSecurityHeight | ❌ face 间直飞 | M18 加 |

---

## M17.5-5 待做的具体改动（按优先级）

1. **保留 M17.5-5 已改的"纯平面相对"+"3 角闭合"** —— 自测过算法均匀性 OK
2. **新加 standoff 验证**：算 scanPath 时每个点向墙面做一次 raycast，若 d_to_surface < standoff → 标记 `wp.unsafe = true` + 在 UI 列表里红色 warning
3. **GSD/overlap 联动**留 M18（更大改动，需扩 PayloadModel 加 sensor/focal 字段 + 改 FacadeScanParams schema）

---

## 用户对算法理解要确认的点

请确认下面 7 点对不对：

1. **位置算法**：相机 = `plane.origin + u·uAxis + v·vAxis + N · standoff`，**不**贴 mesh 表面 — 对吗？
2. **3 角闭合**：c4 = c0 + (c2-c1) 自动推（平行四边形），用户点 4 角则用 4 角拟合 — 对吗？
3. **standoff 默认 8m** 暂时保留，但要加 raycast 验证（点前方 < 8m 有障碍就 warn）— 对吗？
4. **spacing 公式**：现阶段保留用户填 spacingH/V，**不**自动用 GSD/overlap 反推（这个留 M18 做）— OK 吗？
5. **姿态**：相机直射墙面（pitch ≈ 0 因为墙面竖直），gimbalYaw = heading 同步 — 对吗？
6. **多面顺序**：按用户添加顺序，face 间直飞末点→首点（不抬升 safe height）— OK 吗？
7. **mesh raycast 验障**：算 scanPath 时给每个点加一次墙面 raycast 标 unsafe，列表里红字 + scan path 该点画红 — 加这个吗？
