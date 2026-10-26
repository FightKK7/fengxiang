# 上线前数据清洗与治理

> 状态：当前有效 · 最后核对：2026-10-23

## 口径

- 列表的时间是「本站收录时间」（`publications.discovered_at`）；详情页显示「事件时间」（`timeline_at`）。
- 首次导入会回填历史：默认最多 30 条、12 个月内（`config._aihot.initialBackfillLimit / initialBackfillMonths`）。
  这些旧内容的收录时间都是"今天"，如果也进公开列表，今天的时间线就会塞满历史版本，看起来是乱的。

## 治理规则

1. **陈旧回填只存档**：`backfill` 且原文发布时间比首次收录早 48 小时以上的条目，详情页仍可读，
   但不进首页时间线与 `/all` 搜索。规则在 `packages/backend/src/publication/scope.ts` 的
   `listedFeedCondition`（在 `listedCondition` 之上加一条）；报告证据、热门、RSS/v1 与后台仍按
   `listedCondition` 读取，不受影响。
2. **同一次抓取的并列时间**：列表按收录时间倒序；同一秒收录的一批条目再按事件时间倒序
   （`packages/backend/src/publication/pool.ts`），不会出现"越往下越新"。
3. **采集事实不重写**：治理不改 `discovered_at` / `published_at` / `timeline_at`，只决定"哪些上公开列表"。
4. 48 小时判据与 `content/materials.ts` 的 `STALE_ON_DISCOVERY_MS` 一致；要改窗口两处一起改。

## 上线前核对

```bash
node --env-file-if-exists=.env scripts/governance.ts          # 只读核对
node --env-file-if-exists=.env scripts/governance.ts --apply  # 核对 + 写审计记录（不改数据）
```

输出公开列表可见条数、被规则挡在列表外的陈旧回填条数、同一次抓取里并列的时间点组数（最大一组几条）。
核对通过的条件：公开但列表不可见的条目全部是"陈旧回填"（没有未发布、未来时间的意外漏网）。

## 边界

- 只影响首页时间线与 `/all` 搜索；详情页（`/items/:id`）、报告证据、热门、RSS/v1、后台、审计记录都保留。
- 不删数据；要恢复某条可见，把它的回填标记消除（重新核对日期）即可，不需要改列表规则。
- 新源首次导入时仍会回填历史（供存档与补全），但陈旧部分不会出现在今天的时间线里。
