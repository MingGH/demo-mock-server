# numfeel 通用行为埋点分析文档

本文档是 `demo_events` 表（通用行为埋点）的**分析口径**说明，供直连数据库跑 SQL 写分析文章时使用。

- 客户端 SDK：`numfeel-site/components/track.js`（`window.NFTrack`）
- 后端接口：`POST /events/collect`、`GET /events/summary`
- 示例分析 SQL：`docs/analytics/wealth-button.sql`
- 表结构：`numfeel-service/src/main/resources/schema.sql`

> 深度分析一律**直连数据库跑 SQL**，不做任何返回原始事件行 / 可传 SQL 片段的公开接口——
> 这是刻意的隐私与安全边界（见 `numfeel-service/AGENTS.md`）。

---

## 事件口径：什么算一局

这是**最核心**的一条，所有「局数」相关的统计都必须遵守：

- **`session_end` 是「一局结束」的唯一标记**，每轮恰好 **0 或 1 条**，`reason` 区分结局：
  - `reason='reset'`：点「重置」主动收手
  - `reason='leave'`：离页（`pagehide`）主动收手
  - `reason='bankrupt'`：资产归零被迫破产
- **`bankrupt` 事件只用于取破产专属字段**（破产时的 `presses` / `idx` / `peakWealth` / `peakIdx`），
  **不参与「局数」计算**。
- 破产时浏览器会同时发 `bankrupt` 和 `session_end(reason='bankrupt')` 两条，它们是**同一局的两条记录**。

> 历史教训：早期 SQL 把 `event_name IN ('bankrupt','session_end')` 都当作「一局结束」，
> 导致每次破产被数 2 次，「主动收手占比」被系统性低估近一半。
> **统计「局数」一律只用 `session_end`**，`bankrupt` 只取字段。

### 一局的生命周期

```
session_start     首次 press 时发出（不是页面加载时）
  ├─ press × N    每次点击
  ├─ milestone     唯一性由 SDK 保证（x10 / x100 / billionaire）
  ├─ session_hidden 切后台兜底（可多条，每局 ≤20）
  └─ session_end    局结束（唯一标记）
bankrupt（仅破产时） 与 session_end(reason='bankrupt') 同局并行
```

---

## 会话分类（session_hidden 的用途）

`session_hidden` 是**切后台的兜底事件**，**不结束一局**。它的 props 与 `session_end` 完全一致
（`presses` / `finalWealth` / `peakWealth` / `peakIdx` / `winCount` / `truncated`），外加
`reason:'hidden'` 便于统一处理。

- `visibilitychange → hidden`（切别的标签页 / App / 锁屏）→ 发 `session_hidden`，**不重置**峰值/里程碑。
- `pagehide`（真正离页）→ 发 `session_end(reason='leave')`，结束这一局。
- 真离页时 `session_hidden` + `session_end(leave)` 会依次触发，这是**预期行为**——局数只认 `session_end`。

分析时按会话（session_id）划分三类，避免「主动收手占比」被无声影响：

| 类别 | 判定 | 含义 |
|---|---|---|
| **normal** | 有 `session_end` | 正常收尾，可计入「主动收手占比」分子/分母 |
| **hidden_only** | 只有 `session_hidden`，无 `session_end` | 多为 iOS Safari 上 `pagehide` 未触发，用该轮 `seq` 最大的一条作兜底 |
| **no_ending** | 两者都无 | 极短会话 / 页面被强杀，无法判断结局 |

查询 4 已经补了这段三分类占比，读结论时务必先看一眼这三类占比。

---

## 已知偏差（写结论前必须对照）

1. **`session_start` 在第一次 press 时才发，不是页面加载时发。** 好处是不产生空会话；
   代价是「各模式 / 随机源的人群基数」只统计**按过按钮的人**，`session_start` 数 ≠ 访问数，
   和页面「已有 N 人玩过」的口径不一致。写文章时必须说清用的是哪个分母。
2. **`mode` 只记在 `session_start` 上，而 `toggleMultiplier()` 既不重置游戏也不计为结束。**
   用户可中途从 `standard` 切到 `custom`。查询 6 按 `session_start.mode` 分组，中途切过的人会被归错组。
   已新增 `mode_toggle` 事件（props：`to`、`idx`），查询 6 用它剔除中途切换的会话。
3. **`batch_press` 可能在 `session_start` 之前发出**（旧逻辑）。现已修复：`batchPress()` 先确保开局
   再发 `batch_press`。`rng_toggle` 仍可能发生在局外（它本身就是局外行为），因此它可能不属于任何一轮，
   落在轮次 CTE 区间之外，分析时按「局外事件」处理即可。
4. **`currentTrackRng()` 依赖 `quantumSource`**，而它只在真的取到量子随机数后才变成 `'quantum'`。
   首次 press 时大概率还是 `'pseudo'`，所以 `session_start.rng` 会系统性偏向 pseudo。
   分析 rng 对照时建议以 `rng_toggle` 事件为准，而不是 `session_start.rng`。
5. **beacon 预检。** 现有 `incrStat()` 的 sendBeacon 没有 body，是简单请求；新 SDK 的 beacon 带
   `application/json`，**需要 CORS 预检**。页面存活期间 5s 定时 flush 会把预检结果缓存下来
   （`WebConfig` 里 `maxAge(3600)`），但「打开页面按一下就立刻关掉」这种极短会话，卸载时的预检可能
   来不及完成而丢包。这是指定 `application/json` 带来的固有成本，不要改成 `text/plain`。
6. **`truncated` 的语义**：`press` 事件超过 300 条上限后停止记 press，但 `session_end` / `bankrupt`
   仍会发，且此时 `trackedPressCount >= PRESS_TRACK_LIMIT`，`session_end.truncated` 会置 1。
   查询 8 统计的是「有 session_end 收尾且 truncated=1」的局占比。
7. **`truncated` 有两个来源，force 收尾事件会被会话级标记覆盖。** (a) 游戏内的 300 条 press 上限
   （`trackedPressCount >= PRESS_TRACK_LIMIT`，每局重置，正确）；(b) SDK 的 600 条事件会话上限
   （`track.js` 的 `state.truncated`，**跨局、跨刷新持久化**，不会随 reset 清掉）。对 `session_end` /
   `bankrupt` / `session_hidden` 这类 `force:true` 事件，SDK 若此前命中过 600 上限，会用
   `stampTruncated` 把 `truncated:true` 打上去，**覆盖掉游戏按局算出的值**。结果是：若某会话在某局
   命中过 600 上限，后续每一局的 `truncated` 恒为 true。实际影响小（300 条 press 上限已提前停记，
   极难触到 600），但读查询 8 时要知道它统计的是「会话级被截断」而非严格按局。这是刻意保留的偏差，
   未改动 SDK 的 stamp 逻辑。

---

## wealth-button.sql 的查询清单

| # | 问题 | 备注 |
|---|---|---|
| 1 | 按下次数分布 | 桶分布，破产段不再被双计 |
| 2 | 破产前按了多少次 | 只筛 `bankrupt` |
| 3 | 破产前是否达到过里程碑 | `bankrupt` JOIN `milestone`，限定同轮区间 |
| 4 | 主动收手占比（★核心） | 分子只数 `reason IN ('reset','leave')` |
| 4b | 三类会话占比 | normal / hidden_only / no_ending |
| 5 | 首次 `win:false` 后是否继续按 | seq 限定同轮区间 |
| 6 | mode 对照 | 用 `mode_toggle` 剔除中途切换 |
| 7 | rng 对照 | 建议以 `rng_toggle` 为准 |
| 8 | truncated 占比 | 分母只用 `session_end` |