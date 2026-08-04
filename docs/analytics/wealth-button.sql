-- ============================================================================
-- wealth-button-paradox 通用行为埋点分析 SQL
--
-- 数据来源：demo_events 表（所有 demo 共用，见 numfeel-service/src/main/resources/schema.sql）。
-- 事件口径请看 docs/analytics/README.md「事件口径：什么算一局」一节。
--
-- 关键口径（务必贯穿全部查询）：
--   * session_end 是「一局结束」的唯一标记，reason 区分结局（reset / leave / bankrupt）。
--     每轮恰好 0 或 1 条，统计「局数」一律只用 session_end。
--   * bankrupt 事件只用于取破产专属字段（破产时的 press / idx / peak），不参与局数计算。
--   * session_hidden 是切后台的兜底，不结束一局，局数只认 session_end。
--
-- 每条 SQL 都内联了自己的 round CTE，可以单独复制出来直接跑。
-- 依赖 MySQL 8（WITH 语法）。
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 标准的「轮次」CTE：把每个 session_start 与它那一轮的 session_end 成对关联。
-- 输出：session_id, round_seq_start, round_seq_end, mode, rng, initial_wealth,
--       reason, presses, final_wealth, peak_wealth, peak_idx, win_count, truncated, ip_hash
--
-- 关联规则：每个 session_start 配「它之后最早的一条 session_end」。
-- 这样多轮会话（同一 session_id 内多次 session_start）每轮恰好一行，不会笛卡尔积。
-- ----------------------------------------------------------------------------
-- WITH round AS (
--   SELECT
--     ss.session_id,
--     ss.seq AS round_seq_start,
--     se.seq AS round_seq_end,
--     ss.props->>'$.initialWealth' AS initial_wealth,
--     ss.props->>'$.mode' AS mode,
--     ss.props->>'$.rng' AS rng,
--     se.props->>'$.reason' AS reason,
--     se.props->>'$.presses' AS presses,
--     se.props->>'$.finalWealth' AS final_wealth,
--     se.props->>'$.peakWealth' AS peak_wealth,
--     se.props->>'$.peakIdx' AS peak_idx,
--     se.props->>'$.winCount' AS win_count,
--     se.props->>'$.truncated' AS truncated,
--     ss.ip_hash
--   FROM demo_events ss
--   JOIN demo_events se
--     ON se.session_id = ss.session_id
--    AND se.event_name = 'session_end'
--    AND se.seq = (
--      SELECT MIN(se2.seq)
--      FROM demo_events se2
--      WHERE se2.session_id = ss.session_id
--        AND se2.event_name = 'session_end'
--        AND se2.seq >= ss.seq
--    )
--   WHERE ss.event_name = 'session_start'
-- )
-- ----------------------------------------------------------------------------


-- ============================================================================
-- 查询 1：按下次数分布
-- 要回答的问题：一局通常按多少下？按到多少下最容易走到破产收尾？
-- 口径：局数 = session_end 计数（不再把 bankrupt 数两遍）。
-- ============================================================================
WITH round AS (
  SELECT
    ss.session_id,
    ss.seq AS round_seq_start,
    se.seq AS round_seq_end,
    se.props->>'$.reason' AS reason,
    se.props->>'$.presses' AS presses
  FROM demo_events ss
  JOIN demo_events se
    ON se.session_id = ss.session_id
   AND se.event_name = 'session_end'
   AND se.seq = (
     SELECT MIN(se2.seq)
     FROM demo_events se2
     WHERE se2.session_id = ss.session_id
       AND se2.event_name = 'session_end'
       AND se2.seq >= ss.seq
   )
  WHERE ss.event_name = 'session_start'
)
SELECT
  CASE
    WHEN presses <= 5 THEN '1-5'
    WHEN presses <= 15 THEN '6-15'
    WHEN presses <= 30 THEN '16-30'
    WHEN presses <= 60 THEN '31-60'
    WHEN presses <= 100 THEN '61-100'
    ELSE '100+'
  END AS press_bucket,
  COUNT(*) AS round_count,
  SUM(reason = 'bankrupt') AS bankrupt_rounds,
  ROUND(SUM(reason = 'bankrupt') / COUNT(*) * 100, 1) AS bankrupt_pct
