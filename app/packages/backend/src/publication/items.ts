// Public read layer, item level. Every exit (site API, v1, RSS, MCP, sitemap) reads
// items through these columns and views; which rows are public is decided by scope.ts.
import { CATEGORY_KEYS, toPublicApiCategory, type CategoryKey, type ChannelKey, type PublicApiCategoryKey } from "@aihot/contracts/taxonomy";
import { isChangeKind, type FeedItemSummary, type ItemSummary, type MediaView, type Pricing, type TimePrecision, type XPostView } from "@aihot/contracts/site";
import { POLICY } from "@aihot/site";
import { sql, type Db } from "../db.ts";
import { isChineseText } from "../lib/text.ts";
import { isEmptyOrLinkOnly } from "../content/posts.ts";
import { proxiedImage, proxiedImageSet } from "../media/imgproxy.ts";
import { sourceOwnsPost } from "../sources/account.ts";
import { displayTags, publicSourceName } from "./rules.ts";
import { foldableSelectionCondition, seatedCondition } from "./scope.ts";

export interface ItemRow {
  id: string;
  title: string;
  original_title: string | null;
  summary: string | null;
  reason: string | null;
  category: string | null;
  tags: string[];
  score: number | null;
  selected: boolean;
  channel: "news" | "x";
  /** What kind of change the report is (source-declared); null when the source doesn't say. */
  change_kind: string | null;
  /** Whether the source is a T1 first-party feed (sources.tier = 'T1'). */
  source_first_party?: boolean;
  url: string;
  published_at: Date | null;
  /** 原文声称的时间精度（articles.publication_time）：YYYY-MM-DD = 只有日期，ISO = 有时刻，null = 旧数据未记录。 */
  publication_time: string | null;
  /** 源配置是否声明每条时间就是事件时间（sources.config.publishedAtAuthoritative !== false）。 */
  published_at_trusted: boolean;
  discovered_at: Date;
  timeline_at: Date;
  /** Holds its fact's selected seat (publish.ts settleSeats). */
  seat: boolean;
  visibility: string;
  body_mode: "full" | "summary";
  indexable: boolean;
  fact_id: number | null;
  source_name: string;
  /** 厂商 id（sources.owner_entity_id）：来源行画公司标用。 */
  source_entity_id?: string | null;
  /** 源站时区（IANA），来自 sources.config.displayTimeZone；未声明的源为 null/缺省。 */
  source_time_zone?: string | null;
  /** Participation mode of the source now (editorial, hot_signal, isolated). */
  source_mode: string;
  x_post: Record<string, any> | null;
  /** Current source icon only when that account is this post's author. */
  author_avatar_url?: string | null;
  author: string | null;
  language: string | null;
  story_public_id: string | null;
  story_title: string | null;
  zh_text: string | null;
  /** Chinese translation of the post an X post quotes. */
  quoted_zh: string | null;
  /** analyses.output->'pricing': the structured price change written by the analyst, if any. */
  analysis_pricing: unknown;
}

/** Columns every item listing selects. Internal observation details never leave this layer. */
export const ITEM_COLUMNS = sql`
  p.article_id AS id, p.title, p.original_title, p.summary, p.reason, p.category, p.tags, p.score,
  an.output->'pricing' AS analysis_pricing,
  p.selected, p.seat, p.channel, p.change_kind, (s.tier = 'T1') AS source_first_party,
  p.url, p.published_at, p.discovered_at, p.timeline_at, p.visibility,
  a.publication_time, (coalesce(s.config->>'publishedAtAuthoritative', 'true') <> 'false') AS published_at_trusted,
  p.body_mode, p.indexable, p.fact_id, s.name AS source_name, s.owner_entity_id AS source_entity_id, s.participation_mode AS source_mode,
  s.config->>'displayTimeZone' AS source_time_zone,
  a.x_post, a.author, a.language,
  CASE WHEN s.kind = 'x_search' AND ${sourceOwnsPost(sql`s.config`, sql`a.x_post->>'handle'`)} THEN s.icon_url END AS author_avatar_url,
  st.public_id::text AS story_public_id, st.title AS story_title,
  CASE WHEN p.channel = 'x' THEN tr.body_text END AS zh_text, qt.text_zh AS quoted_zh`;

