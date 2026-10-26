import { useEffect, useState, type ComponentType } from "react";
import { BackLink } from "../components/ui/BackLink";

import type { ChangelogRelease, ChangelogResponse } from "@aihot/contracts/site";
import { SITE } from "@aihot/site";
import { Link, useLoaderData } from "react-router";
import { apiGet, cachedPage } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { pageMeta } from "../lib/seo";
import { setChangelogSeen } from "../lib/local-state";
import { Inline, dateHeading } from "../features/changelog/text";
import { PhoneBar } from "../components/shell/PhoneBar";
import type { Screen } from "../components/shell/screens";
import "../fx-pages-tools.css";

export const handle: Screen = { tab: "me", name: "更新日志" };
export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

type Release = ChangelogRelease;

export async function loader({ request }: { request: Request }) {
  return cachedPage(300, await apiGet<ChangelogResponse>("/api/site/changelog", { signal: request.signal }));
}

export function meta() {
  return pageMeta({ title: "更新日志", description: `${SITE.name} 的功能更新、优化、公告与下线记录。`, path: "/changelog", image: "/og/pages/changelog.png" });
}

const KINDS: Release["kind"][] = ["更新", "优化", "公告", "下线"];

function ReleaseBody({ lines }: { lines: string[] }) {
  const blocks: Array<string | string[]> = [];
  for (const line of lines) {
    const last = blocks.at(-1);
    if (!line.startsWith("- ")) blocks.push(line);
    else if (Array.isArray(last)) last.push(line.slice(2));
    else blocks.push([line.slice(2)]);
  }
  return blocks.map((b, i) =>
    Array.isArray(b) ? (
      <ul key={i}>
        {b.map((li, j) => (
          <li key={j}>
            <Inline text={li} />
          </li>
        ))}
      </ul>
    ) : (
      <p key={i}>
        <Inline text={b} />
      </p>
    ),
  );
}

/** One date's releases as hairline rows; `id` is the jump target of the month index. */
function Day({ date, releases, id }: { date: string; releases: Release[]; id?: string }) {
  const h = dateHeading(date);
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="fxp-datebar">
        {h.label}
        <span>{h.weekday}</span>
      </h2>
      <ol className="fxp-rel-list">
        {releases.map((r) => (
          <li key={`${r.date}-${r.time}-${r.title}`} className={`fxp-rel ${r.urgent ? "fxp-rel-urgent" : ""}`}>
            <div>
              <time dateTime={date} className="fxp-rel-time">
                {r.time}
              </time>
              <div className="fxp-rel-kinds">
                <span className={`fxp-sq ${r.urgent ? "fxp-sq-ink" : ""}`} aria-hidden="true" />
                {r.kind}
              </div>
            </div>
            <div className="min-w-0">
              {r.urgent && <span className="fxp-tag">重要</span>}
              <h3 className="fxp-rel-title">{r.title}</h3>
              <div className="fxp-rel-body">
                <ReleaseBody lines={r.body} />
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Draws a major release: its `feature`, whose shape is the site's. */
type FeatureDrawing = ComponentType<{ release: Release; id?: string }>;

/** The site's drawing (site/changelog/FeatureRelease.tsx), when it ships one. */
const SITE_FEATURE = Object.values(import.meta.glob<FeatureDrawing>("../../../../site/changelog/FeatureRelease.tsx", { eager: true, import: "FeatureRelease" }))[0];

/**
 * A date with a major release: each release's `feature` is drawn as its own block by the site's drawing,
 * the first one carrying the date's anchor, above a date's other releases; `body` stays the short form.
 */
function FeatureDay({ date, releases, Drawing }: { date: string; releases: Release[]; Drawing: FeatureDrawing }) {
  const features = releases.filter((r) => r.feature);
  const plain = releases.filter((r) => !r.feature);
  return (
    <>
      {features.map((r, i) => (
        <Drawing key={`${r.date}-${r.time}`} release={r} id={i === 0 ? `d-${date}` : undefined} />
      ))}
      {plain.length > 0 && <Day date={date} releases={plain} />}
    </>
  );
}

export default function ChangelogPage() {
  const data = useLoaderData<typeof loader>();
  useEffect(() => setChangelogSeen(data.latestVersion), [data.latestVersion]);
  const [kind, setKind] = useState<Release["kind"] | null>(null);
  const groups = new Map<string, Release[]>();
  for (const r of data.releases) if (!kind || r.kind === kind) groups.set(r.date, [...(groups.get(r.date) ?? []), r]);
  // Month → the newest date shown in it (the jump target) and how many entries it holds.
  const months = new Map<string, { first: string; count: number }>();
  for (const [date, releases] of groups) {
    const month = months.get(date.slice(0, 7)) ?? { first: date, count: 0 };
    month.count += releases.length;
    months.set(date.slice(0, 7), month);
  }
  const countOf = (k: Release["kind"] | null) => (k ? data.releases.filter((r) => r.kind === k).length : data.releases.length);

  const aside = (
    <>
      <section className="fxp-aside-sec">
        <h2 className="fxp-aside-title">按类型看</h2>
        <ul className="fxp-filter-list">
          {[null, ...KINDS].map((k) => (
            <li key={k ?? "all"}>
              <button type="button" onClick={() => setKind(k)} aria-pressed={kind === k} className="fxp-filter">
                <span className={`fxp-sq ${kind === k ? "fxp-sq-ink" : ""}`} aria-hidden="true" />
                <span>{k ?? "全部"}</span>
                <span className="fxp-filter-count">{countOf(k)}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="fxp-aside-sec">
        <h2 className="fxp-aside-title">按月份</h2>
        <nav aria-label="按月份">
          {[...months.entries()].map(([month, m]) => {
            const [y, mo] = month.split("-").map(Number) as [number, number];
            return (
              <a key={month} href={`#d-${m.first}`} className="fxp-aside-jump">
                {y} 年 {mo} 月<span>{m.count} 条</span>
              </a>
            );
          })}
        </nav>
      </section>
      <section className="fxp-aside-sec">
        <h2 className="fxp-aside-title">反馈</h2>
        <p className="fxp-aside-more">想要的功能、用着不顺的地方，去反馈页说。</p>
        <p className="fxp-aside-more">
          <Link to="/feedback" className="fxp-link">去反馈 →</Link>
        </p>
      </section>
    </>
  );

  return (
    <>
    <PhoneBar back={{ to: "/more", label: "我的" }} title="更新日志" />
    <div className="fxp-page fxp-changelog">
      <div className="fxp-read">
        <div className="fxp-read-main">
          <BackLink to="/more" />
          <header className="fxp-head">
            <h1 data-page-title="" className="fxp-title">更新日志</h1>
            <div className="fxp-head-rule" />
          </header>
          <div>
            {groups.size === 0 && (
              <p className="fxp-empty-line">还没有更新记录。每次上线会在这里记一条。</p>
            )}
            {[...groups.entries()].map(([date, releases]) => {
              if (SITE_FEATURE && releases.some((r) => r.feature)) return <FeatureDay key={date} date={date} releases={releases} Drawing={SITE_FEATURE} />;
              return <Day key={date} id={`d-${date}`} date={date} releases={releases} />;
            })}
          </div>
        </div>
        <aside className="fxp-read-aside">{aside}</aside>
      </div>
    </div>
    </>
  );
}
