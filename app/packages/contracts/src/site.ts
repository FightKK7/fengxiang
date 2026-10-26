// First-party site API (/api/site/*). Not a public API: it may evolve with the website,
// but it is served from the same public read layer as v1, RSS and MCP.
import type { CategoryKey, ChannelKey } from "./taxonomy.ts";
import { isoWeekRange, monthDay } from "./time.ts";

export interface SourceRef {
  /** The name readers see (publication/rules.ts publicSourceName), as is every source name here. */
  name: string;
  /** 厂商 id（sources.owner_entity_id，对应 industry/taxonomy 的实体）：时间线来源行据此画公司标。 */
  entityId?: string | null;
}

export interface MediaView {
  kind: "image" | "video";
  url: string;
  /** Full image for an on-demand viewer; list previews stay small. */
  fullUrl?: string;
  width: number | null;
  height: number | null;
  alt: string | null;
  poster: string | null;
  srcSet?: string;
}

export interface XPostView {
  authorName: string;
  handle: string;
  avatarUrl: string | null;
  avatarSrcSet?: string;
  text: string;
  translation: string | null;
  /** translation: Chinese translation of the quoted post, when it is in another language. */
  quoted: { authorName: string; handle: string; text: string; url: string; translation: string | null } | null;
  media: MediaView[];
}

export interface StoryRef {
  publicId: string;
  title: string;
}

/**
 * 一条定价变化：旧价 → 新价。G2 MVP 只要求展示，不参与计算；金额/席位等是给人看的原文，
 * 不在这里做单位换算（「¥1,200 /人/年」原样存、原样打印）。
 */
export interface PricingRow {
  /** 变的是哪一项：「企业版起订」「旗舰版单价」。 */
  label: string;
  /** 变更前的价格原文。 */
  before: string;
  /** 变更后的价格原文（可以带附加条件，如「¥1,200 + 调用费」）。 */
  after: string;
}

/** 一条资讯里的一次定价变化，来自 analyses.output.pricing（jsonb，无数据库迁移）。 */
export interface Pricing {
  rows: PricingRow[];
  /** 生效日期（ISO 日期），没有就是未写明。 */
  effectiveAt?: string;
}

/**
 * 一条动态的变更类型：发布公告 / 路线图调整 / 功能差异 / 正式可用 / 招聘 / 招标。
 * 源在 industry/sources.json 的 changeKind 里声明，采集时写进每条资料；没有声明就没有这个值。
 */
export type ChangeKind = "announcement" | "roadmap" | "diff" | "ga" | "hiring" | "tender";
export const CHANGE_KINDS = ["announcement", "roadmap", "diff", "ga", "hiring", "tender"] as const;
export const CHANGE_KIND_LABELS: Record<ChangeKind, string> = {
  announcement: "公告",
  roadmap: "路线图",
  diff: "功能变化",
  ga: "正式可用",
  hiring: "招聘",
  tender: "招标",
};
export function isChangeKind(value: string | null | undefined): value is ChangeKind {
  return !!value && (CHANGE_KINDS as readonly string[]).includes(value);
}

/**
 * 原文时间的精度。date = 源页面只写了日期（如「发布于 2026/10/19」），时刻未知；
 * exact = 源给出了时刻；unknown = 旧数据没有记录精度（不是「精确」的证据）。
 */
export type TimePrecision = "date" | "exact" | "unknown";

