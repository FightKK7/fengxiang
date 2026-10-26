// Public scope at read time. Every query that decides whether a report is public now,
// listed, selected, or evidence of its fact uses these predicates over `publications p` (and, for
// evidence, `fact_articles fa`); no other module spells visibility, the release time or the composite
// rule in SQL, and grouping takes the composite rule from here too. What a publication holds is
// derived once, at publish time, by publish.ts and rules.ts.
import { sql } from "../db.ts";
import { independentSelectedSources } from './rules.ts';

/** These reports share their fact's display slot; independent sources keep their own selected card. */
export function foldableSelectionCondition() {
  return sql`(NOT p.selected OR p.source_id <> ALL(${independentSelectedSources()}::text[]))`;
}

/**
 * A public surface never prints a time ahead of the reader's clock. A source's clock can run up to an
 * hour ahead of discovery (materials.ts FUTURE_TOLERANCE_MS), so the item waits for that time instead
 * of being listed with a future clock. Nothing else writes a future timeline: a scheduled post keeps
 * its stated time as a claim until it arrives (fillScheduledPublications), not as published_at.
 */
export function notFutureCondition(now: Date) {
  return sql`p.timeline_at <= ${now}`;
}

/**
 * Only confirmed news enters p.selected (publish.ts). The release timestamp also supports
 * historical imports and ensures every outlet uses the same actual publication time.
 */
export function releasedCondition(now: Date) {
  return sql`(NOT p.selected OR p.visible_after <= ${now}) AND ${notFutureCondition(now)}`;
}

/**
 * Listed on public surfaces at `now`: public, pool eligible, and released by then. Every item of a
 * collection run is its own entry — a bulk roadmap import is not folded into one group (2026-10-23：
 * 同源一次抓取的多条不再折叠，逐条出现在时间线、搜索、RSS 与 v1 API 里）。
 */
export function listedCondition(now: Date) {
  return sql`p.visibility = 'public' AND p.eligible AND ${releasedCondition(now)}`;
}

/**
 * 时间线与搜索（首页、/all）用的口径：在 listedCondition 之上，把"陈旧回填"挡在外面。
 *
 * 上线前治理（2026-10-23）：首次导入/窗口外的历史回填，其原文发布时间比本站第一次收录早
 * 48 小时以上时只做存档（详情页可读），不再占今天的时间线。判据与 materials.ts 的
 * STALE_ON_DISCOVERY_MS 一致。报告证据、热门、RSS/v1 仍走 listedCondition，不受影响。
 */
export function listedFeedCondition(now: Date) {
  return sql`${listedCondition(now)}
    AND (NOT p.backfill OR p.published_at IS NULL OR p.discovered_at - p.published_at <= interval '48 hours')`;
}

/** Story reports include older editorial material outside the pool, but never withdrawn or not yet released content. */
export function storyReportCondition(now: Date) {
  return sql`p.visibility = 'public' AND s.participation_mode = 'editorial' AND ${releasedCondition(now)}`;
}

/** Selected set as the website shows it (home timeline, reading groups, topics): every selected report. */
export function selectedCondition(now: Date) {
  return sql`p.visibility = 'public' AND p.selected AND p.visible_after <= ${now} AND ${notFutureCondition(now)}`;
}

/**
 * The selected set as machines receive it (v1, RSS, the sync ledger): the representative of ordinary
 * reports of each fact, plus any independently displayed selected articles (publish.ts settleSeats).
 */
export function seatedCondition(now: Date) {
  return sql`p.visibility = 'public' AND p.selected AND p.seat AND p.visible_after <= ${now} AND ${notFutureCondition(now)}`;
}

/** The report was published from a composite (multi-topic) analysis: it only mentions facts. */
export function compositeCondition() {
  return sql`EXISTS (SELECT 1 FROM analyses evidence_an WHERE evidence_an.id = p.analysis_id AND evidence_an.output->>'scope' = 'composite')`;
}

/**
 * The same rule over the latest analysis of report `article`, for grouping (recall, story roots,
 * consolidation) and for publish.ts when it picks a publication's fact. They decide from the newest
 * analysis, which `p.analysis_id` only points to once the publication is rebuilt from it, and recall
 * also meets reports without a publication. Missing scope is unknown, never composite.
 */
export function latestCompositeCondition(article: ReturnType<typeof sql>) {
  return sql`(SELECT scope_analysis.output->>'scope' = 'composite' FROM analyses scope_analysis
    WHERE scope_analysis.article_id = ${article}
    ORDER BY scope_analysis.input_revision DESC, scope_analysis.id DESC LIMIT 1) IS TRUE`;
}

/**
 * Evidence for a later identity decision: not a composite and not explicitly withdrawn.
 * A summary-only report or one awaiting publication keeps its existing eligibility.
 * Historical memberships and judgements are retained independently of this predicate.
 */
export function groupingEvidenceCondition(article: ReturnType<typeof sql>) {
  return sql`NOT ${latestCompositeCondition(article)} AND NOT EXISTS (
    SELECT 1 FROM publications grouping_publication
    WHERE grouping_publication.article_id = ${article} AND grouping_publication.visibility = 'withdrawn')`;
}

/** `fa` links report `p` to a fact as evidence: a primary or report membership, never a composite. */
export function evidenceCondition() {
  return sql`fa.role <> 'mention' AND NOT ${compositeCondition()}`;
}

/**
 * Report `p` is still evidence of its own fact (`publications.fact_id`, written at publish time): a
 * membership removed or turned into a mention since then no longer counts.
 */
export function ownFactEvidenceCondition() {
  return sql`EXISTS (SELECT 1 FROM fact_articles fa WHERE fa.fact_id = p.fact_id AND fa.article_id = p.article_id AND ${evidenceCondition()})`;
}