/** Public API listings never render article bodies, X media or story metadata. */
export type ApiItemRow = Pick<ItemRow, "id" | "title" | "original_title" | "summary" | "source_name" | "url" | "published_at" | "discovered_at" | "category" | "score" | "selected" | "reason">;
/** `selected` is the machine meaning: the report holds its fact's selected seat (scope.ts seatedCondition). */
export const API_ITEM_COLUMNS = sql`
  p.article_id AS id, p.title, p.original_title, p.summary, s.name AS source_name, p.url,
  p.published_at, p.discovered_at, p.category, p.score, (p.selected AND p.seat) AS selected, p.reason`;
export const API_ITEM_FROM = sql`FROM publications p JOIN sources s ON s.id = p.source_id`;

/** A translation of an older revision is left out: the original changed after it (the worker translates it again). */
export const ITEM_FROM = sql`
  FROM publications p
  JOIN sources s ON s.id = p.source_id
  JOIN articles a ON a.id = p.article_id
  LEFT JOIN analyses an ON an.id = p.analysis_id
  LEFT JOIN stories st ON st.id = p.story_id AND st.merged_into IS NULL
  LEFT JOIN translations tr ON tr.article_id = p.article_id AND tr.lang = 'zh' AND tr.revision >= a.revision
  LEFT JOIN quote_translations qt ON p.channel = 'x' AND qt.tweet_id = substring(a.x_post->'quoted'->>'url' from '/status/([0-9]+)')`;

export function channelCondition(channel: ChannelKey | null | undefined) {
  if (!channel || channel === "all") return sql``;
  if (channel === "firstParty") return sql`AND p.source_id IN (SELECT id FROM sources WHERE tier = 'T1')`;
  return sql`AND p.channel = ${channel}`;
}

/** The website's filter: one of its own categories. */
export function categoryCondition(category: CategoryKey | null | undefined) {
  if (!category) return sql``;
  return sql`AND p.category = ${category}`;
}

/** The public API's, RSS's and MCP's filter: every category the site publishes as this one (PUBLIC_CATEGORIES). */
export function publicCategoryCondition(category: PublicApiCategoryKey | null | undefined) {
  if (!category) return sql``;
  return sql`AND p.category IN ${sql(CATEGORY_KEYS.filter((k) => toPublicApiCategory(k) === category))}`;
}

export function tagCondition(tag: string | null | undefined) {
  if (!tag) return sql``;
  return sql`AND p.tags @> ${[tag]}::text[]`;
}

/** 变更类型筛选（源在 industry/sources.json 声明，采集落到每条资料）；null 不筛。 */
export function changeKindCondition(kind: string | null | undefined) {
  if (!kind) return sql``;
  return sql`AND p.change_kind = ${kind}`;
}

/** 未分类口径：列表与分类 tab 的「未分类」计数用同一个条件，tab 数之和才等于全部。 */
export function uncategorizedCondition(uncategorized: boolean | null | undefined) {
  if (!uncategorized) return sql``;
  return sql`AND p.category IS NULL`;
}

function mediaView(m: Record<string, any>, mode: "card" | "thumb" | "full" = "thumb", responsive = false): MediaView | null {
  const url = proxiedImage(m.url, mode);
  if (!url) return null;
  const srcSet = responsive ? proxiedImageSet(m.poster ?? m.url, mode === "full" ? "body" : "card") : null;
  return {
    kind: m.kind === "video" ? "video" : "image",
    url,
    ...(responsive && mode !== "full" ? { fullUrl: proxiedImage(m.url, "full")! } : {}),
    ...(srcSet ? { srcSet } : {}),
    width: typeof m.width === "number" ? m.width : null,
    height: typeof m.height === "number" ? m.height : null,
    alt: m.alt ?? null,
    poster: m.poster ? proxiedImage(m.poster, mode === "card" ? "card" : "thumb") : null,
  };
}

