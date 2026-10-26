// 事件页（story）：同一件事的多篇报道聚合成一个「事件」。
// 风向版式：报头式标题 + 一行极简元信息 + 综述 + 报道时间线；不排右轨、分节 tab 和重复的计数/时间标签。
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BackLink } from "../components/ui/BackLink";
import { IntentLink } from "../components/ui/IntentLink";
import { Link, useLoaderData, useLocation } from "react-router";
import type { Route } from "./+types/story";
import type { StoryDetail, StoryReportView } from "@aihot/contracts/site";
import { SITE } from "@aihot/site";
import { cachedPage, loadOr404 } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { breadcrumbLd, pageMeta, storyLd, titled } from "../lib/seo";
import { beijingTime, monthDay } from "@aihot/contracts/time";
import { byBeijingDay, monthDayTimeOf, relativeTime } from "../lib/format";
import { HeatChart } from "../features/story/HeatChart";
import { sessionCache } from "../lib/session-cache";
import { isReload } from "../lib/restore";
import { PhoneBar } from "../components/shell/PhoneBar";
import { navUp } from "../components/shell/nav";
import type { Screen } from "../components/shell/screens";
import "../features/story/story.css";

// 事件页归在热点榜下面，和榜单互相可达。
const UP = navUp("/hot");
export const handle: Screen = { home: UP.tab };
export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

export async function loader({ params, request }: Route.LoaderArgs) {
  const story = await loadOr404<StoryDetail>(`/api/site/stories/${encodeURIComponent(params.publicId)}`, { signal: request.signal, merged: (id) => `/story/${id}` });
  return cachedPage(300, { story });
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: titled("事件不存在") }, { name: "robots", content: "noindex" }];
  const s = loaderData.story;
  return pageMeta({
    title: s.title,
    description: (s.digest ?? s.summary ?? s.excerpt?.text)?.slice(0, 150) ?? `${s.sourceCount} 个报道来源 ${s.reportCount} 篇报道，完整时间线与最新进展。`,
    path: `/story/${s.publicId}`,
    image: `/og/stories/${s.publicId}.png`,
    type: "article",
    jsonLd: [
      storyLd(s),
      breadcrumbLd([{ name: SITE.name, path: "/" }, ...UP.crumbs, { name: s.title, path: `/story/${s.publicId}` }]),
    ],
  });
}

const STATUS = {
  active: "持续更新",
  watching: "观察中",
  settled: "历史事件",
} as const;

// 分节锚点沿用老页面的 id，已有的分享链接仍然落在原来的位置。
const SECTIONS = { overview: "event-overview", reports: "event-reports", heat: "event-heat" } as const;

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** 时间线上的一条报道：时间 / 来源与精选 / 宋体标题 / 摘要（默认两行，可展开）。 */
function TimelineRow({ r }: { r: StoryReportView }) {
  const [open, setOpen] = useState(false);
  const [clamped, setClamped] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (el && !open) setClamped(el.scrollHeight > el.clientHeight + 1);
  }, [r.summary, open]);
  return (
    <li className="fx-story-report">
      <time dateTime={r.publishedAt} className="fx-story-report-time">
        {r.publishedAtPrecision === "date" ? "全天" : beijingTime(r.publishedAt)}
      </time>
      <div className="fx-story-report-body">
        <p className="fx-story-report-meta">
          <span className="fx-story-report-src">{r.source.name}</span>
          {r.selected && <span className="fx-story-mark">精选</span>}
        </p>
        <IntentLink viewTransition to={`/items/${r.id}`} className="fx-story-report-title">
          {r.title}
        </IntentLink>
        {r.summary && (
          <>
            <p ref={ref} className={open ? "fx-story-report-sum fx-story-report-sum-open" : "fx-story-report-sum"}>
              {r.summary}
            </p>
            {(clamped || open) && (
              <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="fx-story-more">
                {open ? "收起摘要" : "展开摘要"}
              </button>
            )}
          </>
        )}
      </div>
    </li>
  );
}

type Filter = "all" | "official" | "selected";

// 报道筛选跟着浏览历史条目走：从报道点回来时还是原来的视图。
const viewCache = sessionCache<{ savedAt: number; filter: Filter }>("aihot:story-view:", 30 * 60 * 1000);

