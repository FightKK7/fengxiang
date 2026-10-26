// 每日精选版面的数据整理：报告里的引用只带标题/摘要/来源，分类、厂商和「所以呢」在条目详情里。
// 读取层没有批量接口，按首页的既有做法逐条补详情；失败就退化为只有引用本身的信息。
import type { ReportDetail, SiteItemDetail } from "@aihot/contracts/site";
import type { CategoryKey } from "@aihot/contracts/taxonomy";
import { apiGet } from "../../lib/api.server";

export interface ReportEntry {
  key: string;
  itemId: string | null;
  title: string;
  summary: string | null;
  reason: string | null;
  category: CategoryKey | null;
  vendor: string | null;
  sourceName: string;
  sourceUrl: string;
  publishedAt: string | null;
  firstParty: boolean;
  otherSources: number | null;
  available: boolean;
}

export interface ReportSection {
  id: string;
  label: string;
  summary: string | null;
  entries: ReportEntry[];
}

export interface ReportPageData {
  sections: ReportSection[];
  /** 整期实际排进分节的条目数（同一件事只算一次）。 */
  count: number;
}

const citationKey = (entry: { itemId: string | null; title: string }) => entry.itemId ?? entry.title;

function toEntry(
  citation: ReportDetail["sections"][number]["items"][number],
  detail: SiteItemDetail | null,
): ReportEntry {
  return {
    key: citationKey(citation),
    itemId: citation.itemId,
    title: citation.title,
    summary: citation.summary,
    // 报告引用现在自带「所以呢」；旧报告没有时才回退到条目详情的 reason。
    reason: citation.reason ?? detail?.reason ?? null,
    category: (detail?.category ?? null) as CategoryKey | null,
    vendor: detail?.topics?.[0]?.name ?? null,
    sourceName: citation.sourceName,
    sourceUrl: citation.sourceUrl,
    publishedAt: citation.publishedAt,
    firstParty: citation.firstParty,
    otherSources: citation.otherSources ?? null,
    available: citation.available,
  };
}

/** 分节 + 补全后的条目。sections 保持报告里的顺序与分节名。 */
export async function enrichReport(report: ReportDetail, signal: AbortSignal): Promise<ReportPageData> {
  const ids = [...new Set(report.sections.flatMap((section) => section.items.map((citation) => citation.itemId)).filter((id): id is string => !!id))];
  const details = await Promise.all(
    ids.map((id) => apiGet<SiteItemDetail>(`/api/site/items/${encodeURIComponent(id)}`, { signal }).catch(() => null)),
  );
  const detailById = new Map<string, SiteItemDetail>();
  ids.forEach((id, index) => {
    const detail = details[index];
    if (detail) detailById.set(id, detail);
  });

  const sections: ReportSection[] = report.sections
    .map((section, index) => ({
      id: `s-${index + 1}`,
      label: section.label,
      summary: section.summary,
      entries: section.items.map((citation) => toEntry(citation, citation.itemId ? (detailById.get(citation.itemId) ?? null) : null)),
    }))
    .filter((section) => section.entries.length > 0);

  const seen = new Set(sections.flatMap((section) => section.entries.map((entry) => entry.key)));
  return { sections, count: seen.size };
}