FROM round
GROUP BY press_bucket
ORDER BY press_bucket;


-- ============================================================================
-- 查询 2：破产前按了多少次
-- 要回答的问题：走到破产的人，平均／分布上按了多少下？
-- 口径：只筛 event_name='bankrupt'（破产专属字段 presses 已经等于该局的 pressCount），
--       不参与局数统计，保持不动。
-- ============================================================================
SELECT
  COUNT(*) AS bankrupt_count,
  ROUND(AVG(props->>'$.presses'), 1) AS avg_presses_before_bankrupt,
  MIN(props->>'$.presses') AS min_presses,
  MAX(props->>'$.presses') AS max_presses
FROM demo_events
WHERE event_name = 'bankrupt';


-- ============================================================================
-- 查询 3：破产前是否达到过里程碑（x10 / x100 / billionaire）
-- 要回答的问题：有没有人「到顶之后又按回破产」？这是原文最想讲的故事。
-- 口径：bankrupt 与 milestone 按 session_id + 轮次区间关联（防止不同轮次混算）。
-- ============================================================================
WITH round AS (
  SELECT
    ss.session_id,
    ss.seq AS round_seq_start,
    se.seq AS round_seq_end
  FROM demo_events ss
  JOIN demo_events se
    ON se.session_id = ss.session_id
   AND se.event_name = 'session_end'
   AND se.seq = (
     SELECT MIN(se2.seq)
     FROM demo_events se2
     WHERE se2.session_id = ss.session_id
       AND se2.event_name = 'session_end'
       AND se2.seq >= ss.seq
   )
  WHERE ss.event_name = 'session_start'
)
SELECT
  m.props->>'$.type' AS milestone_type,
  COUNT(DISTINCT bk.session_id, bk.id) AS bankrupt_rounds_with_milestone
FROM demo_events bk
JOIN round r
  ON r.session_id = bk.session_id
 AND bk.event_name = 'bankrupt'
 AND bk.seq >= r.round_seq_start
 AND bk.seq <= r.round_seq_end
JOIN demo_events m
  ON m.session_id = bk.session_id
 AND m.event_name = 'milestone'
 AND m.seq >= r.round_seq_start
 AND m.seq <= r.round_seq_end
GROUP BY m.props->>'$.type';


-- ============================================================================
-- 查询 4：主动收手占比（★核心派生指标）
-- 要回答的问题：玩家里有多少是「主动收手」（能在赢的时候停手）而不是「被迫破产」？
-- 口径：分子只数 reason IN ('reset','leave')；分母 = 全部有 session_end 收尾的局数。
--       破产局只算一次（session_end(reason='bankrupt')），不再叠加 bankrupt 事件。
-- 输出：voluntary_stop_pct + 三类会话的数量与占比（见 README「会话分类」）。
-- ============================================================================
WITH round AS (
  SELECT
    ss.session_id,
    ss.seq AS round_seq_start,
    se.seq AS round_seq_end,
    se.props->>'$.reason' AS reason
  FROM demo_events ss
  JOIN demo_events se
    ON se.session_id = ss.session_id
   AND se.event_name = 'session_end'
   AND se.seq = (
     SELECT MIN(se2.seq)
     FROM demo_events se2
     WHERE se2.session_id = ss.session_id
       AND se2.event_name = 'session_end'
       AND se2.seq >= ss.seq
   )
  WHERE ss.event_name = 'session_start'
)
SELECT
  COUNT(*) AS total_rounds,
  SUM(reason IN ('reset', 'leave')) AS voluntary_stop_rounds,
  ROUND(SUM(reason IN ('reset', 'leave')) / COUNT(*) * 100, 1) AS voluntary_stop_pct,
  SUM(reason = 'bankrupt') AS bankrupt_rounds,
  ROUND(SUM(reason = 'bankrupt') / COUNT(*) * 100, 1) AS bankrupt_pct
FROM round;


