import { Link, useLoaderData } from "react-router";
import { BackLink } from "../components/ui/BackLink";
import { IntentLink } from "../components/ui/IntentLink";
import type { HotEntryView, HotResponse } from "@aihot/contracts/site";
import { SITE, withSubject } from "@aihot/site";
import { cachedPage, loadOr404 } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { pageMeta } from "../lib/seo";
import { monthDayTime } from "../lib/format";
import { IconChevronDown, IconInfo } from "../components/icons";
import { Sparkline } from "../features/hot/Sparkline";
import { Faces } from "../features/hot/Faces";
import { PhoneBar } from "../components/shell/PhoneBar";
import { navUp } from "../components/shell/nav";
import { scrollBehavior } from "../lib/motion";
import type { Screen } from "../components/shell/screens";
import "../fx-pages-tools.css";
import { FxMark } from "../components/shell/FxMark";

export const handle: Screen = { tab: navUp("/hot").tab, name: "风向榜" };
export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

export async function loader({ request }: { request: Request }) {
  return cachedPage(120, { hot: await loadOr404<HotResponse>("/api/site/hot", { signal: request.signal }) });
}

export function meta() {
  return pageMeta({
    title: "风向榜",
    description: "过去 48 小时多家官方信源共同覆盖的 10 个事件：覆盖量、走势与报道来源。",
    path: "/hot",
    image: "/og/pages/hot.png",
    noindex: true,
  });
}

const BADGES: Record<HotEntryView["badges"][number], { label: string; hint: string }> = {
  surge: { label: "爆", hint: "讨论快速增加" },
  new: { label: "新", hint: "首报 6 小时内" },
  rising: { label: "发酵中", hint: "讨论仍在增加" },
};

const pad = (rank: number) => String(rank).padStart(2, "0");

/** "某媒体、某账号 等 4 个来源 · 7 位参与者". */
function Voices({ e }: { e: HotEntryView }) {
  const names = e.sourceNames.slice(0, 2);
  return (
    <span className="fxh-voices">
      {/* Lines break between the phrases, never inside one. */}
      <span className="fxh-nowrap">
        {names.length > 0 && <span className="fxh-voices-name">{names.join("、")}</span>}
        {e.sourceCount > names.length ? ` 等 ${e.sourceCount} 个来源` : names.length ? " 报道" : `${e.sourceCount} 个来源`}
      </span>
      <span className="fxh-nowrap">
        <span className="num">{e.participantCount}</span> 位参与者
      </span>
    </span>
  );
}

/** 榜单的三种标记：方角细框，红只给编辑判断（爆 / 新）。 */
function Badges({ e }: { e: HotEntryView }) {
  return e.badges.map((b) => (
    <span key={b} className={`fxh-badge fxh-badge-${b}`} title={BADGES[b].hint}>
      {BADGES[b].label}
    </span>
  ));
}

/** 较 6 小时前：纸面上的一行元信息，不是圆角胶囊。 */
function Delta({ e }: { e: HotEntryView }) {
  if (e.trend === "unknown") return <span className="fxh-delta" title="部分信源的采集暂时落后，先不和 6 小时前比较">暂不比较</span>;
  if (e.trend === "new" || e.trendPct === null) return <span className="fxh-delta fxh-delta-accent">新上榜</span>;
  if (e.trend === "flat") return <span className="fxh-delta" title="较 6 小时前">持平</span>;
  const up = e.trend === "up";
  return (
    <span className={`fxh-delta${up ? " fxh-delta-accent" : ""}`} title="较 6 小时前">
      {up ? "↑" : "↓"} {Math.abs(Math.round(e.trendPct))}%
    </span>
  );
}

/** The whole card opens the event; the title carries the link. */
function StoryLink({ e }: { e: HotEntryView }) {
  return (
    <IntentLink viewTransition to={`/story/${e.story.publicId}`}>
      {e.story.title}
    </IntentLink>
  );
}

/**
 * The lead's picture slot when the story has no picture of its own: its day of heat, drawn large
 * on the paper, with where it peaked. Without enough comparable hours the text takes the width.
 */
function HeatPanel({ e }: { e: HotEntryView }) {
  const seen = e.spark.filter((v): v is number => v !== null);
  const peak = Math.max(...seen);
  const peakAt = e.spark.findIndex((v) => v === peak);
  return (
    <div className="fxh-panel">
      <div className="fxh-panel-head">
        <span>24 小时热度</span>
        <span>
          峰值 <span className="num">{Math.round(peak)}</span>
          {peakAt >= 0 && <span>（{peakAt === e.spark.length - 1 ? "当前" : `${e.spark.length - 1 - peakAt} 小时前`}）</span>}
        </span>
      </div>
      <Sparkline values={e.spark} className="fxh-spark fxh-spark-panel" />
      <div className="fxh-panel-foot">
        <span>24 小时前</span>
        <span>现在</span>
      </div>
    </div>
  );
}

