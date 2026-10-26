import { data, useLoaderData } from "react-router";
import type { Route } from "./+types/report-detail";
import { REPORT_NAMES, type ReportDetail, type ReportKind } from "@aihot/contracts/site";
import { SITE, subjectAfter } from "@aihot/site";
import { cachedPage, loadOr404 } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { pageMeta, reportLd, reportTitle, titled } from "../lib/seo";
import { beijingDate } from "@aihot/contracts/time";
import { ReportLayout, ReportPhoneBar } from "../features/report/ReportLayout";
import { ReportPaper } from "../features/report/ReportPaper";
import { enrichReport } from "../features/report/entries";
import { feedLink, kindFromPath } from "../features/report/format";
import type { Screen } from "../components/shell/screens";

export const handle: Screen = { tab: "daily", name: "每日精选" };
export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

const PATTERN: Record<ReportKind, RegExp> = {
  daily: /^\d{4}-\d{2}-\d{2}$/,
  weekly: /^\d{4}-W\d{2}$/,
  monthly: /^\d{4}-\d{2}$/,
};

export async function loader({ request, params }: Route.LoaderArgs) {
  const kind = kindFromPath(new URL(request.url).pathname);
  const key = params.key ?? "";
  if (!PATTERN[kind].test(key)) throw data({ message: "not_found" }, { status: 404 });
  const report = await loadOr404<ReportDetail>(`/api/site/reports/${kind}/${key}`, { signal: request.signal });
  const page = await enrichReport(report, request.signal);
  return cachedPage(3600, { report, today: beijingDate(Date.now()), page });
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: titled("报告不存在") }, { name: "robots", content: "noindex" }];
  const r = loaderData.report;
  const description = r.lead?.leadParagraph ?? r.overview?.slice(0, 150) ?? (r.verdict ? [r.verdict.title, r.verdict.body].filter(Boolean).join("：") : null) ?? `${SITE.name} ${r.key} ${subjectAfter("的", REPORT_NAMES[r.kind])}。`;
  const path = `/${r.kind}/${r.key}`;
  return [...pageMeta({
    title: reportTitle(r),
    description,
    path,
    image: `/og/reports/${r.kind}/${r.key}.png`,
    type: "article",
    jsonLd: reportLd(r, path, description),
  }), feedLink(r.kind)];
}

export default function ReportDetailPage() {
  const { report, today, page } = useLoaderData<typeof loader>();
  return (
    <ReportLayout phone={<ReportPhoneBar kind={report.kind} />}>
      <ReportPaper report={report} sections={page.sections} count={page.count} today={today} />
    </ReportLayout>
  );
}
