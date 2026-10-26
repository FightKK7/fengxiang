import { SITE } from "@aihot/site";
import { BackLink } from "../components/ui/BackLink";
import { Link, redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/topic";
import type { TopicPage } from "@aihot/contracts/site";
import { cachedPage, loadOr404 } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { breadcrumbLd, pageMeta, titled, topicLd } from "../lib/seo";
import { DayList, Pagination } from "../features/feed/DayList";
import { beijingDate, monthDay } from "@aihot/contracts/time";
import { monthDayTimeOf } from "../lib/format";
import { BrandMark } from "../components/BrandMark";
import { PhoneBar } from "../components/shell/PhoneBar";
import { navUp } from "../components/shell/nav";
import type { Screen } from "../components/shell/screens";
import type { TopicPagePart } from "../modules";
import { loadParts } from "../site-modules";
import "../fx-pages-content.css";

// Topics are reached from the topics page, as long as the site shows it.
const UP = navUp("/topics");
export const handle: Screen = { home: UP.tab };
export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

/** Selected items of a topic: shared caches keep the page as long as its api answer (one minute). */
export async function loader({ params, request }: Route.LoaderArgs) {
  if (/[\u0000-\u001f\u007f]/.test(params.slug)) throw new Response("Not found", { status: 404 });
  const page = params.page ? Number(params.page) : 1;
  if (params.page !== undefined && (!/^\d+$/.test(params.page) || page < 1)) throw new Response("Not found", { status: 404 });
  // Page 1 lives at the topic's own address (308).
  if (params.page === "1") throw redirect(`/topics/${encodeURIComponent(params.slug)}`, 308);
  const data = await loadOr404<TopicPage>(`/api/site/topics/${encodeURIComponent(params.slug)}?page=${page}`, { signal: request.signal });
  return cachedPage(60, { data });
}

const PARTS = await loadParts((m) => m.topicPage);

type Part = TopicPagePart & { key: string; data: unknown };

/** The modules' parts that have something on this page, in the site's order. */
function partsOf(data: TopicPage): Part[] {
  return PARTS.flatMap(({ name, part }) => {
    const value = data.modules[name];
    return value !== undefined && part.shows(value, data.topic) ? [{ ...part, key: name, data: value }] : [];
  });
}

/** The search snippet: what the topic covers, after when it last changed and its biggest recent events. */
function description(data: TopicPage, parts: Part[]): string {
  const { topic } = data;
  let text = topic.definition;
  const news = parts.flatMap((p) => p.news(p.data)).slice(0, 2).map((title) => title.replace(/[。.]$/u, "")).join("；");
  if (news && topic.latest) text = `${monthDay(beijingDate(topic.latest.at))}更新：${news}。${topic.definition}`;
  return text.length > 150 ? `${text.slice(0, 149)}…` : text;
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: titled("主题不存在") }, { name: "robots", content: "noindex" }];
  const data = loaderData.data;
  const { topic, page } = data;
  const parts = partsOf(data);
  const path = page > 1 ? `/topics/${topic.slug}/page/${page}` : `/topics/${topic.slug}`;
  const text = page > 1 ? `${topic.name}的动态归档第 ${page} 页。${topic.definition}` : description(data, parts);
  const crumbs = breadcrumbLd([{ name: SITE.name, path: "/" }, ...UP.crumbs, { name: topic.name, path: `/topics/${topic.slug}` }]);
  return pageMeta({
    title: page > 1
      ? `${topic.name} 动态，第 ${page} 页`
      : `${topic.name} 最新动态${parts.length ? `与${parts.map((p) => p.name).join("、")}` : ""}`,
    description: text,
    path,
    image: `/og/topics/${topic.slug}.png`,
    noindex: !topic.indexable,
    jsonLd: page > 1
      ? crumbs
      : [
          topicLd({
            path,
            name: `${topic.name} 最新动态`,
            description: text,
            dateModified: topic.latest?.at ?? null,
            lists: parts.map((p) => ({ name: p.name, entries: p.entries(p.data) })),
          }),
          crumbs,
        ],
  });
}

export default function TopicRoute() {
  const { data } = useLoaderData<typeof loader>();
  const { topic, items, page, pageCount } = data;
  const parts = partsOf(data);
  const href = (p: number) => (p <= 1 ? `/topics/${topic.slug}` : `/topics/${topic.slug}/page/${p}`);
  return (
    <div className="fxc-page">
      <PhoneBar back={{ to: UP.to, label: UP.back }} title={topic.name} />
      <div className="fxc-col">
        <BackLink to={UP.to} label={UP.back} />

        <header className="fxc-topic-head">
          <div className="fxc-topic-title">
            {topic.brand?.src && <BrandMark brand={topic.brand} size={36} plate={false} className="fxc-topic-mark" />}
            <h1 data-page-title="" className="fxc-topic-name">
              {topic.name}
            </h1>
          </div>
          <p className="fxc-topic-def">{topic.definition}</p>
          <p className="fxc-topic-counts">
            <span>
              <b>{topic.total.toLocaleString("zh-CN")}</b> 条收录
            </span>
            <span>
              近 30 天 <b>{topic.recent.toLocaleString("zh-CN")}</b> 条
            </span>
            {topic.latest && <span>更新于 {monthDayTimeOf({ timelineAt: topic.latest.at, timelineAtPrecision: topic.latest.atPrecision })}</span>}
          </p>
        </header>

        {parts.length > 0 && (
          <div className="fxc-parts">
            {parts.map((part) => (
              <part.Block key={`${part.key}:${topic.slug}`} data={part.data} topic={topic} />
            ))}
          </div>
        )}

        <h2 className="sr-only">{page === 1 ? `${topic.name}的动态` : `动态归档，第 ${page} 页`}</h2>
        {items.length === 0 ? (
          <p className="fxc-empty">这个主题暂时还没有内容。</p>
        ) : (
          <DayList items={items} />
        )}
        <Pagination page={page} pageCount={pageCount} href={href} />
      </div>
    </div>
  );
}
