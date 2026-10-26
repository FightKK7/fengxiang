import { useLoaderData } from "react-router";
import type { Route } from "./+types/report-latest";
import { REPORT_NAMES, type ReportLatestPage } from "@aihot/contracts/site";
import { REPORTS, withSubject } from "@aihot/site";
import { cachedPage, loadOr404 } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { pageMeta, reportLd } from "../lib/seo";
import { beijingDate } from "@aihot/contracts/time";
import { ReportLayout, ReportPhoneBar } from "../features/report/ReportLayout";
import { ReportPaper } from "../features/report/ReportPaper";
import { enrichReport } from "../features/report/entries";
import { EDITION, feedLink, kindFromPath } from "../features/report/format";
import type { Screen } from "../components/shell/screens";

export const handle: Screen = { tab: "daily", name: "每日精选" };
export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

export async function loader({ request }: Route.LoaderArgs) {
  const kind = kindFromPath(new URL(request.url).pathname);
  const { report } = await loadOr404<ReportLatestPage>(`/api/site/reports/${kind}/latest-page`, { signal: request.signal });
  const page = report ? await enrichReport(report, request.signal) : null;
  return cachedPage(600, { kind, report, today: beijingDate(Date.now()), page });
}

export function meta({ loaderData, location }: Route.MetaArgs) {
  const kind = loaderData?.kind ?? "daily";
  const report = loaderData?.report;
  // 编辑写的今日判断优先作为这一页的摘要（安静日只有它可讲），没有才用分类的通用文案。
  const description = report?.verdict ? [report.verdict.title, report.verdict.body].filter(Boolean).join("：") : `${REPORTS.descriptions[kind]}。`;
  return [...pageMeta({
    title: withSubject(REPORT_NAMES[kind]),
    description,
    path: location.pathname,
    image: `/og/pages/${kind}.png`,
    // The latest issue, described at this page's own address (its canonical).
    jsonLd: report ? reportLd(report, location.pathname, report.lead?.leadParagraph ?? description) : undefined,
  }), feedLink(kind)];
}

export default function ReportLatestPage() {
  const { kind, report, today, page } = useLoaderData<typeof loader>();
  return (
    <ReportLayout phone={<ReportPhoneBar kind={kind} />}>
      {report && page ? (
        <ReportPaper report={report} sections={page.sections} count={page.count} today={today} />
      ) : (
        <>
          <header className="fx-report-head">
            <h1 data-page-title="" className="fx-report-title">{REPORT_NAMES[kind]}</h1>
            <p className="fx-report-meta">{EDITION[kind]}</p>
          </header>
          <p className="fx-empty">{`第一期${REPORT_NAMES[kind]}还没出刊。`}</p>
        </>
      )}
    </ReportLayout>
  );
}
