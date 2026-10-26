// Topics: stable slugs in three groups (companies, directions, content forms), defined by the industry
// pack (industry/topics.json) and read from there when the process starts. Which reports a topic takes
// is one SQL predicate, `membership`: a direction or a form takes its tags; a company takes the reports
// it is a subject of, but not those that only mention it — among several subject companies, its name must
// appear in the Chinese or the original title. Lists and counts read the public listed set — the same set
// as /all and the home timeline — by discovered time, so the directory matches what readers can open.
import type { CategoryKey } from "@aihot/contracts/taxonomy";
import type {
  Brand, TopicGroup, TopicGroupKey, TopicLink, TopicPage, TopicSummary, TopicsResponse, TimePrecision,
} from "@aihot/contracts/site";
import { readFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "../config.ts";
import { sql } from "../db.ts";
import { ENTITIES, entityNames } from "../editorial/vocabulary.ts";
import { cached } from "../lib/cache.ts";
import { sha256, stableJson } from "../lib/ids.ts";
import { serverModules } from "../modules.ts";
import { ITEM_COLUMNS, ITEM_FROM, timelinePrecisionAt, toFeedItemSummary, type ItemRow } from "./items.ts";
import { evidenceCondition, listedCondition, ownFactEvidenceCondition, selectedCondition, storyReportCondition } from "./scope.ts";

export interface Topic {
  slug: string;
  name: string;
  group: TopicGroupKey;
  definition: string;
  /** Companies: the subject id (industry/taxonomy.ts ENTITIES). */
  entityId: string | null;
  /** Tags that put a report in the topic: a company's subject tag, a direction's or a form's tags. */
  tags: string[];
  /** Companies: a title naming the company by any of its names (a PostgreSQL regular expression). */
  pattern: string | null;
  /** Companies: what a whole search query may call it. */
  aliases: string[];
}

interface TopicFile {
  groups: TopicGroup[];
  topics: Array<{
    slug: string; name: string; group: TopicGroupKey; entityId?: string; aliases?: string[]; tags?: string[]; definition: string;
  }>;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const nameParts = (name: string) => name.split("/").map((s) => s.trim()).filter(Boolean);

/** Any name of the company: the topic's name and its parts, the subject's names. Latin names match as whole words. */
function titlePattern(name: string, entityId: string): string {
  const e = ENTITIES[entityId];
  const names = new Set([name, ...nameParts(name), ...(e ? entityNames(e) : [])]);
  return `(?<![A-Za-z])(${[...names].map(escape).join("|")})(?![A-Za-z])`;
}

const file = JSON.parse(readFileSync(path.join(REPO_ROOT, "industry/topics.json"), "utf8")) as TopicFile;

export const TOPIC_GROUPS: TopicGroup[] = file.groups;

export const TOPICS: Topic[] = file.topics.map((t) => ({
  slug: t.slug,
  name: t.name,
  group: t.group,
  definition: t.definition,
  entityId: t.entityId ?? null,
  tags: t.entityId ? [`entity:${t.entityId}`] : (t.tags ?? []),
  pattern: t.entityId ? titlePattern(t.name, t.entityId) : null,
  aliases: t.entityId ? [t.slug, t.name, ...nameParts(t.name), ...(t.aliases ?? [])] : [],
}));

const BY_SLUG = new Map(TOPICS.map((t, position) => [t.slug, { topic: t, position }]));

export function findTopic(slug: string): Topic | null {
  return BY_SLUG.get(slug)?.topic ?? null;
}

const position = (slug: string) => BY_SLUG.get(slug)?.position ?? Number.MAX_SAFE_INTEGER;

export function topicLinks(slugs: string[]): TopicLink[] {
  return slugs.map((s) => findTopic(s)).filter((t): t is Topic => !!t).map((t) => ({ slug: t.slug, name: t.name }));
}

/** Stable browse links in the same order as the topic directory, without its counts or modules. */
export function topicBrowseLinks() {
  return TOPICS.map(({ slug, name, group }) => ({ slug, name, group }));
}

/** One membership rule for topic discovery and a single topic's page and count. */
function topicMatch(tags: ReturnType<typeof sql>, pattern: ReturnType<typeof sql>) {
  return sql`p.tags && ${tags} AND (${pattern} IS NULL OR p.title ~* ${pattern} OR coalesce(p.original_title, '') ~* ${pattern}
    OR (SELECT count(*) FROM unnest(p.tags) AS e(tag) WHERE e.tag LIKE 'entity:%') = 1)`;
}

/**
 * The topics report `p` belongs to, in topic order: its tags meet the topic's and, for a company, the
 * title names it or it is the report's only subject company.
 */
export function topicMembership(topics: Topic[] = TOPICS) {
  const rows = topics.map((t) => ({ slug: t.slug, tags: t.tags, pattern: t.pattern, position: position(t.slug) }));
  return sql`ARRAY(
    SELECT t.slug FROM jsonb_to_recordset(${sql.json(rows)}::jsonb) AS t(slug text, tags text[], pattern text, position int)
    WHERE ${topicMatch(sql`t.tags`, sql`t.pattern`)}
    ORDER BY t.position)`;
}

/** Report `p` is in topic `t`; the tag overlap comes first, for the tags index. */
function inTopic(t: Topic) {
  const pattern: ReturnType<typeof sql> = t.pattern === null ? sql`NULL::text` : sql`${t.pattern}::text`;
  return topicMatch(sql`${t.tags}::text[]`, pattern);
}

// ---------------------------------------------------------------------------------------------------
// The public listed set by topic, read in one pass and kept a minute (counts may lag by that much; the
// rows of a page are checked again when read).

/** A public listed report in the topic index: the facts about it that the topic pages and their modules' parts read. */
export interface TopicMember {
  id: string;
  /** Public projection changes, including corrections that leave the timeline unchanged. */
  revision: number;
  /** Discovered time: the list's clock, and what "# days ago" counts by. */
  at: Date;
  /** When the report became visible (selected reports can wait for their release time). */
  released: Date;
  title: string;
  /** The topics it belongs to, in topic order. */
  topics: string[];
  originalTitle: string | null;
  category: CategoryKey | null;
  tags: string[];
  score: number | null;
  publishedAt: Date | null;
  /** 事件时间（at）的精度：date 时列表只写日期，不把日期锚点显示成时刻。 */
  atPrecision: TimePrecision;
  /** Its source is a first-party one. */
  firstParty: boolean;
  /** The fact it reports, and that fact's subject, action and date when known. */
  factId: number | null;
  factSubject: string | null;
  factAction: string | null;
  factOccurredAt: Date | null;
  /** Earliest currently public selected evidence of the same fact, including replaced representatives. */
  factPublishedAt: Date | null;
  /** Whether its analysis found one event or several ("composite"). */
  scope: string | null;
  /** Its public story's id, when it belongs to one. */
  story: string | null;
}

interface MemberRow {
  id: string;
  revision: number;
  at: Date;
  released: Date;
  title: string;
  original_title: string | null;
  published_at: Date | null;
  publication_time: string | null;
  fact_published_at: Date | null;
  tags: string[];
  score: number | null;
  first_party: boolean;
  category: CategoryKey | null;
  fact_id: number | null;
  fact_subject: string | null;
  fact_action: string | null;
  fact_occurred_at: Date | null;
  scope: string | null;
  story: string | null;
  topics: string[];
}

interface TopicIndex {
  at: Date;
  /** Each topic's reports, newest first. */
  bySlug: Map<string, TopicMember[]>;
  /** What each module's part of the topic pages computed with the index, by the module's name. */
  modules: Map<string, unknown>;
}

/** The full index or a bounded set of its candidates, with their current content and membership. */
async function readMembers(now: Date, ids?: string[], topics: Topic[] = TOPICS): Promise<TopicMember[]> {
  const rows = await sql<MemberRow[]>`
    WITH members AS (
      SELECT p.article_id AS id, p.revision, p.discovered_at AS at, p.visible_after AS released, p.title, p.score, (s.tier = 'T1') AS first_party,
        p.category, p.original_title, p.published_at, p.tags, p.fact_id,
        art.publication_time,
        f.subject AS fact_subject, f.action AS fact_action, f.occurred_at AS fact_occurred_at, a.output->>'scope' AS scope,
        st.public_id::text AS story, ${topicMembership(topics)} AS topics
      FROM publications p JOIN sources s ON s.id = p.source_id
      JOIN articles art ON art.id = p.article_id
      LEFT JOIN facts f ON f.id = p.fact_id
      LEFT JOIN analyses a ON a.id = p.analysis_id
      LEFT JOIN stories st ON st.id = p.story_id AND st.merged_into IS NULL
      WHERE ${listedCondition(now)}
        ${ids ? sql`AND p.article_id = ANY(${[...new Set(ids)]}::text[])` : sql``}
    ), dates AS (
      SELECT p.fact_id, min(coalesce(p.published_at, p.timeline_at)) AS fact_published_at
      FROM publications p WHERE p.fact_id IN (SELECT fact_id FROM members WHERE fact_id IS NOT NULL)
        AND ${selectedCondition(now)} AND ${ownFactEvidenceCondition()}
      GROUP BY p.fact_id
    )
    SELECT members.*, dates.fact_published_at FROM members LEFT JOIN dates ON dates.fact_id = members.fact_id
    ORDER BY members.at DESC, members.id DESC`;
  return rows.map((r) => ({
    id: r.id, revision: r.revision, at: r.at, released: r.released, title: r.title, topics: r.topics,
    score: r.score, firstParty: r.first_party, category: r.category, factId: r.fact_id, story: r.story,
    originalTitle: r.original_title, publishedAt: r.published_at,
    atPrecision: timelinePrecisionAt(r.published_at, r.at, r.publication_time),
    factPublishedAt: r.fact_published_at, tags: r.tags,
    factSubject: r.fact_subject, factAction: r.fact_action, factOccurredAt: r.fact_occurred_at, scope: r.scope,
  }));
}

async function readIndex(now: Date): Promise<TopicIndex> {
  const members = (await readMembers(now)).filter((member) => member.topics.length > 0);
  const bySlug = new Map(TOPICS.map((t) => [t.slug, [] as TopicMember[]]));
  for (const member of members) for (const slug of member.topics) bySlug.get(slug)?.push(member);
  const parts = serverModules().flatMap((m) => (m.topics?.page?.index ? [{ name: m.name, index: m.topics.page.index }] : []));
  return { at: now, bySlug, modules: new Map(await Promise.all(parts.map(async (p) => [p.name, await p.index(members, now)] as const))) };
}

const indexCache = cached(() => readIndex(new Date()), { freshMs: 60_000, maxStaleMs: 60_000 });

/** A given `now` reads afresh (tests, a clock other than this minute's). */
const topicIndex = (now?: Date) => (now ? readIndex(now) : indexCache.get());

const DAY = 86400_000;
const RECENT_DAYS = 30;
export const TOPIC_PAGE_SIZE = 20;

/** A company's initial, drawn as its mark. */
const monogram = (t: Topic): Brand => ({ src: null, monogram: t.name.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 1).toUpperCase(), raster: false });

/** Every company's mark, by its topic's slug. */
async function companyBrands(): Promise<Map<string, Brand>> {
  const companies = TOPICS.filter((t) => t.group === "company");
  const brands = new Map<string, Brand>(companies.map((t) => [t.slug, monogram(t)]));
  // The modules' marks over the monograms.
  for (const m of serverModules()) {
    if (!m.topics?.marks) continue;
    for (const [slug, mark] of Object.entries(await m.topics.marks())) if (brands.has(slug)) brands.set(slug, mark);
  }
  return brands;
}

const recentCount = (members: TopicMember[], now: Date) => members.filter((m) => m.at.getTime() > now.getTime() - RECENT_DAYS * DAY).length;

/** Thin topics keep their page but stay out of the sitemap and search engines. */
const isIndexable = (total: number, recent: number) => total >= 50 || (total >= 20 && recent > 0);

/** Reports to look at for a topic's newest one, in case the newest was withdrawn since the index was read. */
const LATEST_CANDIDATES = 3;

/**
 * Recheck only the reports a page may name: withdrawals and corrections, including the title and
 * membership, take effect even while counts are cached.
 */
async function currentMembers(ids: string[], now: Date, topics: Topic[] = TOPICS): Promise<Map<string, TopicMember>> {
  if (ids.length === 0) return new Map();
  return new Map((await readMembers(now, ids, topics)).map((member) => [member.id, member]));
}

function summarize(t: Topic, members: TopicMember[], now: Date, brands: Map<string, Brand>, live: Map<string, TopicMember>): TopicSummary {
  const recent = recentCount(members, now);
  const latest = members.slice(0, LATEST_CANDIDATES).map((member) => live.get(member.id)).find((member) => member?.topics.includes(t.slug));
  return {
    slug: t.slug,
    name: t.name,
    group: t.group,
    definition: t.definition,
    brand: brands.get(t.slug) ?? null,
    total: members.length,
    recent,
    indexable: isIndexable(members.length, recent),
    latest: latest ? { title: latest.title, at: latest.at.toISOString(), atPrecision: latest.atPrecision } : null,
  };
}

export async function listTopicSummaries(): Promise<TopicsResponse> {
  const [index, brands] = await Promise.all([topicIndex(), companyBrands()]);
  const live = await currentMembers(TOPICS.flatMap((t) => index.bySlug.get(t.slug)!.slice(0, LATEST_CANDIDATES).map((member) => member.id)), new Date());
  return { groups: TOPIC_GROUPS, topics: TOPICS.map((t) => summarize(t, index.bySlug.get(t.slug)!, index.at, brands, live)) };
}

export interface TopicCount {
  slug: string;
  pages: number;
  indexable: boolean;
  /** Content identity includes removed reports and module contributions, not just the latest arrival. */
  revision?: string;
}

/** For discovery: every topic's pages and their current content identity. */
export async function topicPageCounts(now?: Date, revisions = false): Promise<TopicCount[]> {
  const index = await topicIndex(now);
  const brands = revisions ? await companyBrands() : null;
  return TOPICS.map((t) => {
    const members = index.bySlug.get(t.slug)!;
    let revision: string | undefined;
    if (revisions) {
      const current = new Map(members.map((member) => [member.id, member]));
      const parts = serverModules().flatMap((m) => {
        const part = m.topics?.page?.read({ topic: t, page: 1, members, index: index.modules.get(m.name), now: index.at });
        return part ? [[m.name, part.part(current)]] : [];
      });
      revision = sha256(stableJson([t, members, parts, brands?.get(t.slug) ?? null]));
    }
    return {
      slug: t.slug,
      pages: Math.max(1, Math.ceil(members.length / TOPIC_PAGE_SIZE)),
      indexable: isIndexable(members.length, recentCount(members, index.at)),
      ...(revision ? { revision } : {}),
    };
  });
}

export async function loadTopicPage(slug: string, page: number, now?: Date): Promise<TopicPage | null> {
  const topic = findTopic(slug);
  if (!topic || !Number.isInteger(page) || page < 1) return null;
  const index = await topicIndex(now);
  const members = index.bySlug.get(slug)!;
  const pageCount = Math.max(1, Math.ceil(members.length / TOPIC_PAGE_SIZE));
  if (page > pageCount) return null;
  const ids = members.slice((page - 1) * TOPIC_PAGE_SIZE, page * TOPIC_PAGE_SIZE).map((member) => member.id);
  const at = now ?? new Date();
  // Reports read again before the page names them: the newest few, for the topic's latest one, and the
  // ones the modules' parts may name.
  const recheck = members.slice(0, LATEST_CANDIDATES).map((member) => member.id);
  const parts = serverModules().flatMap((m) => {
    const part = m.topics?.page?.read({ topic, page, members, index: index.modules.get(m.name), now: at });
    return part ? [{ name: m.name, ...part }] : [];
  });
  for (const part of parts) recheck.push(...part.recheck);
  const [rows, brands, live] = await Promise.all([
    ids.length
      ? sql<ItemRow[]>`SELECT ${ITEM_COLUMNS} ${ITEM_FROM} WHERE p.article_id = ANY(${ids}::text[]) AND ${listedCondition(at)} AND ${inTopic(topic)}
          ORDER BY p.discovered_at DESC, p.article_id DESC`
      : [],
    companyBrands(),
    currentMembers(recheck, at, [topic]),
  ]);
  const groupName = TOPIC_GROUPS.find((g) => g.key === topic.group)?.name ?? "";
  return {
    topic: { ...summarize(topic, members, index.at, brands, live), groupName },
    modules: Object.fromEntries(parts.map((part) => [part.name, part.part(live)])),
    items: rows.map(toFeedItemSummary),
    page,
    pageCount,
    pageSize: TOPIC_PAGE_SIZE,
  };
}

const STORY_TOPICS = 6;

/** The topics of a story's reports, most reports first. */
export async function topicsOfStory(storyId: number, now = new Date()): Promise<TopicLink[]> {
  const rows = await sql<{ topics: string[] }[]>`
    SELECT DISTINCT ON (p.article_id) ${topicMembership()} AS topics
    FROM facts f JOIN fact_articles fa ON fa.fact_id = f.id JOIN publications p ON p.article_id = fa.article_id
    JOIN sources s ON s.id = p.source_id
    WHERE f.story_id = ${storyId} AND ${evidenceCondition()} AND ${storyReportCondition(now)}
    ORDER BY p.article_id`;
  const reports = new Map<string, number>();
  for (const r of rows) for (const slug of r.topics) reports.set(slug, (reports.get(slug) ?? 0) + 1);
  const slugs = [...reports].sort(([a, x], [b, y]) => y - x || position(a) - position(b)).map(([slug]) => slug);
  return topicLinks(slugs.slice(0, STORY_TOPICS));
}