/** What every site answer about an article carries; a card and a page each add the X post in their own form. */
export interface ItemSummary {
  id: string;
  title: string;
  originalTitle: string | null;
  summary: string | null;
  reason: string | null;
  source: SourceRef;
  links: { original: string };
  /** 源声称的发布时间（已过未来容忍与可信度处理）；null = 原文没有可用的发布时间。 */
  publishedAt: string | null;
  /** 本站第一次看到这条材料的时间（真实收录时间），与 publishedAt 不是同一个时钟。 */
  discoveredAt: string;
  /** 排序与「事件时间」用的时间，由 publishedAt/discoveredAt 按 decideTimeline 算出。 */
  timelineAt: string;
  /**
   * publishedAt 的精度。页面据此只显示日期或完整时刻；null = 没有 publishedAt。
   * 夹具可以省略（视为 unknown，按完整时刻展示，不额外宣称精度）。
   */
  publishedAtPrecision?: TimePrecision | null;
  /**
   * timelineAt（事件时间）的精度。date = 事件时间就是「只标日期」的原文时间，列表只显示日期/
   * 「全天」，不编造 00:00；exact = 有真实时刻（源时刻或首次发现）；unknown = 旧数据精度未记录。
   */
  timelineAtPrecision?: TimePrecision;
  /**
   * 源声明的每条时间是否就是事件时间（sources.config.publishedAtAuthoritative !== false）。
   * false = 源整页/整批共用一个日期，或条目日期不是事件时间：事件时间按首次发现。
   * 夹具可以省略（视为 true）。
   */
  publishedAtTrusted?: boolean;
  category: CategoryKey | null;
  tags: string[];
  score: number | null;
  selected: boolean;
  channel: "news" | "x";
  /** 来源是否 T1 官方一手（sources.tier = 'T1'）。 */
  firstParty?: boolean;
  /** 变更类型（源声明）；读取层总是给出（没有就是 null），手工构造的夹具可以省略。 */
  changeKind?: ChangeKind | null;
  story: StoryRef | null;
}

/** The fields rendered by a site feed card; full original text lives in the item detail. */
export interface FeedItemSummary extends Pick<ItemSummary, "id" | "title" | "summary" | "reason" | "source" | "publishedAt" | "discoveredAt" | "timelineAt" | "publishedAtPrecision" | "timelineAtPrecision" | "publishedAtTrusted" | "category" | "tags" | "score" | "selected" | "channel"> {
  /** 变更类型（源声明）；没有这个键就按普通条目渲染。 */
  changeKind?: ChangeKind | null;
  /** 定价变化（若这条资讯是一次价格变更）；没有这个键就按普通摘要渲染。 */
  pricing?: Pricing;
  x: (Pick<XPostView, "authorName" | "handle" | "avatarUrl" | "avatarSrcSet" | "media"> & {
    quoted: Omit<NonNullable<XPostView["quoted"]>, "url"> | null;
  }) | null;
  /**
   * A selected report whose fact is represented by another report (全部动态 and search): that report,
   * so the card can say "同一件事，精选收录的是《…》" instead of claiming a seat of its own.
   */
  sameEvent?: { id: string; title: string } | null;
}

export interface GroupInfo {
  factId: string;
  /** Other public sources reporting this same news fact, under the current filters. */
  additionalSourceCount: number;
  /** Distinct public reports of this fact. */
  reportCount: number;
  /**
   * The selected reports of this fact under the current filters. The timeline's reader-side unread
   * filter keeps a group while any of them is unread; the timeline fills it, other callers omit it.
   */
  memberIds?: string[];
}

export interface TimelineCard {
  key: string;
  anchorAt: string;
  item: FeedItemSummary;
  group: GroupInfo | null;
}

export interface HotStripEntry {
  rank: number;
  title: string;
  heat: number;
  trend: "up" | "down" | "flat" | "new" | "unknown";
  storyPublicId: string | null;
  itemId: string | null;
  participants: HotParticipant[];
  participantCount: number;
}

export interface TimelineFilters {
  channel: ChannelKey;
  category: CategoryKey | null;
  tag: string | null;
}

/** 全部动态的筛选：在频道、分类、标签之外再加变更类型与「未分类」口径（分类 tab 的总数要对得上）。 */
export interface PoolFilters extends TimelineFilters {
  changeKind: ChangeKind | null;
  uncategorized: boolean;
}

export interface TimelineResponse {
  filters: TimelineFilters;
  cards: TimelineCard[];
  nextCursor: string | null;
  hot: HotStripEntry[] | null;
  dayCounts: Record<string, number>;
}

