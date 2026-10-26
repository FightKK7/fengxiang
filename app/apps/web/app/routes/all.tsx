// 搜索：/all 只剩这一次搜索的结果，不再是一张「全部动态」的旧列表页。
// 时间线只有一条（首页 /）：没有搜索的 /all 与旧分页、旧筛选地址一律回首页。
// 搜索结果沿用时间线的日分组与无限滚动（StreamDayList），只有排序切换是搜索自己的东西。
import { useEffect } from "react";
import { Link, redirect, useLoaderData, useNavigation, useSearchParams } from "react-router";
import type { Route } from "./+types/all";
import { isChangeKind, type PoolResponse } from "@aihot/contracts/site";
import { SITE } from "@aihot/site";
import { cachedPage, loadOr404 } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { filterParams, listPath, pageMeta, readFilters } from "../lib/seo";
import { StreamDayList } from "../features/feed/StreamDayList";
import { IconSearch } from "../components/icons";
import { PhoneBar } from "../components/shell/PhoneBar";
import type { Screen } from "../components/shell/screens";
import { openSearch } from "../features/search/SearchOverlay";
import { addRecentSearch } from "../lib/local-state";

export const handle: Screen = { tab: "featured", name: "搜索" };
export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

/** 旧地址里的筛选、变更类型与未分类：带回首页或带进搜索页，旧链接仍能看到它要的那批内容。 */
function carried(params: URLSearchParams) {
  const kind = params.get("kind");
  return {
    ...filterParams(readFilters(params)),
    kind: isChangeKind(kind) ? kind : null,
    uncat: params.get("uncat") === "1" ? "1" : null,
  };
}

/** 首页地址：旧的分页、深页参数从不进入时间线地址。 */
function homeAddress(params: URLSearchParams) {
  return listPath("/", carried(params));
}

/** 搜索地址：查询词与排序留下，页码与旧定位参数丢掉。 */
function searchAddress(params: URLSearchParams) {
  const q = params.get("q")?.trim().slice(0, 200) || null;
  const tab = q && params.get("tab") === "relevance" ? "relevance" : null;
  return listPath("/all", { ...carried(params), q, tab });
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim().slice(0, 200) || null;
  // 没有搜索就不该停在 /all：时间线在首页，旧的分页与筛选深页也回首页。
  if (!q) throw redirect(homeAddress(url.searchParams));
  // 翻页已由滚动接管：旧分页地址回到这一次搜索的第一屏。
  if (url.searchParams.has("page")) throw redirect(searchAddress(url.searchParams));
  const tab = url.searchParams.get("tab") === "relevance" ? "relevance" : null;
  const filters = readFilters(url.searchParams);
  const kindParam = url.searchParams.get("kind");
  const changeKind = isChangeKind(kindParam) ? kindParam : null;
  const uncategorized = url.searchParams.get("uncat") === "1";
  const data = await loadOr404<PoolResponse>(
    listPath("/api/site/pool", { ...filterParams(filters), kind: changeKind, uncat: uncategorized ? "1" : null, q, tab }),
    // The busy page keeps the search, so it can be tried again as it was.
    { signal: request.signal, busyRedirect: `/all/search-busy${url.search}` },
  );
  return cachedPage(60, { data });
}

export function meta({ loaderData }: Route.MetaArgs) {
  const f = loaderData?.data.filters;
  const q = f?.q ?? "";
  const path = listPath("/all", { q, tab: f?.tab === "relevance" ? "relevance" : null });
  return pageMeta({
    title: `搜索：${q}`,
    description: `${SITE.name} 的站内搜索：在标题、摘要与正文中查找“${q}”。`,
    path,
    noindex: true,
  });
}

export default function SearchPage() {
  const { data } = useLoaderData<typeof loader>();
  const [params] = useSearchParams();
  const navigation = useNavigation();
  const f = data.filters;
  const busy = navigation.state === "loading" && navigation.location?.pathname === "/all";
  const searchTabHref = (tab: "time" | "relevance") => {
    const sp = new URLSearchParams(params);
    sp.set("q", f.q ?? "");
    if (tab === "relevance") sp.set("tab", "relevance");
    else sp.delete("tab");
    return `/all?${sp}`;
  };
  const total = data.total >= 2000 ? "2000+" : data.total;
  // Searches are remembered in this browser for the phone search (listed in the privacy notice).
  useEffect(() => {
    if (f.q) addRecentSearch(f.q);
  }, [f.q]);
  return (
    <div className="fx-all">
      {/* Phones: the query (tap to change it) and back to the timeline. */}
      <PhoneBar
        back={{ to: "/", label: "动态" }}
        center={
          <button type="button" onClick={(event) => openSearch(f.q ?? "", event.currentTarget)} className="fx-phone-q">
            <IconSearch size={14} className="shrink-0 text-ink-4" />
            <span>{f.q}</span>
          </button>
        }
      />

      <div className="fx-all-col">
        <header className="fx-all-head hidden lg:flex">
          <h1 className="fx-all-title">搜索“{f.q}”</h1>
          <p className="fx-all-meta">找到 {total} 条</p>
        </header>
        <div className="fx-sort">
          <nav className="fx-sort-items" aria-label="搜索排序">
            {(["time", "relevance"] as const).map((t) => (
              <Link
                key={t}
                to={searchTabHref(t)}
                aria-current={f.tab === t ? "page" : undefined}
                className={`fx-sort-link${f.tab === t ? " fx-sort-on" : ""}`}
              >
                {t === "time" ? "按时间" : "按相关度"}
              </Link>
            ))}
          </nav>
          <span className="fx-all-meta lg:hidden">找到 {total} 条</span>
        </div>

        <div className={`transition-opacity duration-[250ms] ease-out ${busy ? "opacity-50" : ""}`}>
          {data.items.length === 0 ? (
            <div className="fx-empty">
              <p>没有找到相关内容。</p>
              <p>
                换个词，或
                <Link to="/" className="fx-link">
                  回时间线
                </Link>
                看看。
              </p>
            </div>
          ) : (
            <StreamDayList initial={data} />
          )}
        </div>
      </div>
    </div>
  );
}