-- 查询 4 补充：三类会话（有 session_end 收尾 / 只有 session_hidden 兜底 / 完全无收尾）
-- 说明：session_hidden 是切后台兜底。有 session_end 的会话正常收尾；只有 session_hidden
--       多为 iOS Safari 上 pagehide 未触发；完全无收尾多为极短会话 / 页面被强杀。
--       把后两类单独列出来，避免「主动收手占比」被无声地低估。
WITH round AS (
  SELECT
    ss.session_id,
    ss.seq AS round_seq_start,
    se.seq AS round_seq_end,
    se.props->>'$.reason' AS reason
  FROM demo_events ss
  JOIN demo_events se
    ON se.session_id = ss.session_id
   AND se.event_name = 'session_end'
   AND se.seq = (
     SELECT MIN(se2.seq)
     FROM demo_events se2
     WHERE se2.session_id = ss.session_id
       AND se2.event_name = 'session_end'
       AND se2.seq >= ss.seq
   )
  WHERE ss.event_name = 'session_start'
),
session_class AS (
  SELECT
    r.session_id,
    CASE
      WHEN COUNT(se.id) > 0 THEN 'normal'                        -- 有 session_end 正常收尾
      WHEN COUNT(h.id) > 0 THEN 'hidden_only'                    -- 只有 session_hidden 兜底
      ELSE 'no_ending'                                           -- 完全无收尾
    END AS sclass
  FROM round r
  LEFT JOIN demo_events se ON se.session_id = r.session_id AND se.event_name = 'session_end'
  LEFT JOIN demo_events h  ON h.session_id  = r.session_id AND h.event_name  = 'session_hidden'
  GROUP BY r.session_id
)
SELECT
  sclass,
  COUNT(*) AS session_count,
  ROUND(COUNT(*) / (SELECT COUNT(*) FROM session_class) * 100, 1) AS pct
FROM session_class
GROUP BY sclass;


-- ============================================================================
-- 查询 5：首次 win:false 之后是否继续按
-- 要回答的问题：第一次输掉之后，玩家是停手还是继续？——「沉没成本」/「赌徒谬误」的探针。
-- 口径：seq 比较必须限定在【同一轮】的 [round_seq_start, round_seq_end] 区间内，
--       否则多轮会话会把上一轮的 press 算进来。
-- 已知混淆：本查询的「stopped」里混了「主动不按了」和「这一按之后很快破产了」两种人，
--           建议用 reason 再切一刀区分（见 README 已知偏差）。
-- ============================================================================
WITH round AS (
  SELECT
    ss.session_id,
    ss.seq AS round_seq_start,
    se.seq AS round_seq_end,
    se.props->>'$.reason' AS reason
  FROM demo_events ss
  JOIN demo_events se
    ON se.session_id = ss.session_id
   AND se.event_name = 'session_end'
   AND se.seq = (
     SELECT MIN(se2.seq)
     FROM demo_events se2
     WHERE se2.session_id = ss.session_id
       AND se2.event_name = 'session_end'
       AND se2.seq >= ss.seq
   )
  WHERE ss.event_name = 'session_start'
),
first_loss AS (
  SELECT
    r.session_id,
    r.round_seq_start,
    r.round_seq_end,
    r.reason,
    MIN(p.seq) AS first_loss_seq
  FROM round r
  JOIN demo_events p
    ON p.session_id = r.session_id
   AND p.event_name = 'press'
   AND p.props->>'$.win' = 0
   AND p.seq >= r.round_seq_start
   AND p.seq <= r.round_seq_end
  GROUP BY r.session_id, r.round_seq_start, r.round_seq_end, r.reason
)
SELECT
  CASE
    WHEN fl.first_loss_seq IS NULL THEN 'never_lost'
    WHEN fl.first_loss_seq = fl.round_seq_end THEN 'stopped_after_first_loss'
    ELSE 'continued_after_first_loss'
  END AS behavior,
  COUNT(*) AS round_count
FROM round r
LEFT JOIN first_loss fl
  ON fl.session_id = r.session_id
 AND fl.round_seq_start = r.round_seq_start
GROUP BY behavior;