export interface PoolResponse {
  filters: PoolFilters & { q: string | null; tab: "time" | "relevance" };
  items: FeedItemSummary[];
  page: number;
  pageCount: number;
  total: number;
  todayCount: number;
  freshness: string;
}

/**
 * 首页厂商筛选的一个主体：entity id、读者看到的名字、以及这个主体下的条数。
 * 条数与 `?tag=entity:<id>` 的筛选同一个口径——一条同时谈到两家公司的报告会同时计入两家。
 */
export interface BrandFacet {
  id: string;
  name: string;
  count: number;
}

/** 首页厂商筛选的名册：列表里只出现在公开列表中的主体，按条数从多到少。 */
export interface BrandsResponse {
  brands: BrandFacet[];
  /** 不筛厂商时的全部条数（「全部企业」后面的数字）。 */
  total: number;
}

export interface OutlineEntry {
  id: string;
  text: string;
  level: number;
}

/**
 * 原文／译文逐块对照。外语正文已预生成译文时给出；页面打开只读它，不调用模型。
 * 「拿到信息就翻译、存起来，每次启用只做展示」的成品：译文在 worker 里写好，读取层只拼装。
 */
export interface BilingualBody {
  /** 预拼好的对照 HTML：每块原文后面紧跟同块译文（译文包在 .fx-tr 里）。关闭译文时前端只隐藏 .fx-tr。 */
  html: string;
  /** false：有段落未译、保留原文，页面需说明。 */
  complete: boolean;
}

/**
 * An article page (/api/site/items/:id) in one language: Chinese (the article itself or its translation)
 * unless …/original asks for the original. A foreign-language body that already has a stored translation also
 * carries the paired `bilingual` body, so the reader switches the translation without another request.
 */
export interface SiteItemDetail extends ItemSummary {
  /** 定价变化（若这条资讯是一次价格变更）；没有这个键就不渲染对照表。 */
  pricing?: Pricing;
  /** The post with all its media; its text is the body. */
  x: Omit<XPostView, "text" | "translation"> | null;
  /** Selected, but its fact's seat is held by this report: marked 同事件, without a reason of its own. */
  sameEvent?: { id: string; title: string } | null;
  readingMode: "full" | "summary-only";
  author: string | null;
  /** Whitelisted HTML of the language shown; the other one is null. */
  body: { zh: string | null; original: string | null; zhKind: "translation" | "original" | null; complete: boolean } | null;
  /**
   * 原文／译文对照（外语正文且有预生成译文时）。body 仍按原单语口径返回（兼容旧接口），页面优先渲染它，
   * 并让读者开关译文；/original 视图不返回它。
   */
  bilingual: BilingualBody | null;
  outline: OutlineEntry[];
  relatedStories: StoryRef[];
  /** The topics the report belongs to. */
  topics: TopicLink[];
  indexable: boolean;
  markdownAvailable: boolean;
  group: GroupInfo | null;
  hasTranslation: boolean;
  bodyLanguage: "zh" | "original";
  /**
   * 源站所在时区（IANA 名称，来自 sources.config.displayTimeZone，例如 America/New_York）。
   * 详情页据此把原文时间按源站本地时区显示，并在括号里给北京时间对照；没有声明时为 null。
   */
  sourceTimeZone?: string | null;
}

/** A fact's public reports under the list's filters: what "另外 N 家也报道了" opens. */
export interface GroupReport {
  id: string;
  title: string;
  source: SourceRef;
  timelineAt: string;
  /** timelineAt 的精度：date 时只显示日期/「全天」，不编造时刻。 */
  timelineAtPrecision?: TimePrecision;
  originalUrl: string;
}

export interface GroupReportsResponse {
  factId: string;
  reports: GroupReport[];
}

// Hot ranking and stories

/** Home and hot-ranking faces show the same maximum number of editorial participants. */
export const HOT_FACE_LIMIT = 6;

