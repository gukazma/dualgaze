# Facade Mission UX v3 — 基于真实算法的重新设计

> 背景：第一版 UX（M17.5 Pencil D5-D9）是在算法理解还不完整的时候画的，
> 现在搞清楚了贴近摄影标准算法（GSD/overlap/standoff/raycast 安全检查 等），
> 需要把这些概念真正暴露在 UI 上，否则用户填的参数和结果对不上号。

---

## 核心 UX 原则

1. **GSD 是用户真正关心的产品规格**（毫米级建模就是要 1-3mm GSD），standoff 只是手段
2. **3 角拾取是默认路径**（更快），4 角是高级选项
3. **安全可视化必须显眼**（撞机不可逆，宁可保守）
4. **预设模板降低配置门槛**（一般检测/精细建模/快速浏览 3 选 1）
5. **法向智能默认朝外**（自动算 tileset 质心，normal 反向时自动翻转，F 键备用）

---

## 完整操作流（5 步）

### Step 1 · 选数据源（无变化）

复用 D5/D6 — `FacadeEmptyGuide` + `FacadeLoadingOverlay`

### Step 2 · 启动 picker（无变化）

复用 D7 — tileset 加载完，主视图右下出现 `FacadeStartCta`「+ 开始绘制立面」

### Step 3 · 立面拾取（重新设计，原 D8 升级）

**进入 picker 后的顶部 HUD 浮条**（更新文案）：

| 状态 | 文案 | 视觉细节 |
|---|---|---|
| drawing-1 | "① 点立面**左上**角" | 1 圆圈 active 黄色 |
| drawing-2 | "② 点立面**左下**角" | 1 done cyan，2 active 黄 |
| drawing-3 | "③ 点**右下**角 · 第 3 点自动闭合矩形 / 或继续点 4" | 1+2 done cyan，3 active 黄 |
| drawing-4（可选） | "④ 点**右上**角（精确指定，覆盖自动推断）" | 全 active 提示 |
| preview-success | "✓ 立面 12.4×5.2m · 法向 ↓ · **2/12 航点离障碍过近**" | warning chip 红 |
| preview-clean | "✓ 立面 12.4×5.2m · 法向 ↑ · 12 航点 全部安全" | OK chip 绿 |
| error | "⚠ 3 点共线/退化，无法拟合 · Esc 重画" | 红 |

**preview 时新增视觉**（FacadeLayer）：
- 第 4 角点（自动推的）显示为**虚线轮廓**圆点，区分于用户手点的实心点
- 不安全的 scan path 点：从青色变**红色三角形**
- 这些点的 raycast 命中位置：地图上叠一条红色短线连相机→障碍命中点（便于用户看清楚是被啥挡住）

**preview 快捷键**：
- `F` 翻转法向（已有）
- `Enter` 保存（已有，会因 unsafe 弹 confirm "有 2 点不安全，继续保存？"）
- `Esc` 重画（已有）
- 新增 `Tab` "→ 第 4 个角点"（如果当前在 preview 且只有 3 个用户点 + 1 个自动点 → 退回 drawing-4，允许用户手点第 4 个）

### Step 4 · 配置面板（新设计 — 智能模式 / 手动模式 双轨）

**当前面 face 选中时**，右 Sheet 任务配置 tab 显示**当前面**的扫描参数：

**Layout（智能模式默认）**：

```
┌─ 当前面：南立面 ─────────┐
│ ▣ 智能模式 / ▢ 手动模式      │  ← Switch 顶
│ ─────────────────────────── │
│ 预设方案    [精细建模 ▼]    │  ← 默认: 精细建模 / 一般检测 / 快速浏览 / 自定义
│                              │
│ 目标 GSD     [▒▒▒▒▒░░] 2mm  │  ← Slider，1-30mm 范围
│   (= standoff 7.5m @ M3E)   │  ← 自动算出来的小灰字
│                              │
│ 航向重叠     [▒▒▒▒▒▒▒░] 80% │  ← Slider 60-90%
│ 旁向重叠     [▒▒▒▒▒▒▒░] 80% │  ← Slider 60-90%
│   (= 航点间距 1.7×2.2m)     │  ← 自动算出来
│                              │
│ 估算         12×7=84 航点    │  ← 实时
│              飞行 5m12s      │
│ ─────────────────────────── │
│ ⚠ 2 个航点离障碍过近，建议   │  ← 安全 warning
│   增大 GSD 到 ≥5mm 或      │
│   手动调 standoff           │
└─────────────────────────────┘
```