/** No. 1: the event people are talking about most, with its picture, digest, latest turn and day of heat. */
function Lead({ e }: { e: HotEntryView }) {
  // 有配图用配图；没有配图但有足够可比小时数时，用热度面板（原框架里那张大图的位置）
  const panel = !e.cover && e.spark.filter((v) => v !== null).length >= 3;
  return (
    <article className="fxh-lead">
      <div className="fxh-item-top">
        <span className="fxh-rank">NO.{pad(e.rank)}</span>
        <Badges e={e} />
        <Delta e={e} />
      </div>
      <div className={`fxh-lead-body${e.cover || panel ? " fxh-lead-body-media" : ""}`}>
        <div className="fxh-lead-main">
          <h2 className="fxh-lead-title">
            <StoryLink e={e} />
          </h2>
          {e.summary && <p className="fxh-sum">{e.summary}</p>}
        </div>
        {e.cover ? (
          <img
            className="fxh-cover"
            src={e.cover.url}
            srcSet={e.cover.srcSet}
            sizes="(min-width: 1024px) 400px, calc(100vw - 60px)"
            width={e.cover.width ?? undefined}
            height={e.cover.height ?? undefined}
            alt=""
            loading="eager"
            fetchPriority="high"
            decoding="async"
          />
        ) : panel ? (
          <HeatPanel e={e} />
        ) : null}
      </div>
      {/* Side by side while the card is wide enough; on a phone the heat sits under the voices. */}
      <div className="fxh-lead-foot">
        <div className="fxh-lead-notes">
          {e.latest && (
            <p className="fxh-latest">
              <span className="fxh-latest-label">最新进展</span>
              {e.latest}
            </p>
          )}
          <div className="fxh-faces-row">
            <Faces participants={e.participants} total={e.participantCount} size={24} />
            <Voices e={e} />
          </div>
        </div>
        <div className="fxh-heat">
          {!panel && <Sparkline values={e.spark} className="fxh-spark fxh-spark-lead" />}
          <span className="fxh-heat-num num">{Math.round(e.heat)}</span>
          <span className="fxh-heat-label">热度指数</span>
        </div>
      </div>
    </article>
  );
}

/** No. 2 and 3: the same block, smaller, without the picture. */
function Runner({ e }: { e: HotEntryView }) {
  return (
    <article className="fxh-runner">
      <div className="fxh-item-top">
        <span className="fxh-rank">NO.{pad(e.rank)}</span>
        <Badges e={e} />
        <Delta e={e} />
      </div>
      <h2 className="fxh-runner-title">
        <StoryLink e={e} />
      </h2>
      {e.summary && <p className="fxh-sum fxh-sum-sm">{e.summary}</p>}
      <div className="fxh-runner-foot">
        <div className="fxh-faces-col">
          <Faces participants={e.participants} total={e.participantCount} size={20} />
          <span className="fxh-count">
            <span className="num">{e.sourceCount}</span> 个来源，<span className="num">{e.participantCount}</span> 位参与者
          </span>
        </div>
        <div className="fxh-runner-heat">
          <Sparkline values={e.spark} className="fxh-spark fxh-spark-runner" />
          <span className="fxh-heat-sm num">{Math.round(e.heat)}</span>
        </div>
      </div>
    </article>
  );
}

/** No. 4–10: a row each, with a line of the digest, faces, the day of heat and the index. */
function Row({ e }: { e: HotEntryView }) {
  return (
    <li className="fxh-row">
      <span className="fxh-row-rank num" aria-label={`热度排名第 ${e.rank} 位`}>
        {pad(e.rank)}
      </span>
      <div className="fxh-row-main">
        <h3 className="fxh-row-title">
          <StoryLink e={e} />
          {e.badges.length > 0 && (
            <span className="fxh-row-badges">
              <Badges e={e} />
            </span>
          )}
        </h3>
        {e.summary && <p className="fxh-row-sum">{e.summary}</p>}
        <div className="fxh-row-mobile">
          <Faces participants={e.participants} total={e.participantCount} size={20} />
          <span className="fxh-count">
            <span className="num">{e.sourceCount}</span> 个来源
          </span>
          <span className="fxh-row-mobile-heat">
            <span className="fxh-heat-sm num">{Math.round(e.heat)}</span>
            <Delta e={e} />
          </span>
        </div>
      </div>
      <div className="fxh-row-faces">
        <Faces participants={e.participants} total={e.participantCount} size={20} />
      </div>
      <Sparkline values={e.spark} className="fxh-spark fxh-spark-row" />
      <div className="fxh-row-heat">
        <span className="fxh-heat-md num">{Math.round(e.heat)}</span>
        <Delta e={e} />
      </div>
    </li>
  );
}