export interface HotParticipant {
  name: string;
  kind: "editorial" | "signal";
  /** Only visible faces carry images: the source's icon or its latest collected X avatar (proxied). */
  iconUrl?: string | null;
  iconSrcSet?: string;
}


export interface HotEntryView {
  rank: number;
  story: StoryRef;
  heat: number;
  trend: "up" | "down" | "flat" | "new" | "unknown";
  trendPct: number | null;
  badges: Array<"surge" | "new" | "rising">;
  participantCount: number;
  sourceCount: number;
  sourceNames: string[];
  participants: HotParticipant[];
  /** Hourly heat over the 24 hours up to the ranking, oldest first; null where no comparable snapshot exists. */
  spark: Array<number | null>;
  /** A card excerpt of the story's AI digest, else its fact statement; full text is on the event page. */
  summary: string | null;
  /** The latest development, one line. */
  latest: string | null;
  /** A picture from the story's public reports (the representative first), for the leading cards. */
  cover: { url: string; srcSet?: string; width: number | null; height: number | null } | null;
}

export interface HotResponse {
  computedAt: string | null;
  windowHours: number;
  entries: HotEntryView[];
}

export interface HeatPoint {
  hour: string;
  heat: number;
  participants: number;
}

export interface StoryReportView {
  id: string;
  title: string;
  summary: string | null;
  source: SourceRef & { firstParty: boolean };
  publishedAt: string;
  /** publishedAt 的精度：date 时只显示日期/「全天」，不编造时刻。 */
  publishedAtPrecision?: TimePrecision;
  selected: boolean;
}

export interface StoryFactView {
  factId: string;
  title: string;
  firstReportAt: string;
  /** firstReportAt 的精度：date 时只显示日期/「全天」。 */
  firstReportAtPrecision?: TimePrecision;
  reportCount: number;
  representative: StoryReportView;
}

export interface StoryDetail {
  publicId: string;
  title: string;
  status: "active" | "watching" | "settled";
  reportCount: number;
  sourceCount: number;
  firstReportAt: string | null;
  /** firstReportAt 的精度：date 时只显示日期。 */
  firstReportAtPrecision?: TimePrecision;
  latestAt: string | null;
  /** latestAt 的精度：date 时只显示日期。 */
  latestAtPrecision?: TimePrecision;
  digest: string | null;
  digestUpdatedAt: string | null;
  /** The story's own factual summary, when it has one. */
  summary: string | null;
  /** Without a digest or summary: the summary of the report the story started from. */
  excerpt: { text: string; sourceName: string } | null;
  latest: string | null;
  /** The current public report supplying latest; never inferred from an independently generated digest. */
  latestReport: { id: string } | null;
  whyHot: {
    participants48h: number;
    newParticipants6h: number;
    recentReports24h: number;
    observationComplete: boolean;
    rank: number | null;
  };
  developments: StoryFactView[];
  officialReports: StoryReportView[];
  timeline: StoryReportView[];
  heat: HeatPoint[];
  related: Array<StoryRef & { relation: "storyline" | "related" }>;
  /** The topics its reports belong to, most reports first. */
  topics: TopicLink[];
}

// Reports (daily / weekly / monthly)

export type ReportKind = "daily" | "weekly" | "monthly";

/** What each kind of report is called. */
export const REPORT_NAMES: Record<ReportKind, string> = { daily: "每日精选", weekly: "周报", monthly: "月报" };

/** An issue's date as Chinese readers write and search it: "10月17日", "10月12日—18日" (or "9月28日—10月4日"), "2026年10月". */
export function reportDateLabel(kind: ReportKind, key: string): string {
  if (kind === "daily") return monthDay(key);
  if (kind === "monthly") return `${key.slice(0, 4)}年${Number(key.slice(5, 7))}月`;
  const { start, end } = isoWeekRange(key)!;
  return `${monthDay(start)}—${start.slice(5, 7) === end.slice(5, 7) ? `${Number(end.slice(8, 10))}日` : monthDay(end)}`;
}