**Layout（手动模式 toggle 后）**：

```
┌─ 当前面：南立面 ─────────┐
│ ▢ 智能模式 / ▣ 手动模式      │
│ ─────────────────────────── │
│ 拍摄距离 standoff   8.0 m  ─│
│ 水平间距 spacingH   2.0 m  ─│
│ 垂直间距 spacingV   2.0 m  ─│
│ U 缩进   marginU    0.0 m  ─│
│ V 缩进   marginV    0.0 m  ─│
│ 扫描方向     [水平 ▼]      │
│ 飞行速度    3.0 m/s        │
│ 法向反转    [ ⬜ ]          │
│ ─────────────────────────── │
│ ⚠ 2 个航点不安全            │
└─────────────────────────────┘
```

**保留**：底部"任务全局"卡片（高度模式 / 起飞高度 / 完成动作 / 失控动作）

### Step 5 · 多面管理 + 安全总览（新设计，扩展原 D9）

**主视图右上次要 CTA**「+ 新建立面」**保留**。

**新增**：主视图**右上 chip 上方**显示**安全总览徽章**（如果有 unsafe 点）：

```
┌────────────────────────────────────────────┐
│              ⚠ 全 mission 6 个航点不安全   │  ← 红字背景，点击展开 panel
│                              [+ 新建立面] │
└────────────────────────────────────────────┘
```

**右 Sheet 立面列表行**（FacadeFaceList）追加 safety 指示：

```
▣ 南立面                ⚙ 🗑
   84 航点 · standoff 7.5m
   ⚠ 2 不安全           ← 红字小提示，hover 显示具体哪几个
```

---

## Pencil Frame 调整

### 保留不动

- **D5** FacadeEditor-NoTileset
- **D6** FacadeEditor-TilesetLoading
- **D7** FacadeEditor-TilesetLoaded-Empty

### 需要重画 / 升级

- **D8** FacadeEditor-Drawing — 更新 HUD 文案为新版（3/4 角提示）+ 自动推断的第 4 角虚线点
- **D9** FacadeEditor-MultiFace — 加 mission-level safety badge + 列表行 unsafe 提示

### 新增

- **D10** FacadeConfigPanel-Smart — 智能模式（GSD/overlap slider + 自动算 standoff/spacing）
- **D11** FacadeConfigPanel-Manual — 手动模式（原 standoff/spacingH/V slider）
- **D12** PreviewWithUnsafe — picker preview 状态，2 个不安全点显示为红色三角形 + 红色 raycast 线

---

## 实施分期

### M17.5-5（next，立刻做）— 算法 + 基础 UX 修复
- ✅ 纯平面相对（已改 facade-scan.ts）
- ✅ 3 角闭合（已改 FacadePicker）
- ❓ HUD 文案更新（L 形提示）
- ❓ 自动推断第 4 角虚线视觉
- ❓ raycast 安全检查 + scan path 红色 unsafe 点

### M18 — 智能模式参数面板
- PayloadModel schema 扩展（加 sensor_width_mm / sensor_height_mm / focal_length_mm / image_width_px / image_height_px）
- FacadeScanParams schema 加 `mode: 'smart' | 'manual'`、`gsdMm: number`、`overlapFront: number`、`overlapSide: number`
- 智能模式下 standoff/spacingH/V 由 GSD/overlap 反推
- 配置面板 D10/D11 实装

### M19 — Safety 总览 + 转场策略
- mission-level safety badge
- FacadeFaceList unsafe 提示
- face 间转场抬升到 takeOffSecurityHeight

---

## 待确认 5 点

请确认下面 5 点，再开始重画 pencil + 写 code：

1. **3 角默认 / 4 角可选**：picker drawing-3 后是「自动闭合 + preview」还是「自动推第 4 角点但留 drawing-4 状态等用户点」？我倾向**自动闭合 preview**，要 4 角的用户 Tab 退回 drawing-4。OK 吗？
2. **不安全标红**：每个 scan waypoint 都 raycast 验距，标红，但**不阻止保存**（用户自己负责）。OK 吗？
3. **智能/手动双模式**：智能模式默认（GSD + overlap），手动模式 toggle 暴露 standoff/spacing。OK 吗？还是只保留手动？
4. **预设方案**：精细建模 / 一般检测 / 快速浏览 三档预设；选完用户还能微调 GSD 和 overlap。OK 吗？
5. **法向自动朝外**：fitPlaneFromCorners 后自动算 tileset 质心，若 N 指向质心则取反。F 键依然可用作 manual override。OK 吗？