export default function StoryPage() {
  const { story } = useLoaderData<typeof loader>();
  const entry = useLocation().key;
  const [filter, setFilter] = useState<Filter>(() => viewCache.peek(entry)?.filter ?? "all");
  // A document the browser reloaded on back/forward gets the view back after hydration.
  useEffect(() => {
    if (viewCache.peek(entry) || isReload()) return;
    const saved = viewCache.read(entry);
    if (saved) setFilter(saved.filter);
  }, [entry]);
  useEffect(() => {
    if (filter !== "all" || viewCache.peek(entry)) viewCache.set(entry, { savedAt: Date.now(), filter });
  }, [entry, filter]);

  const counts = {
    all: story.timeline.length,
    official: story.timeline.filter((r) => r.source.firstParty).length,
    selected: story.timeline.filter((r) => r.selected).length,
  };
  // 筛选项只在真的能筛时出现：官方一手/精选报道要有内容，且确实比全部少。
  const filterOptions: Array<{ key: Filter; label: string; count: number }> = [
    { key: "all", label: "全部报道", count: counts.all },
    ...(counts.official > 0 && counts.official < counts.all ? [{ key: "official" as const, label: "官方一手", count: counts.official }] : []),
    ...(counts.selected > 0 && counts.selected < counts.all ? [{ key: "selected" as const, label: "精选报道", count: counts.selected }] : []),
  ];
  const showFilters = filterOptions.length >= 2;
  // 视图缓存里可能存着已经不可用的筛选（比如精选报道没了），回到全部。
  useEffect(() => {
    if (filter !== "all" && !filterOptions.some((option) => option.key === filter)) setFilter("all");
  }, [filter, filterOptions]);

  const days = useMemo(() => {
    const list = story.timeline.filter((r) => (filter === "official" ? r.source.firstParty : filter === "selected" ? r.selected : true));
    const sorted = [...list].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
    return byBeijingDay(sorted, (r) => r.publishedAt);
  }, [story.timeline, filter]);
  const developments = useMemo(
    () => [...story.developments].sort((a, b) => Date.parse(b.firstReportAt) - Date.parse(a.firstReportAt)),
    [story.developments],
  );
  const showHeat = story.heat.length > 0;
  const overview = story.digest
    ? {
        text: story.digest,
        note: `AI 根据 ${story.reportCount} 篇报道生成${story.digestUpdatedAt ? `（${relativeTime(story.digestUpdatedAt)}更新）` : ""}`,
      }
    : story.summary
      ? { text: story.summary, note: null }
      : story.excerpt
        ? { text: story.excerpt.text, note: `摘自 ${story.excerpt.sourceName}` }
        : null;

  return (
    <div className="fx-story">
      <PhoneBar back={{ to: UP.to, label: UP.back }} title={story.title} />

      <BackLink to={UP.to} label={UP.name} />

      <header className="fx-story-head">
        <h1 data-page-title="" className="fx-story-title">
          {story.title}
        </h1>
        <p className="fx-story-meta">
          <span className="num">{story.reportCount}</span> 篇报道，
          {STATUS[story.status]}
        </p>
      </header>

      {overview ? (
        <section id={SECTIONS.overview} className="fx-story-overview">
          <p className="fx-story-lede">{overview.text}</p>
          {overview.note && (
            <p className="fx-story-lede-note" suppressHydrationWarning>
              {overview.note}
            </p>
          )}
        </section>
      ) : (
        <p id={SECTIONS.overview} className="fx-story-empty">
          还没有综述，先看报道时间线。
        </p>
      )}

      {story.developments.length > 1 && (
        <section className="fx-report-section">
          <div className="fx-report-section-head">
            <h2 className="fx-report-section-label">事件进展</h2>
            <span className="fx-report-section-count">{story.developments.length} 个进展</span>
          </div>
          <ol className="fx-story-developments">
            {developments.map((d) => (
              <li key={d.factId} className="fx-story-development">
                <p className="fx-story-dev-meta num">
                  {monthDayTimeOf({ timelineAt: d.firstReportAt, timelineAtPrecision: d.firstReportAtPrecision })}，{d.reportCount} 篇报道
                </p>
                <Link viewTransition to={`/items/${d.representative.id}`} className="fx-story-dev-title">
                  {d.title}
                </Link>
                <p className="fx-story-dev-src">
                  {d.representative.source.name}：{d.representative.title}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section id={SECTIONS.reports} className="fx-report-section">
        <div className="fx-report-section-head">
          <h2 className="fx-report-section-label">报道时间线</h2>
        </div>
        {showFilters && (
          <div className="fx-story-filters">
            {filterOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setFilter(option.key)}
                aria-pressed={filter === option.key}
                className={filter === option.key ? "fx-story-filter fx-story-filter-on" : "fx-story-filter"}
              >
                {option.label}
                <span className="fx-story-filter-count">{option.count}</span>
              </button>
            ))}
          </div>
        )}
        {days.length === 0 ? (
          <p className="fx-story-empty">这个筛选下没有报道。</p>
        ) : (
          days.map(({ day, entries: rows }) => (
            <div key={day} className="fx-story-day">
              <p className="fx-story-day-label">{monthDay(day)}</p>
              <ol>
                {rows.map((r) => (
                  <TimelineRow key={r.id} r={r} />
                ))}
              </ol>
            </div>
          ))
        )}
        {story.reportCount > story.timeline.length && (
          <p className="fx-story-note">
            显示最近 {story.timeline.length} 篇，共 {story.reportCount} 篇报道。
          </p>
        )}
      </section>

      {showHeat && (
        <section id={SECTIONS.heat} className="fx-report-section">
          <div className="fx-report-section-head">
            <h2 className="fx-report-section-label">热度走势</h2>
          </div>
          <HeatChart points={story.heat} />
        </section>
      )}

      {story.related.length > 0 && (
        <section className="fx-report-section">
          <div className="fx-report-section-head">
            <h2 className="fx-report-section-label">关联事件</h2>
          </div>
          <ul className="fx-story-related">
            {story.related.map((r) => (
              <li key={r.publicId} className="fx-story-related-item">
                <span className="fx-story-related-kind">{r.relation === "storyline" ? "同一故事线" : "相关事件"}</span>
                <Link viewTransition to={`/story/${r.publicId}`} className="fx-story-related-title">
                  {r.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