export interface ReportCitation {
  itemId: string | null;
  title: string;
  summary: string | null;
  /** 条目级的「风向观察」（可选编辑观察；字段名仍为 reason）：没写就不出这个字段，版面也不排这一块。 */
  reason?: string;
  sourceName: string;
  sourceUrl: string;
  sourceIconUrl: string | null;
  sourceIconSrcSet?: string;
  firstParty: boolean;
  /** When the cited report was published, if it is still in the database. */
  publishedAt: string | null;
  /** False once the item was withdrawn; the citation then shows as removed. */
  available: boolean;
  /** A daily entry: other sources that reported the event by the issue's cutoff. */
  otherSources?: number;
  /** A daily entry's other developments of the event, or reports of the launch merged into it (titles only). */
  related?: ReportCitation[];
  /** A daily entry whose event an earlier daily covered: that issue's date. */
  followUp?: string;
}

/** 每日精选的「今日判断」：编辑写的一句观察，可选增值，报告级字段，不跟 lead 混用。 */
export interface ReportVerdict {
  /** 每日精选报眼区的大字判断（26px 宋体）。 */
  title: string;
  /** 判断下面的一句导语（可选）；没有就只显示标题。 */
  body?: string;
}

export interface ReportDetail {
  kind: ReportKind;
  key: string;
  /** The issue's place among the existing issues of its kind, oldest first ("第 N 期"). */
  issueNumber: number;
  title: string;
  generatedAt: string;
  /** 报告覆盖窗口（ISO）：每日精选 D 期覆盖 D 前一日 08:00 到 D 当日 08:00（EDITION_TIMES.daily）。 */
  windowStart?: string;
  windowEnd?: string;
  lead: { title: string; leadParagraph: string } | null;
  /** 编辑写的「今日判断」（可选）；没有这个字段时每日精选版面直接出导语/条目，首页不再渲染。 */
  verdict?: ReportVerdict;
  /** The still-public item the front page leads with (its headline links there). */
  leadItemId: string | null;
  overview: string | null;
  highlights: ReportCitation[];
  /** As edited: daily categories, weekly and monthly themes. */
  sections: Array<{ label: string; summary: string | null; items: ReportCitation[] }>;
  flashes: ReportCitation[];
  /**
   * The front page's picture: from the lead item (a daily's lead, a weekly or monthly's first highlight),
   * else from another public report of that event. Captioned with the story when it is not the lead's own.
   */
  cover: { url: string; srcSet?: string; width: number | null; height: number | null; caption: string | null } | null;
  metrics: Record<string, number>;
  readingMinutes: number;
  prev: string | null;
  next: string | null;
}

export interface ReportIndexEntry {
  key: string;
  issueNumber: number;
  title: string | null;
  count: number;
}

export interface ReportIndexResponse {
  kind: ReportKind;
  items: ReportIndexEntry[];
}

/** The latest report page: its archive selector and the report in one request. */
export interface ReportLatestPage {
  index: ReportNavigationEntry[];
  report: ReportDetail | null;
}

/** A report's archive selector, or one month of the daily archive. */
export interface ReportNavigationResponse {
  items: ReportNavigationEntry[];
}

/** Site-wide facts for the web shell: the changelog red-dot anchor and the last real crawl. */
export interface SiteMeta {
  changelogVersion: string;
  /**
   * 最近一次真实抓取完成的时间（最近成功 fetch_run 与新素材入库时间取较晚者）；从未抓取为 null。
   * 刊头「最近抓取」用它——不能用出刊时间冒充抓取时间。
   */
  lastFetchedAt: string | null;
}

/** One entry of the site's changelog (site/changelog.json), newest first. */
export interface ChangelogRelease {
  date: string;
  time: string;
  kind: "更新" | "优化" | "公告" | "下线";
  title: string;
  body: string[];
  /** A notice readers must act on: drawn in the warning red so it cannot be skimmed past. */
  urgent?: true;
  /** A major release's long form, drawn by the site's own drawing when it ships one; its shape is the site's. */
  feature?: unknown;
}

