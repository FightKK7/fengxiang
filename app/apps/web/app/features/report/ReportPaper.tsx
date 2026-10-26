// 一期每日精选的版面：报眼（期号 · 期日期 · 条数）→ 判断/导读 → 分节（2px 黑上框 + 11px 小黑字标签）→
// 条目（分类 · 厂商 / 19px 宋体标题 / 14px 摘要 / 所以呢红竖线 / 来源）→ 页脚（站名 · 前后期 · 合订本）。
// 报头归全站壳刊头（桌面）与 PhoneBar（手机），这里只排正文；无卡片、无评分、无色块。
import { Link } from "react-router";
import type { ReportDetail, ReportKind } from "@aihot/contracts/site";
import { REPORT_NAMES } from "@aihot/contracts/site";
import { CATEGORY_LABELS } from "@aihot/contracts/taxonomy";
import { ITEM_COPY, SITE } from "@aihot/site";
import { dateLine, neighbourLabel, reportPath } from "./format";
import { weekdayShort } from "../../lib/format";
import type { ReportEntry, ReportSection } from "./entries";

const pad3 = (n: number) => String(n).padStart(3, "0");

/** 期日期：每日精选写「10 月 22 日 周四」，周报/月报沿用发行日线。 */
export function issueDate(kind: ReportKind, key: string): string {
  if (kind === "daily") return `${Number(key.slice(5, 7))} 月 ${Number(key.slice(8, 10))} 日 ${weekdayShort(key)}`;
  return dateLine(kind, key);
}

function Entry({ entry }: { entry: ReportEntry }) {
  return (
    <article className="fx-report-entry" id={entry.itemId ? `r-${entry.itemId}` : undefined}>
      <div className="fx-kicker">
        {entry.category && <span className="fx-cat">{CATEGORY_LABELS[entry.category]}</span>}
        {entry.category && entry.vendor && <span className="fx-sep" aria-hidden="true" />}
        {entry.vendor && <span className="fx-vendor">{entry.vendor}</span>}
        {!entry.available && <span className="fx-report-gone">已下架</span>}
      </div>
      <h3 className="fx-h2">
        {entry.itemId && entry.available ? <Link to={`/items/${entry.itemId}`}>{entry.title}</Link> : entry.title}
      </h3>
      {entry.summary && <p className="fx-sum">{entry.summary}</p>}
      {entry.reason && (
        <div className="fx-so">
          <span className="fx-so-label">{ITEM_COPY.reasonLabel}</span>
          <p className="fx-so-p">{entry.reason}</p>
        </div>
      )}
      <div className="fx-src">
        {entry.available ? (
          <a href={entry.sourceUrl} target="_blank" rel="noopener noreferrer">
            {entry.sourceName}
          </a>
        ) : (
          <span>{entry.sourceName}</span>
        )}
        {entry.otherSources != null && entry.otherSources > 0 ? (
          <span>另有 {entry.otherSources} 家来源</span>
        ) : entry.firstParty ? (
          <span>官方一手</span>
        ) : null}
      </div>
    </article>
  );
}

export function ReportPaper({
  report,
  sections,
  count,
  today,
}: {
  report: ReportDetail;
  sections: ReportSection[];
  count: number;
  /** 北京今天：最新一期的期日期和报头右上角日期是同一天，不再重复写。 */
  today: string;
}) {
  const firstEntryTitle = sections[0]?.entries[0]?.title ?? null;
  // 出刊台写进报告的「今日判断」在这里落地；没有人工判断时沿用旧口径：导语与头条不同才显示，
  // 避免和第一条重复。安静日没有条目，导语就是这一期唯一的正文。
  const verdict = report.verdict;
  const lead = report.lead;
  const shown = verdict
    ? { label: "今日判断", title: verdict.title, body: verdict.body ?? null }
    : lead && lead.title !== firstEntryTitle
      ? { label: report.kind === "daily" ? "本期导读" : "本期综述", title: lead.title, body: lead.leadParagraph || report.overview || null }
      : null;
  const date = issueDate(report.kind, report.key);
  const showDate = report.key !== today;
  return (
    <article>
      {/* 页面标题（读屏/搜索引擎）：期号、期日期、条数各说一次。 */}
      <h1 className="sr-only">{`${SITE.name} ${REPORT_NAMES[report.kind]} 第 ${pad3(report.issueNumber)} 期 ${date} 本期 ${count} 条`}</h1>
      {/* 报眼：全页唯一一处期号/条数；最新期与报头日期同一天，不再重复。 */}
      <p className="fx-issuebar fx-report-issue">
        <span className="fx-issue-sq" aria-hidden="true" />
        <span className="fx-issue-no">{`第 ${pad3(report.issueNumber)} 期`}</span>
        {showDate && <span>{date}</span>}
        <span>{`本期 ${count} 条`}</span>
      </p>
      {shown && (
        <section className="fx-verdict" aria-labelledby="fx-verdict-t">
          <h2 id="fx-verdict-t" className="fx-klabel">
            {shown.label}
          </h2>
          <p className="fx-verdict-h">{shown.title}</p>
          {shown.body && <p className="fx-verdict-p">{shown.body}</p>}
        </section>
      )}
      {sections.map((section) => (
        <section key={section.id} id={section.id} aria-labelledby={`${section.id}-t`} className="fx-report-section">
          <header className="fx-report-section-head">
            <h2 id={`${section.id}-t`} className="fx-report-section-label">
              {section.label}
            </h2>
            <span className="fx-report-section-count">{section.entries.length} 条</span>
          </header>
          {section.summary && <p className="fx-report-section-sum">{section.summary}</p>}
          {section.entries.map((entry) => (
            <Entry key={`${section.id}-${entry.key}`} entry={entry} />
          ))}
        </section>
      ))}

      {/* 页脚一行：站名 · 前后期 · 合订本；条数在报眼，这里不再报。 */}
      <footer className="fx-report-foot">
        <div>{`${SITE.name}　${REPORT_NAMES[report.kind]}`}</div>
        <div className="fx-report-foot-nav">
          {report.prev && <Link to={reportPath(report.kind, report.prev)}>{neighbourLabel(report.kind, report.prev, "prev")}</Link>}
          {report.next && <Link to={reportPath(report.kind, report.next)}>{neighbourLabel(report.kind, report.next, "next")}</Link>}
        </div>
        {report.kind === "daily" && (
          <Link to="/daily/archive" className="fx-report-foot-link">
            合订本 →
          </Link>
        )}
      </footer>
    </article>
  );
}
