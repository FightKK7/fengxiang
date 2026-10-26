// 首页：时间线是主栏，就是「全部动态」本身；右栏是推荐阅读与订阅。
// 数据读一次 pool（首屏，收录时间倒序，日分组在 DayList 里做），再读当期周报（人工榜单）与事件
// 时间线（自动推荐的排序依据）。这条流在客户端继续读下一页（StreamDayList），没有页码；搜索去 /all。
// 时间线之上是厂商筛选（?brand=<id>）：名册与条数来自 /api/site/brands（所有有内容的主体，按条数排序）。
import { redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/home";
import type { BrandsResponse, PoolResponse, ReportCitation, ReportDetail, ReportLatestPage, TimelineResponse } from "@aihot/contracts/site";
import { isChangeKind } from "@aihot/contracts/site";
import { apiGet, cachedPage, loadOr404 } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { filterParams, itemListLd, listPath, pageMeta, readFilters, siteLd } from "../lib/seo";
import { FrontPage, type FrontRank, type FrontReading } from "../features/feed/FrontPage";

export const handle = { tab: "featured", name: "全部动态" };
export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

const citationKey = (c: ReportCitation) => c.itemId ?? c.title;

/** One citation per item, in the order the report first prints it. */
function uniqueCitations(citations: ReportCitation[]): ReportCitation[] {
  const seen = new Set<string>();
  const out: ReportCitation[] = [];
  for (const c of citations) {
    const key = citationKey(c);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/** The week's ranking from the weekly issue: its lead first, then the rest as it prints them. */
function weekRanking(weekly: ReportDetail | null): FrontRank[] {
  if (!weekly) return [];
  const all = uniqueCitations([...weekly.sections.flatMap((s) => s.items), ...weekly.highlights, ...weekly.flashes]);
  const lead = all.find((c) => c.itemId && c.itemId === weekly.leadItemId);
  const ordered = lead ? [lead, ...all.filter((c) => c !== lead)] : all;
  return ordered.slice(0, 5).map((c) => ({
    title: c.title,
    to: c.available && c.itemId ? `/items/${c.itemId}` : c.sourceUrl,
    external: !(c.available && c.itemId),
  }));
}

/**
 * 推荐阅读：人工风向榜优先；没有就按「报道方数 → 有判断 → 收录时间」取事件时间线的入选条目，
 * 入选不够时用池子里带判断的条目补足。大部分时间走自动这一支。
 */
function buildReading(ranking: FrontRank[], timeline: TimelineResponse | null, pool: PoolResponse): FrontReading[] {
  if (ranking.length > 0) {
    return ranking.slice(0, 5).map((r) => ({ title: r.title, to: r.to, external: r.external, why: null }));
  }
  const cards = [...(timeline?.cards ?? [])]
    .map((card) => ({ card, sources: card.group?.additionalSourceCount ?? 0 }))
    .sort(
      (a, b) =>
        b.sources - a.sources ||
        Number(!!b.card.item.reason) - Number(!!a.card.item.reason) ||
        Date.parse(b.card.anchorAt) - Date.parse(a.card.anchorAt),
    );
  const out: FrontReading[] = [];
  const seen = new Set<string>();
  const push = (title: string, to: string, external: boolean, why: string | null) => {
    if (out.length >= 5 || seen.has(to)) return;
    seen.add(to);
    out.push({ title, to, external, why });
  };
  for (const { card } of cards) {
    push(card.item.title, `/items/${card.item.id}`, false, card.item.reason ?? card.item.summary);
  }
  // 2026-10-23 新定位：判断可选，推荐阅读按「精选」取，没有判断时用摘要代替「为什么读」。
  for (const item of pool.items) {
    if (item.selected) push(item.title, `/items/${item.id}`, false, item.reason ?? item.summary);
  }
  return out;
}

/** 首页地址里的厂商参数：只收 entity id 形状的值，其余当成没选。 */
function readBrand(params: URLSearchParams): string | null {
  const value = params.get("brand")?.trim() ?? "";
  return /^[a-z0-9][a-z0-9-]{0,39}$/.test(value) ? value : null;
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q");
  // 搜索仍在「全部动态」：首页不留搜索态，旧链接与搜索浮层都转过去。
  if (q && q.trim()) throw redirect(`/all${url.search}`);
  const kindParam = url.searchParams.get("kind");
  const filters = readFilters(url.searchParams);
  // 厂商筛选在公开口径里就是标签筛选（entity:<id>）：一个品牌 = 一个主体标签。
  const brand = readBrand(url.searchParams);
  const tag = brand ? `entity:${brand}` : filters.tag;
  const changeKind = isChangeKind(kindParam) ? kindParam : null;
  const uncategorized = url.searchParams.get("uncat") === "1";
  // 旧分页链接（/?page=N）回到首页自己的地址：时间线是一条滚动到底的流，页码不再有意义。
  if (url.searchParams.has("page")) throw redirect(listPath("/", { channel: filters.channel, category: filters.category, tag: filters.tag, kind: changeKind, uncat: uncategorized ? "1" : null }));
  const { signal } = request;
  // 列表读数的上游截止时间就是首页的截止时间：HTML 与路由数据请求共用同一个新鲜度。
  const upstream = new Headers();
  const [data, weekly, timeline, brands] = await Promise.all([
    loadOr404<PoolResponse>(listPath("/api/site/pool", { channel: filters.channel, category: filters.category, tag, kind: changeKind, uncat: uncategorized ? "1" : null }), {
      signal,
      busyRedirect: `/search-busy${url.search}`,
      responseHeaders: upstream,
    }),
    apiGet<ReportLatestPage>("/api/site/reports/weekly/latest-page", { signal }).catch(() => null),
    apiGet<TimelineResponse>("/api/site/timeline?limit=20", { signal }).catch(() => null),
    // 名册读失败就不渲染筛选行，首页本身照常。
    apiGet<BrandsResponse>("/api/site/brands", { signal }).catch(() => null),
  ]);
  return cachedPage(60, {
    data,
    brand,
    brands,
    reading: buildReading(weekRanking(weekly?.report ?? null), timeline, data),
  }, upstream);
}

export function meta({ loaderData }: Route.MetaArgs) {
  const titles = loaderData?.data.items.map((item) => item.title) ?? [];
  // 厂商筛选是浏览视图，不索引：canonical 回到未筛选的首页。
  const brand = loaderData?.brand ?? null;
  return pageMeta({
    path: "/",
    description: "给全球企业服务从业者的信息流：官方一手动态，覆盖 AI 产品、Agent、Copilot、企业软件与市场动作，按收录时间排列；每天 08:00 另发一期每日精选。",
    noindex: !!brand,
    jsonLd: brand ? undefined : [...siteLd(), itemListLd("/", "全部动态", titles)],
  });
}

export default function Home() {
  const { data, brand, brands, reading } = useLoaderData<typeof loader>();
  return <FrontPage data={data} reading={reading} brand={brand} brands={brands} />;
}