export interface ChangelogResponse {
  latestVersion: string;
  releases: ChangelogRelease[];
}

/**
 * The about page's contact codes (uploaded in the admin or shipped with the site; null when there is
 * none) and the maker's avatar through the image proxy.
 */
export interface SiteContact {
  wechatQr: string | null;
  feishuQr: string | null;
  makerAvatar: string | null;
}

/** Figures and samples for the about page (site-only; not part of v1). */
export interface SiteStats {
  /** Sources collected from now. */
  sources: number;
  /** Enabled sources by kind: x_search, rss, web_list, mp_account, json_list. */
  sourceKinds: Record<string, number>;
  /** Everything collected and not withdrawn, heat-only sources included. */
  items: number;
  selected: number;
  dailies: number;
  /** The last 24 hours: items found (heat-only sources included), and items that made 精选 (by their place on the timeline). */
  day: { collected: number; selected: number };
  /** Enabled sources in a daily shuffle, for the about page's river: one line per source. */
  sampleSources: Array<{ name: string; kind: string; heatOnly: boolean }>;
  /** The latest 精选, newest first. */
  latest: Array<{ id: string; title: string; source: string }>;
}

export interface StoryFollowup {
  factId: string;
  representative: { id: string; title: string; source: { name: string }; timelineAt: string };
}
export interface StoryFollowupsResponse { items: StoryFollowup[]; more: boolean }

/**
 * A starred item as the site can show it now (/api/site/items/availability, keyed by id). Stars keep the
 * source name of the day they were saved; a public item also brings the name shown today.
 */
export interface ItemAvailability {
  status: "public" | "summary-only" | "unavailable";
  sourceName?: string;
}

/** An issue in the archive and the calendar, numbered in its whole series; closed daily months omit their titles. */
export interface ReportNavigationEntry { key: string; issueNumber: number; title?: string | null; count?: number }

// Topics

export type TopicGroupKey = "company" | "field" | "genre";

export interface TopicGroup {
  key: TopicGroupKey;
  name: string;
  blurb: string;
}

export interface TopicLink {
  slug: string;
  name: string;
}

/** A mark drawn beside a name: its logo, or a monogram when there is none. */
export interface Brand {
  /** Site-relative logo path, or null when only a monogram is available. */
  src: string | null;
  monogram: string;
  /** Raster marks get a light backing plate in dark mode. */
  raster: boolean;
  /** 深色单色标（黑字/黑底）：暗色模式下反白，否则在近黑纸上看不见。 */
  invertOnDark?: boolean;
}

export interface TopicSummary extends TopicLink {
  group: TopicGroupKey;
  definition: string;
  /** Companies: their logo mark where the site has one, else their initial. */
  brand: Brand | null;
  /** Public listed reports — every report a reader can open on /all and the home timeline. */
  total: number;
  /** Of those, discovered in the last 30 days (the list's clock). */
  recent: number;
  /** Enough content to be listed and indexed. */
  indexable: boolean;
  /** The newest listed report, by discovered time. `atPrecision` 为 date 时只显示日期。 */
  latest: { title: string; at: string; atPrecision?: TimePrecision } | null;
}

export interface TopicsResponse {
  groups: TopicGroup[];
  topics: TopicSummary[];
}

/** Phone search only needs links, not the topic pages or full hot ranking. */
export interface SearchSuggestions {
  topics: Array<TopicLink & { group: TopicGroupKey }>;
  hot: Array<{ rank: number; title: string; to: string }>;
}

export interface TopicPage {
  topic: TopicSummary & { groupName: string };
  /** The site's modules' parts of the page, under their names; each module's web part draws its own. */
  modules: Record<string, unknown>;
  items: FeedItemSummary[];
  page: number;
  pageCount: number;
  pageSize: number;
}