/** Opens "热度是怎么算的" at the foot of the page and brings it into view. */
function showMethod() {
  const method = document.getElementById("hot-method") as HTMLDetailsElement | null;
  if (!method) return;
  method.open = true;
  method.scrollIntoView({ behavior: scrollBehavior(), block: "center" });
}

export default function HotPage() {
  const { hot } = useLoaderData<typeof loader>();
  const [lead, ...rest] = hot.entries;
  const runners = rest.slice(0, 2);
  const others = rest.slice(2);
  return (
    <div className="fxh">
      <PhoneBar
        title="风向榜"
        leading={
          <Link to="/" aria-label={`${SITE.name} 首页`} className="fx-wordmark-mini flex h-11 items-center pl-2.5 pr-2">
            <FxMark small className="fx-wordmark-mini-mark" />
            风向
          </Link>
        }
        actions={
          <button type="button" onClick={showMethod} className="fxh-method-btn">
            <IconInfo size={17} /> 规则
          </button>
        }
      />
      <BackLink to="/" />
      <header className="fxh-head">
        <p className="fxh-kicker">
          <span className="fxh-sq" aria-hidden="true" />
          信源覆盖
        </p>
        <div className="fxh-head-row">
          <div>
            <h1 data-page-title="" className="fxh-title">
              {withSubject("风向榜")}
            </h1>
            <p className="fxh-sub">过去 {hot.windowHours} 小时，多个官方信源共同覆盖的事件</p>
          </div>
          {hot.computedAt && (
            <p className="fxh-meta">
              <span className="num">{monthDayTime(hot.computedAt)}</span> 更新
            </p>
          )}
        </div>
      </header>

      {!lead ? (
        <section className="fxh-empty">
          <h2 className="fxh-empty-title">暂时没有上榜事件</h2>
          <p className="fxh-empty-text">还没有足够多官方信源共同覆盖的事件。</p>
        </section>
      ) : (
        <>
          <section aria-label="前三" className="fxh-top">
            <Lead e={lead} />
            {runners.length > 0 && (
              <div className="fxh-runners">
                {runners.map((e) => (
                  <Runner key={e.story.publicId} e={e} />
                ))}
              </div>
            )}
          </section>

          {others.length > 0 && (
            <section aria-label="其余事件" className="fxh-rest">
              <div className="fxh-rest-head">
                <h2 className="fxh-rest-title">
                  继续看{" "}
                  <span className="num fxh-rest-range">
                    No.{pad(others[0]!.rank)}–{pad(others[others.length - 1]!.rank)}
                  </span>
                </h2>
              </div>
              <ol className="fxh-rows">
                {others.map((e) => (
                  <Row key={e.story.publicId} e={e} />
                ))}
              </ol>
            </section>
          )}
        </>
      )}

      <details id="hot-method" className="fxh-method">
        <summary className="fxh-method-summary">
          <IconInfo size={15} />
          榜单规则
          <span className="fxh-method-hint">
            <span className="fxh-method-closed">展开</span>
            <span className="fxh-method-open">收起</span>
            <IconChevronDown size={13} className="fxh-chevron" />
          </span>
        </summary>
        <div className="fxh-method-body">
          <p>热度看有多少账号和机构在讨论同一件事：同一家重复发只算一次，越近的讨论分量越重，每过 24 小时减半。它只反映讨论热度，不代表报道质量。</p>
          <p>榜单只看过去 48 小时；走势只比较持续观测到的同一批来源，没有可比历史时不画线。来源名单只列能公开阅读的报道，同一机构跨平台发帖合并算一家。</p>
          <dl className="fxh-legend">
            {Object.entries(BADGES).map(([key, b]) => (
              <div key={key}>
                <dt>
                  <span className={`fxh-badge fxh-badge-${key}`}>{b.label}</span>
                </dt>
                <dd>{b.hint}</dd>
              </div>
            ))}
          </dl>
        </div>
      </details>
    </div>
  );
}