export function xView(row: Pick<ItemRow, "x_post" | "zh_text"> & Partial<Pick<ItemRow, "quoted_zh" | "author_avatar_url">>, compact = false, responsive = compact): XPostView | null {
  const x = row.x_post;
  if (!x) return null;
  const quoted = x.quoted && typeof x.quoted === "object"
    ? {
      authorName: String(x.quoted.authorName ?? ""), handle: String(x.quoted.handle ?? ""), text: String(x.quoted.text ?? ""), url: String(x.quoted.url ?? ""),
      translation: !isEmptyOrLinkOnly(String(x.quoted.text ?? "")) && row.quoted_zh && row.quoted_zh.trim() !== String(x.quoted.text ?? "").trim() ? row.quoted_zh : null,
    }
    : null;
  const media = ((x.media ?? []) as Array<Record<string, any>>)
    .map((raw) => ({ raw, view: mediaView(raw, compact || !responsive ? "thumb" : "full", responsive) }))
    .filter((entry): entry is { raw: Record<string, any>; view: MediaView } => entry.view !== null);
  const avatarUrl = row.author_avatar_url ?? x.avatarUrl;
  const avatarSrcSet = responsive ? proxiedImageSet(avatarUrl, "avatar") : null;
  return {
    authorName: String(x.authorName ?? x.handle ?? ""),
    handle: String(x.handle ?? ""),
    avatarUrl: proxiedImage(avatarUrl, "avatar"),
    ...(avatarSrcSet ? { avatarSrcSet } : {}),
    text: String(x.text ?? ""),
    translation: !isEmptyOrLinkOnly(String(x.text ?? "")) && row.zh_text && row.zh_text.trim() !== String(x.text ?? "").trim() ? row.zh_text : null,
    quoted,
    // A multi-image list grid is 112 CSS px wide; one image can be 240 px. Keep 3x pixels for both.
    // Detail retains full media for the lightbox; srcSet bounds the displayed image.
    media: media.map(({ raw, view }) => compact && media.length > 1 ? mediaView(raw, "card", responsive)! : view),
  };
}

/**
 * Whether pages show an X post's own text and media. A site that counts them as full text shows them
 * only where the source allows full text, as it does an article's body.
 */
export function showsPost(row: { channel: string; body_mode: string }): boolean {
  return row.channel === "x" && (!POLICY.xPostIsFullText || row.body_mode === "full");
}

/**
 * 原文时间的精度：只标日期的源（publication_time 为 YYYY-MM-DD）不能显示成精确时刻；
 * 旧数据没有记录精度时按 unknown 处理，页面不会凭空宣称精确。
 */
export function publicationPrecisionAt(publishedAt: Date | null, publicationTime: string | null): TimePrecision | null {
  if (!publishedAt) return null;
  if (!publicationTime) return "unknown";
  return /^\d{4}-\d{2}-\d{2}$/.test(publicationTime) ? "date" : "exact";
}

/**
 * 事件时间的精度跟它取自哪个时钟走：等于原文时间时沿用原文精度（日期就只能是日期）；
 * 等于首次发现时是真实时刻。旧数据没记录原文精度，按 unknown 展示完整时刻。
 */
export function timelinePrecisionAt(publishedAt: Date | null, timelineAt: Date, publicationTime: string | null): TimePrecision {
  if (!publishedAt || publishedAt.getTime() !== timelineAt.getTime()) return "exact";
  return publicationPrecisionAt(publishedAt, publicationTime) ?? "exact";
}

/** The shared public article; its X post is added as each answer shows it. */
export function toItemSummary(row: ItemRow): ItemSummary {
  return {
    id: row.id,
    title: row.title,
    originalTitle: row.original_title,
    summary: row.summary,
    reason: row.selected ? row.reason : null,
    source: { name: publicSourceName(row.source_name), ...(row.source_entity_id ? { entityId: row.source_entity_id } : {}) },
    links: { original: row.url },
    publishedAt: row.published_at?.toISOString() ?? null,
    discoveredAt: row.discovered_at.toISOString(),
    timelineAt: row.timeline_at.toISOString(),
    publishedAtPrecision: publicationPrecisionAt(row.published_at, row.publication_time),
    timelineAtPrecision: timelinePrecisionAt(row.published_at, row.timeline_at, row.publication_time),
    publishedAtTrusted: row.published_at_trusted,
    category: (row.category as CategoryKey | null) ?? null,
    tags: displayTags(row.tags),
    score: row.score === null ? null : Math.round(Number(row.score)),
    selected: row.selected,
    channel: row.channel,
    firstParty: row.source_first_party ?? false,
    changeKind: isChangeKind(row.change_kind) ? row.change_kind : null,
    story: row.story_public_id ? { publicId: row.story_public_id, title: row.story_title ?? "" } : null,
  };
}

