---
version: 1
name: yudeng 余灯

colors:
  surface-base: "#f5f2ea"
  surface-raised: "#fffdf8"
  surface-sunken: "#f0ece3"
  surface-inverse: "#1e2a24"
  ink: "#1e2a24"
  ink-soft: "#45514a"
  ink-faint: "#5d6961"
  ink-inverse: "#f5f2ea"
  ink-inverse-soft: "#dde2dc"
  line: "#ded6c6"
  line-strong: "#c8beaa"
  accent: "#8f4712"
  accent-strong: "#6e3609"
  accent-soft: "#f3e5d6"
  accent-line: "#d9b593"
  ok: "#2f6b4f"
  ok-soft: "#e2ede6"
  warn: "#8a5a12"
  warn-soft: "#f5ead4"
  danger: "#a32b22"
  danger-soft: "#f6e3e0"

typography:
  family-sans: "Spline Sans, -apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Microsoft YaHei, Noto Sans SC, sans-serif"
  family-mono: "Spline Sans Mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
  size-xs: 12px
  size-sm: 13px
  size-base: 14px
  size-md: 16px
  size-lg: 18px
  size-xl: 22px
  size-2xl: 28px
  size-3xl: 36px
  weight-regular: 400
  weight-medium: 500
  weight-semibold: 600
  weight-bold: 700

rounded:
  sm: 6px
  md: 10px
  lg: 14px
  full: 999px

spacing:
  "1": 4px
  "2": 8px
  "3": 12px
  "4": 16px
  "5": 20px
  "6": 24px
  "8": 32px
  "10": 40px
  "12": 48px

components:
  card:
    background: surface-raised
    border: 1px solid line
    radius: lg
    shadow: sm
  panel:
    background: surface-raised
    border: 1px solid line
    radius: lg
    shadow: sm
  ledger-row:
    background: surface-sunken
    border: 1px solid line
    radius: md
  hero-stat:
    background: surface-inverse
    color: ink-inverse
    radius: lg
  button-primary:
    background: accent
    color: ink-inverse
    radius: md
  tag:
    radius: full
---

# 余灯 · yudeng

宿舍水电余量与低额告警的监控台。名字取自"余额所余，宿舍灯火"。

## Overview

这不是一块 SaaS 后台看板，而是**一本夜里的宿舍抄表台账**：暖纸的页面、一道
发丝细的墨线分栏、等宽的表盘数字，和唯一一处灯焰色的强调。抓取后台每小时替人
抄一次表，人只需要一眼看清哪个宿舍快没电、快没水。

设计要服务一个具体的人：深夜盯着手机、担心明天断水断电的学生或宿管。所以页面
**静、暖、准**——不喧哗、不发光、数字对得整整齐齐。

三条不可让步的原则：

1. **数字优先。** 余额、剩余量、时间戳一律等宽字 + `tabular-nums`，小数点对齐，
   一眼能比。数字是这本台账的主体，装饰永远让位。
2. **墨线代替盒子。** 分层靠背景明度与发丝线，不靠阴影堆叠。宁可留白，不套卡片。
3. **一处灯焰。** 强调色只属于"当前 / 主操作 / 告警"三类语义，其余一律墨色。

方向不是可选项：拿掉 logo 之后，这页仍应只属于"宿舍水电台账"这一件事。

## Colors

**温度先定：暖。** 所有中性色都是暖纸家族的成员，不是纯白也不是冷灰。

| Token | 值 | 用途 |
|---|---|---|
| `surface-base` | `#f5f2ea` | 页面底 + 侧栏 |
| `surface-raised` | `#fffdf8` | 卡片、面板、表格 |
| `surface-sunken` | `#f0ece3` | 表头、行内条目、内嵌行 |
| `surface-inverse` | `#1e2a24` | 唯一的深色面板（余额主读数） |
| `ink` | `#1e2a24` | 正文主色（墨绿黑，非纯黑） |
| `ink-soft` | `#45514a` | 次级正文 |
| `ink-faint` | `#46514a` | 弱化说明（≥12px，仍达 APCA 75） |
| `line` / `line-strong` | `#ded6c6` / `#c8beaa` | 发丝分栏线 / 强化线 |
| `accent` | `#8f4712` | 灯焰色：主操作、当前项、链接 |
| `accent-strong` | `#6e3609` | hover / active 加深 |
| `accent-soft` | `#f3e5d6` | 强调的柔和底（选中菜单、标签） |
| `ok` `warn` `danger` | `#245a41` `#6b4408` `#a32b22` | 仅编码状态，绝不做装饰 |

