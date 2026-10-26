// 时间一致性审计（只读）。2026-10-22 的条目页事故：同一分钟被同时写进 published_at /
// discovered_at / timeline_at，页面三个时间全等。这个脚本用同一条不变量扫描全库，提前抓住同类问题：
//
//   1. 源时间晚于首次发现（未来时间/未过容忍）；
//   2. timeline_at 不符合 decideTimeline（published_at && (trusted || backfill) ? published_at : discovered_at）；
//   3. 不可信源的在线条目按「源声称时间」排序；
//   4. published_at 与 discovered_at 是同一 instant（同一个时钟被复制）；
//   5. publication_time 的精度与 published_at 对不上（日期被伪造成时刻、ISO 不相等）；
//   6. 公开出版物快照里三个时间同样全等（事故会从这里露出来）；
//   7. 未来 timeline_at / discovered_at。
//
// 有 error 时退出码 1；warning 只提示（例如旧数据没有记录精度、精确时刻恰好落在北京零点）。
//
//   node --env-file-if-exists=.env scripts/audit-time.ts
import { closeDb, sql } from "@aihot/backend/db";
import { beijingDate, beijingTime } from "@aihot/contracts/time";

type Severity = "error" | "warning";
interface Finding {
  severity: Severity;
  kind: string;
  id: string;
  detail: string;
}

interface ArticleRow {
  id: string;
  source_id: string;
  title: string;
  published_at: Date | null;
  published_at_claim: Date | null;
  publication_time: string | null;
  discovered_at: Date;
  timeline_at: Date;
  backfill: boolean;
  trusted: boolean;
}

interface PublicationRow {
  article_id: string;
  published_at: Date | null;
  discovered_at: Date;
  timeline_at: Date;
}

const FUTURE_TOLERANCE_MS = 3600_000;
const now = Date.now();
const findings: Finding[] = [];
const flag = (severity: Severity, kind: string, id: string, detail: string) => findings.push({ severity, kind, id, detail });
const sameInstant = (a: Date | null, b: Date | null): boolean => !!a && !!b && a.getTime() === b.getTime();
const iso = (at: Date | null) => (at ? at.toISOString() : "null");

const articles = await sql<ArticleRow[]>`
  SELECT a.id, a.source_id, a.title, a.published_at, a.published_at_claim, a.publication_time,
         a.discovered_at, a.timeline_at, a.backfill,
         (coalesce(s.config->>'publishedAtAuthoritative', 'true') <> 'false') AS trusted
  FROM articles a JOIN sources s ON s.id = a.source_id
  ORDER BY a.discovered_at DESC`;

for (const row of articles) {
  const where = `published=${iso(row.published_at)} discovered=${iso(row.discovered_at)} timeline=${iso(row.timeline_at)}`;
  if (row.published_at && row.published_at.getTime() > row.discovered_at.getTime() + FUTURE_TOLERANCE_MS) {
    flag("error", "published-after-discovery", row.id, where);
  }
  if (row.published_at && row.published_at_claim && row.published_at_claim.getTime() > row.discovered_at.getTime() + FUTURE_TOLERANCE_MS) {
    flag("error", "future-claim-kept", row.id, where);
  }
  const expected = row.published_at && (row.trusted || row.backfill) ? row.published_at : row.discovered_at;
  if (row.timeline_at.getTime() !== expected.getTime()) {
    flag("error", "timeline-rule", row.id, `${where} expected-timeline=${iso(expected)} trusted=${row.trusted} backfill=${row.backfill}`);
  }
  if (row.published_at && !row.trusted && !row.backfill && sameInstant(row.published_at, row.timeline_at)) {
    flag("error", "untrusted-sorts-by-claim", row.id, where);
  }
  if (sameInstant(row.published_at, row.discovered_at)) {
    flag("error", "copied-clock", row.id, `${where} (published_at 与 discovered_at 是同一瞬间，多半是把一个合成时间写进了两个字段)`);
  }
  if (row.timeline_at.getTime() > now + FUTURE_TOLERANCE_MS) {
    flag("error", "future-timeline", row.id, where);
  }
  if (row.discovered_at.getTime() > now + FUTURE_TOLERANCE_MS) {
    flag("error", "future-discovery", row.id, where);
  }
  if (row.published_at) {
    const precision = row.publication_time;
    if (!precision) {
      flag("warning", "precision-missing", row.id, `${where} (旧数据没有记录原文时间精度)`);
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(precision)) {
      if (beijingDate(row.published_at) !== precision) {
        flag("error", "date-precision-anchor", row.id, `${where} precision=${precision} (日期精度与 published_at 的北京日期不一致)`);
      }
    } else if (Date.parse(precision) !== row.published_at.getTime()) {
      flag("error", "precision-mismatch", row.id, `${where} precision=${precision} (精确精度与 published_at 不相等)`);
    } else if (beijingTime(row.published_at) === "00:00") {
      flag("warning", "midnight-precision", row.id, `${where} (精确时刻恰好是北京零点：确认它不是把「只有日期」写成了时刻)`);
    }
  }
}

const publications = await sql<PublicationRow[]>`
  SELECT p.article_id, p.published_at, p.discovered_at, p.timeline_at
  FROM publications p WHERE p.visibility = 'public' ORDER BY p.discovered_at DESC`;

for (const row of publications) {
  const where = `published=${iso(row.published_at)} discovered=${iso(row.discovered_at)} timeline=${iso(row.timeline_at)}`;
  if (sameInstant(row.published_at, row.discovered_at) && sameInstant(row.timeline_at, row.discovered_at)) {
    flag("error", "publication-copied-clock", row.article_id, where);
  }
  if (row.timeline_at.getTime() > now + FUTURE_TOLERANCE_MS) {
    flag("error", "publication-future-timeline", row.article_id, where);
  }
}

const shown = { error: 0, warning: 0 };
const perKind = new Map<string, number>();
for (const finding of findings) {
  shown[finding.severity] += 1;
  perKind.set(`${finding.severity}:${finding.kind}`, (perKind.get(`${finding.severity}:${finding.kind}`) ?? 0) + 1);
}
if (findings.length) {
  console.log("时间一致性审计：");
  for (const [key, count] of [...perKind].sort()) console.log(`  ${key}: ${count}`);
  console.log("");
  // 每类先给例子，避免一个坏源刷屏；完整列表用 --all。
  const all = process.argv.includes("--all");
  const budget = new Map<string, number>();
  for (const finding of findings) {
    const used = budget.get(finding.kind) ?? 0;
    if (!all && used >= 5) continue;
    budget.set(finding.kind, used + 1);
    console.log(`  [${finding.severity}] ${finding.kind} ${finding.id}: ${finding.detail}`);
  }
}
console.log(
  `audit-time: ${articles.length} articles, ${publications.length} public publications; ` +
    `${shown.error} errors, ${shown.warning} warnings`,
);
await closeDb();
if (shown.error > 0) process.exitCode = 1;