/**
 * A structured price change from the analyst's output, if it is complete enough to print: at least one
 * row, at most six, every row carrying a label, an old and a new price. Missing or malformed JSON means
 * no pricing key at all, so callers render the ordinary summary.
 */
export function publicPricing(raw: unknown): Pricing | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rowsRaw = (raw as { rows?: unknown }).rows;
  if (!Array.isArray(rowsRaw)) return null;
  const rows = rowsRaw.flatMap((row): Pricing["rows"] => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return [];
    const { label, before, after } = row as Record<string, unknown>;
    const fields = [label, before, after].map((v) => (typeof v === "string" ? v.trim() : ""));
    if (fields.some((v) => !v)) return [];
    return [{ label: fields[0]!, before: fields[1]!, after: fields[2]! }];
  }).slice(0, 6);
  if (rows.length === 0) return null;
  const effectiveRaw = (raw as { effectiveAt?: unknown }).effectiveAt;
  const effectiveAt = typeof effectiveRaw === "string" && effectiveRaw.trim() ? effectiveRaw.trim() : undefined;
  return { rows, ...(effectiveAt ? { effectiveAt } : {}) };
}

/** Project the shared public article into the exact fields a site card renders. */
export function toFeedItemSummary(row: ItemRow): FeedItemSummary {
  const item = toItemSummary(row);
  const x = showsPost(row) ? xView(row, true) : null;
  const pricing = publicPricing(row.analysis_pricing);
  return {
    id: item.id, title: item.title, summary: item.summary ?? (x?.text || null), reason: item.reason,
    ...(pricing ? { pricing } : {}),
    source: item.source, publishedAt: item.publishedAt, discoveredAt: item.discoveredAt, timelineAt: item.timelineAt,
    publishedAtPrecision: item.publishedAtPrecision, timelineAtPrecision: item.timelineAtPrecision,
    publishedAtTrusted: item.publishedAtTrusted,
    category: item.category, tags: item.tags, score: item.score, selected: item.selected, channel: item.channel,
    changeKind: item.changeKind,
    x: x ? {
      authorName: x.authorName, handle: x.handle, avatarUrl: x.avatarUrl,
      ...(x.avatarSrcSet ? { avatarSrcSet: x.avatarSrcSet } : {}), media: x.media,
      quoted: x.quoted ? { authorName: x.quoted.authorName, handle: x.quoted.handle, text: x.quoted.text, translation: x.quoted.translation } : null,
    } : null,
  };
}

/**
 * Every exit uses the same language decision as writing and translation.
 */
export function isChineseBody(a: { language?: string | null; body_text?: string | null }): boolean {
  return isChineseText(a.body_text ?? "", a.language);
}

/** The complete Chinese translation an export (Markdown, full RSS) carries; a page also shows a partial one. */
export function exportTranslation(a: { language?: string | null; body_text?: string | null; tr_html?: string | null; tr_complete?: boolean | null }): string | null {
  return !isChineseBody(a) && a.tr_html && a.tr_complete ? a.tr_html : null;
}

/**
 * For listed rows that are selected but yield their fact's seat: the report holding it, by row id.
 * (The home timeline folds these into reading groups; flat lists say which report stands for them.)
 */
export async function seatHolders(rows: ItemRow[], now: Date, db: Db = sql): Promise<Map<string, { id: string; title: string }>> {
  const yielding = rows.filter((r) => r.selected && !r.seat && r.fact_id !== null);
  if (!yielding.length) return new Map();
  const holders = await db<{ fact_id: number; id: string; title: string }[]>`
    SELECT p.fact_id, p.article_id AS id, p.title FROM publications p
    WHERE p.fact_id IN ${db([...new Set(yielding.map((r) => r.fact_id!))])} AND ${seatedCondition(now)} AND ${foldableSelectionCondition()}`;
  const byFact = new Map(holders.map((h) => [Number(h.fact_id), { id: h.id, title: h.title }]));
  return new Map(yielding.flatMap((r) => (byFact.has(Number(r.fact_id)) ? [[r.id, byFact.get(Number(r.fact_id))!] as const] : [])));
}