-- ============================================================================
-- 查询 6：mode 对照（standard / custom）
-- 要回答的问题：标准倍率（x9/x0.1）和自定义倍率（x1.1/x0.9）下的破产率、均按次数差多少？
-- 口径：mode 记在 session_start 上；中途切过 mode 的会话会被归错组，用 mode_toggle 剔除。
-- ============================================================================
WITH round AS (
  SELECT
    ss.session_id,
    ss.seq AS round_seq_start,
    se.seq AS round_seq_end,
    ss.props->>'$.mode' AS mode,
    se.props->>'$.reason' AS reason,
    se.props->>'$.presses' AS presses
  FROM demo_events ss
  JOIN demo_events se
    ON se.session_id = ss.session_id
   AND se.event_name = 'session_end'
   AND se.seq = (
     SELECT MIN(se2.seq)
     FROM demo_events se2
     WHERE se2.session_id = ss.session_id
       AND se2.event_name = 'session_end'
       AND se2.seq >= ss.seq
   )
  WHERE ss.event_name = 'session_start'
)
SELECT
  mode,
  COUNT(*) AS round_count,
  SUM(reason = 'bankrupt') AS bankrupt_count,
  ROUND(SUM(reason = 'bankrupt') / COUNT(*) * 100, 1) AS bankrupt_pct,
  ROUND(AVG(presses), 1) AS avg_presses
FROM round
-- 剔除「中途切过 mode」的会话（该轮区间内出现过 mode_toggle），避免归错组
WHERE session_id NOT IN (
  SELECT DISTINCT t.session_id
  FROM demo_events t
  WHERE t.event_name = 'mode_toggle'
    AND t.seq >= round.round_seq_start
    AND t.seq <= round.round_seq_end
)
GROUP BY mode;


-- ============================================================================
-- 查询 7：rng 对照
-- 要回答的问题：伪随机 vs 量子真随机，破产率 / 均按次数有差异吗？
-- 口径：rng 记在 session_start 上；首次 press 时大概率还是 pseudo（见 README 已知偏差），
--       分析 rng 对照时建议以 rng_toggle 事件为准。
-- ============================================================================
WITH round AS (
  SELECT
    ss.session_id,
    ss.seq AS round_seq_start,
    se.seq AS round_seq_end,
    ss.props->>'$.rng' AS rng,
    se.props->>'$.reason' AS reason,
    se.props->>'$.presses' AS presses
  FROM demo_events ss
  JOIN demo_events se
    ON se.session_id = ss.session_id
   AND se.event_name = 'session_end'
   AND se.seq = (
     SELECT MIN(se2.seq)
     FROM demo_events se2
     WHERE se2.session_id = ss.session_id
       AND se2.event_name = 'session_end'
       AND se2.seq >= ss.seq
   )
  WHERE ss.event_name = 'session_start'
)
SELECT
  rng,
  COUNT(*) AS round_count,
  SUM(reason = 'bankrupt') AS bankrupt_count,
  ROUND(SUM(reason = 'bankrupt') / COUNT(*) * 100, 1) AS bankrupt_pct,
  ROUND(AVG(presses), 1) AS avg_presses
FROM round
GROUP BY rng;


-- ============================================================================
-- 查询 8：truncated 占比
-- 要回答的问题：有多少局因为 press 事件超过 300 条上限而漏记了过程？
-- 口径：局数 = session_end 计数（不再用 IN ('bankrupt','session_end') 虚高分母）。
-- ============================================================================
WITH round AS (
  SELECT
    ss.session_id,
    ss.seq AS round_seq_start,
    se.seq AS round_seq_end,
    se.props->>'$.truncated' AS truncated
  FROM demo_events ss
  JOIN demo_events se
    ON se.session_id = ss.session_id
   AND se.event_name = 'session_end'
   AND se.seq = (
     SELECT MIN(se2.seq)
     FROM demo_events se2
     WHERE se2.session_id = ss.session_id
       AND se2.event_name = 'session_end'
       AND se2.seq >= ss.seq
   )
  WHERE ss.event_name = 'session_start'
)
SELECT
  COUNT(*) AS total_ended,
  SUM(truncated = 1) AS truncated_rounds,
  ROUND(SUM(truncated = 1) / COUNT(*) * 100, 2) AS truncated_pct
FROM round;