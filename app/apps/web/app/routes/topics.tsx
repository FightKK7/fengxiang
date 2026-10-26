import type { CSSProperties } from "react";
import { useLoaderData } from "react-router";
import { beijingDay } from "@aihot/contracts/time";
import { SITE, subjectAfter } from "@aihot/site";
import type { Route } from "./+types/topics";
import type { TopicSummary, TopicsResponse } from "@aihot/contracts/site";
import { apiGet, cachedPage } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { breadcrumbLd, pageMeta, siteUrl } from "../lib/seo";
import { BrandMark } from "../components/BrandMark";
import { IntentLink } from "../components/ui/IntentLink";
import { PhoneBar } from "../components/shell/PhoneBar";
import { navUp } from "../components/shell/nav";
import type { Screen } from "../components/shell/screens";
import "../fx-pages-content.css";

export const handle: Screen = { home: navUp("/topics").tab, name: "企业厂商" };
export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

export async function loader({ request }: { request: Request }) {
  return cachedPage(60, await apiGet<TopicsResponse>("/api/site/topics", { signal: request.signal }));
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return pageMeta({ title: SITE.topicsTitle, path: "/topics", image: "/og/pages/topics.png" });
  const { groups, topics } = loaderData;
  const by = groups.map((g) => g.name).join("、");
  const indexed = topics.filter((t) => t.indexable);
  const named = indexed.slice(0, 6).map((t) => t.name.split(" / ")[0]).join("、");
  const base = siteUrl();
  return pageMeta({
    title: SITE.topicsTitle,
    description: `按${by}${subjectAfter("追踪", "最新动态")}：${named ? `${named}等 ` : ""}${topics.length} 个企业厂商，浏览最新动态与重要进展，持续更新。`,
    path: "/topics",
    image: "/og/pages/topics.png",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "@id": `${base}/topics#collection`,
        url: `${base}/topics`,
        name: "企业厂商",
        inLanguage: SITE.locale,
        isPartOf: { "@id": `${base}/#website` },
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: indexed.length,
          itemListElement: indexed.map((t, i) => ({ "@type": "ListItem", position: i + 1, name: t.name, url: `${base}/topics/${t.slug}` })),
        },
      },
      breadcrumbLd([{ name: SITE.name, path: "/" }, { name: "企业厂商", path: "/topics" }]),
    ],
  });
}

/** 近 30 天的条数，目录里唯一的计数口径。 */
function RecentCount({ topic }: { topic: TopicSummary }) {
  return (
    <span className="fxc-tile-count">
      近 30 天 <b>{topic.recent}</b> 条
    </span>
  );
}

/**
 * 目录第一行的四个固定位（编辑指定）：DSH、DeepSeek、飞书、OpenAI。
 * 其余公司按热度排：近 30 天精选 → 总精选 → 最新一条的时间；都相同就保持 industry/topics.json 的顺序。
 * 改第一行只改这个数组；热度口径改 `orderCompanies`。
 */
const LEADING_COMPANIES = ["dsh", "deepseek", "feishu", "openai"];

const latestTime = (topic: TopicSummary) => (topic.latest ? Date.parse(topic.latest.at) || 0 : 0);

function orderCompanies(list: TopicSummary[]): TopicSummary[] {
  const lead = LEADING_COMPANIES.flatMap((slug) => list.filter((topic) => topic.slug === slug));
  const rest = list
    .filter((topic) => !LEADING_COMPANIES.includes(topic.slug))
    .sort((a, b) => b.recent - a.recent || b.total - a.total || latestTime(b) - latestTime(a));
  return [...lead, ...rest];
}

export default function TopicsPage() {
  const { groups, topics } = useLoaderData<typeof loader>();
  return (
    <div className="fxc-page">
      <PhoneBar back={{ to: "/more", label: "我的" }} title="企业厂商" />
      {/* 版面上不留页头：导航已经标出「企业厂商」。标题只给读屏和搜索引擎。 */}
      <h1 className="sr-only">{subjectAfter("按企业厂商看")}</h1>
      <div className="fxc-catalog">
        {groups.map((group) => {
          const list = topics.filter((t) => t.group === group.key);
          // 公司是目录的主角（带标、带最新一条）；方向与内容形态是紧凑索引。
          const company = group.key === "company";
          const ordered = company ? orderCompanies(list) : list;
          // 公司格子数除不尽时，末行右侧的空位放一句「持续接入中」：4 列补 span-4、2 列补 span-2，1 列整行。
          const remain4 = company ? (4 - (ordered.length % 4)) % 4 : 0;
          const remain2 = company ? (2 - (ordered.length % 2)) % 2 : 0;
          return (
            <section key={group.key} className="fxc-sec" aria-label={group.name}>
              <ul className={`fxc-grid ${company ? "fxc-grid-company" : "fxc-grid-index"}`}>
                {ordered.map((topic) => (
                  <li key={topic.slug} className="fxc-cell">
                    <IntentLink
                      viewTransition
                      to={`/topics/${topic.slug}`}
                      className={company ? `fxc-tile${topic.latest ? "" : " fxc-tile-plain"}` : "fxc-tile fxc-tile-index"}
                    >
                      {company ? (
                        <>
                          <span className="fxc-tile-head">
                            <BrandMark brand={topic.brand} size={28} plate={false} />
                            <span className="fxc-tile-name">{topic.name}</span>
                          </span>
                          {topic.latest ? (
                            <>
                              <span className="fxc-tile-latest">{topic.latest.title}</span>
                              <span className="fxc-tile-meta">
                                <span className="fxc-tile-date">{beijingDay(topic.latest.at)}</span>
                                <RecentCount topic={topic} />
                              </span>
                            </>
                          ) : (
                            <span className="fxc-tile-meta">
                              <span className="fxc-tile-date" />
                              <RecentCount topic={topic} />
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <span className="fxc-tile-head">
                            <span className="fxc-tile-name">{topic.name}</span>
                            <RecentCount topic={topic} />
                          </span>
                          {topic.latest && <span className="fxc-tile-latest fxc-tile-latest-index">{topic.latest.title}</span>}
                        </>
                      )}
                    </IntentLink>
                  </li>
                ))}
                {company && ordered.length > 0 && (
                  <li
                    className={`fxc-cell fxc-cell-more${remain4 ? "" : " fxc-more-full-4"}${remain2 ? "" : " fxc-more-full-2"}`}
                    style={{ "--span-4": remain4, "--span-2": remain2 } as CSSProperties}
                  >
                    <p className="fxc-more-title">持续接入中</p>
                    <p className="fxc-more-note">更多厂商与信源在接入</p>
                  </li>
                )}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