Element Plus 的主色阶梯（`--el-color-primary*`）全部由 `accent` 派生，不另起炉灶。

图表系列色只有三支，且**命名可辨**（不是同色透明度的梯级）：照明 `#b4622a` 灯焰橙、
空调 `#2f6b7a` 冷青、水 `#2f6b4f` 深绿。

## Typography

**Spline Sans + Spline Sans Mono。** 选它是因为这本台账的骨架是**数字**：Spline Sans
Mono 的等宽数字天生对齐，`tabular-nums` 一开，余额列纵向成一条尺。中文回落到
PingFang SC / Microsoft YaHei / Noto Sans SC，不喧宾夺主。

字号用固定阶（12 / 13 / 14 / 16 / 18 / 22 / 28 / 36），不随手写 `15px`。
余额主读数 36px 等宽；页标题 28px 700；正文 14px/1.6；弱化说明最低 12px——
低于 12px 的字在这本台账里没有位置。

## Layout

8px 网格。间距只取 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 这几档，不写魔法值。
内容区宽 `min(1180px, 100% - 48px)`，桌面居中。侧栏固定 248px，≤900px 收进抽屉。

## Elevation

只有三个命名层级，一个配方一种用途，永不复用错位：

| 层 | token | 用在哪 |
|---|---|---|
| sm | `--shadow-sm` | 卡片、面板（贴着纸面） |
| md | `--shadow-md` | 浮层：下拉、日期选择、抽屉 |
| lg | `--shadow-lg` | 唯一最高层：对话框、移动端遮罩 |

**没有第四种。** 阴影不当作纹理使用——需要更近，就先抬高层级，而不是加大模糊。
分层的第一手段是背景明度（纸 → 抬升 → 凹陷 → 反色），阴影只是补足。
不发光的阴影、不用 `backdrop-filter` 的毛玻璃。

## Shapes

圆角三档：`sm 6px`（标签、输入）/ `md 10px`（按钮、条目行）/ `lg 14px`（卡片、面板），
标签用 `full`。圆角编码"离纸面的远近"，不编码风格。

## Components

- **侧栏**：`surface-base` 底，右侧一道 `line` 发丝线。品牌标记是一枚**墨底灯焰「余」字印章**（无渐变、无发光）。
- **面板 / 卡片**：`surface-raised` + 发丝线 + `shadow-sm`。头部分栏线不加阴影。
- **台账行**（`dorm-balance-item` / `alert-row` / `student-row` / `openid-row`）：`surface-sunken`
  底 + 发丝线，固定列网格、等行高、数字右对齐。这是台账的骨架，重复内容一律用它，不用卡片阵列。
- **余额主读数**：唯一一块反色面板（`surface-inverse`），等宽 36px。它是页面的视觉锚点，也是"抄表"这件事的署名。
- **表格**：表头 `surface-sunken`，行 hover 落 `surface-sunken`，数字列右对齐等宽。
- **标签**：`full` 圆角，语义色配 10% 柔和底。

## Do's & Don'ts

**Do**
- 数字用 `.mono`（等宽 + tabular-nums），小数点对齐。
- 用背景明度与发丝线分层；先留白，再背景位移，最后才是阴影。
- 每个交互元素都给全 `default / hover / focus-visible / active / disabled`。
- 动效只服务于"确认与反馈"，且必有 `prefers-reduced-motion` 回落。

**Don't**
- ✗ 硬编码颜色——一律走 token。✗ 第四种阴影。✗ `backdrop-filter` 毛玻璃。
- ✗ 渐变光晕 / 发光按钮 / 彩色大模糊阴影。✗ 纯 `#fff` / `#000`。
- ✗ 给每个链接/按钮都缀箭头。✗ 大写拉宽的 eyebrow 小标。
- ✗ 把强调色用在装饰上——它只编码"当前 / 主操作 / 告警"。
