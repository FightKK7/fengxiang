import { useLoaderData } from "react-router";
import { BackLink } from "../components/ui/BackLink";
import { IntentLink } from "../components/ui/IntentLink";
import { PhoneBar } from "../components/shell/PhoneBar";
import type { ReportIndexEntry, ReportIndexResponse } from "@aihot/contracts/site";
import { REPORT_NAMES } from "@aihot/contracts/site";
import { SITE } from "@aihot/site";
import { apiGet, cachedPage } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { archiveLd, pageMeta } from "../lib/seo";
import { weekdayShort } from "../lib/format";
import { ReportLayout } from "../features/report/ReportLayout";
import { archiveGroups } from "../features/report/format";
import type { Screen } from "../components/shell/screens";

export const handle: Screen = { tab: "daily", name: "合订本" };
export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

export async function loader({ request }: { request: Request }) {
  const { items: index } = await apiGet<ReportIndexResponse>("/api/site/reports/daily", { signal: request.signal });
  return cachedPage(600, { index });
}

export function meta({ loaderData }: { loaderData?: { index: ReportIndexEntry[] } }) {
  const entries = (loaderData?.index ?? []).map((e: ReportIndexEntry) => ({ path: `/daily/${e.key}`, name: e.title ? `${e.key} ${e.title}` : e.key }));
  return pageMeta({
    title: `${REPORT_NAMES.daily} 合订本`,
    description: `${SITE.name} 往期每日精选，按月归档。`,
    path: "/daily/archive",
    image: "/og/pages/daily.png",
    jsonLd: archiveLd("/daily/archive", `${SITE.name} ${REPORT_NAMES.daily} 合订本`, entries),
  });
}

/** 合订本：按月分组，每月一个 2px 黑上框，下面是一行一期的细线目录。 */
export default function DailyArchive() {
  const { index } = useLoaderData<typeof loader>();
  const months = archiveGroups("daily", index);
  const total = index.reduce((max, entry) => Math.max(max, entry.issueNumber), 0) || index.length;
  return (
    <ReportLayout phone={<PhoneBar back={{ to: "/daily", label: REPORT_NAMES.daily }} title="合订本" />}>
      <BackLink to="/daily" label={REPORT_NAMES.daily} />
      <header className="fx-report-head">
        <h1 data-page-title="" className="fx-report-title">合订本</h1>
        <p className="fx-report-meta">{`共 ${total} 期，按月归档；点一天读当期`}</p>
      </header>
      {months.length === 0 ? (
        <p className="fx-empty">还没有往期，第一期发布后会归档在这里。</p>
      ) : (
        months.map((month) => (
          <section key={month.id} className="fx-report-section" aria-labelledby={`m-${month.id}-t`}>
            <header className="fx-report-section-head">
              <h2 id={`m-${month.id}-t`} className="fx-report-section-label">
                {month.label}
              </h2>
              <span className="fx-report-section-count">{month.entries.length} 期</span>
            </header>
            <ol className="fx-archive-list">
              {month.entries.map((entry) => (
                <li key={entry.key}>
                  <IntentLink to={`/daily/${entry.key}`} className="fx-archive-row">
                    <span className="fx-archive-day">
                      <span className="fx-archive-big">{Number(entry.key.slice(8, 10))}</span>
                      <span className="fx-archive-small">{weekdayShort(entry.key)}</span>
                    </span>
                    <span className="fx-archive-title">{entry.title ?? (entry.count ? "" : "安静日")}</span>
                    {!!entry.count && <span className="fx-archive-count">{entry.count} 条</span>}
                  </IntentLink>
                </li>
              ))}
            </ol>
          </section>
        ))
      )}
    </ReportLayout>
  );
}
