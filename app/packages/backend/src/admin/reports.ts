// 出刊台: read one issue, edit it in a draft (今日判断 / 选稿 / 排序 / 所以呢 / 排序依据), publish the draft
// into reports keeping the replaced content in report_revisions, roll the issue back to any kept revision,
// regenerate it by rule, and show what its window cost. Every write is audited; a draft never reaches
// readers until it is published, and publishing is the only way an edit becomes the public issue.
import { z } from "zod";
import type {
  AdminReportCost, AdminReportCostLine, AdminReportEditor, AdminReportEntry, AdminReportPrice, AdminReports, BeforeJson,
} from "@aihot/contracts/admin";
import type { ReportKind } from "@aihot/contracts/site";
import { audit, auditHistory, Conflict } from "../audit.ts";
import { sql, type Tx } from "../db.ts";
import { emit } from "../modules.ts";
import { estimateCost, type UnitPrice } from "../providers/receipts.ts";
import { composeDaily, composeMonthly, composeWeekly } from "../reports/compose.ts";
import { sectionOf } from "../reports/edition.ts";

const KINDS: readonly ReportKind[] = ["daily", "weekly", "monthly"];
/** An edit saved against a newer issue is refused: the page edited a view that has moved on. */
const STALE = "这一期已被重新生成或发刊，请刷新后再编辑";
const REQUEST_ID = z.string().regex(/^[\w-]{8,80}$/, "缺少可重试的请求编号");

type Content = Record<string, any>;

interface ReportRow {
  id: number;
  content: Content;
  revision: number;
  origin: string;
  model: string | null;
  window_start: Date;
  window_end: Date;
  generated_at: Date;
}

interface DraftRow { content: Content; base_revision: number; updated_by: string; updated_at: Date }

/** One printed entry as stored in the issue's jsonb content, with the section or theme it prints under. */
interface EntryView { raw: Content; section: string }

function reportKind(input: string): ReportKind {
  if (!(KINDS as readonly string[]).includes(input)) throw Object.assign(new Error("报告类型必须是 daily、weekly 或 monthly"), { statusCode: 400 });
  return input as ReportKind;
}

const subjectOf = (kind: ReportKind, key: string) => `report:${kind}:${key}`;

/** The entries an issue prints: a daily's sections, a period's themes. Flashes stay as the composer left them. */
function entriesOf(content: Content, kind: ReportKind): EntryView[] {
  if (kind === "daily") {
    return (content.sections ?? []).flatMap((section: Content) =>
      (section.items ?? []).map((raw: Content) => ({ raw, section: String(section.label ?? "") })));
  }
  return (content.themes ?? []).flatMap((theme: Content) =>
    (theme.storyRefs ?? []).map((raw: Content) => ({ raw, section: String(theme.heading ?? "") })));
}

const text = (value: unknown) => (typeof value === "string" ? value : "");

function entryView(raw: Content, section: string): AdminReportEntry {
  const reason = text(raw.reason).trim();
  return {
    itemId: raw.itemId ? String(raw.itemId) : null,
    title: text(raw.title),
    summary: typeof raw.summary === "string" ? raw.summary : null,
    reason: reason || null,
    sourceName: text(raw.sourceName) || text(raw.source?.name),
    sourceId: raw.sourceId === undefined || raw.sourceId === null ? null : String(raw.sourceId),
    firstParty: !!raw.firstParty,
    publishedAt: typeof raw.publishedAt === "string" ? raw.publishedAt : null,
    section,
  };
}

/** 今日判断 as the public read layer accepts it: a non-empty title, an optional non-empty body. */
function verdictOf(content: Content): AdminReportEditor["verdict"] {
  const raw = content.verdict;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const title = text(raw.title).trim();
  if (!title) return null;
  const body = text(raw.body).trim();
  return body ? { title, body } : { title };
}

function orderOf(views: EntryView[]): string[] {
  return views.map((v) => v.raw.itemId).filter((id): id is string => typeof id === "string" && id.length > 0);
}

/**
 * The printed order: the editors' saved order when the issue carries one, the sections' order otherwise.
 * Ids the issue no longer prints are dropped, so an old saved order cannot resurrect a removed entry.
 */
function printedOrder(content: Content, views: EntryView[]): string[] {
  const present = orderOf(views);
  const saved = Array.isArray(content.printOrder) ? content.printOrder.filter((id: unknown): id is string => typeof id === "string" && present.includes(id)) : [];
  return [...saved, ...present.filter((id) => !saved.includes(id))];
}

/** What a manual write records: the editors' decisions, not the whole citation payload. */
function editSummary(content: Content, kind: ReportKind) {
  const views = entriesOf(content, kind);
  return {
    verdict: verdictOf(content),
    leadItemId: content.leadItemId ?? null,
    order: printedOrder(content, views),
    rankingBasis: typeof content.rankingBasis === "string" ? content.rankingBasis : null,
  };
}

const num = (value: string | null) => (value === null || value === "" ? null : Number(value));

// ---------------------------------------------------------------------------------------------------
// Unit prices and cost
// ---------------------------------------------------------------------------------------------------

interface PriceRow {
  service: string;
  model: string;
  currency: string;
  input_per_mtok: string | null;
  cached_per_mtok: string | null;
  output_per_mtok: string | null;
  price_meta: { effectiveOn?: string; sourceUrl?: string; checkedAt?: string } | null;
  updated_at: Date;
}

const priceRows = () => sql<PriceRow[]>`
  SELECT service, model, currency, input_per_mtok, cached_per_mtok, output_per_mtok, price_meta, updated_at
  FROM service_prices ORDER BY service, model`;

function unitPrice(row: PriceRow): UnitPrice {
  return { currency: row.currency, input: num(row.input_per_mtok), cached: num(row.cached_per_mtok), output: num(row.output_per_mtok) };
}

/** Exact model first, a service's blank model as its default, as the admin's model page reads prices. */
function priceLookup(rows: PriceRow[]): (service: string, model: string | null) => UnitPrice | null {
  const byKey = new Map<string, PriceRow>();
  for (const row of rows) byKey.set(`${row.service}\u0000${row.model}`, row);
  return (service, model) => {
    const row = byKey.get(`${service}\u0000${model ?? ""}`) ?? byKey.get(`${service}\u0000`);
    return row ? unitPrice(row) : null;
  };
}

interface AttemptCostRow {
  id: number;
  purpose: string;
  service: string;
  model: string | null;
  usage: Record<string, unknown> | null;
  cost: string | null;
  currency: string | null;
  cost_basis: string | null;
}

function costLines(rows: AttemptCostRow[], lookup: ReturnType<typeof priceLookup>): AdminReportCost {
  const lines = new Map<string, AdminReportCostLine & { mixed: boolean }>();
  const totals = { actual: 0, estimated: 0, calls: 0, tokens_in: 0, tokens_out: 0 };
  const currencies = new Set<string>();
  let priced = true;
  for (const row of rows) {
    const tokens = row.usage ? Number((row.usage as any).prompt_tokens ?? 0) : 0;
    const completion = row.usage ? Number((row.usage as any).completion_tokens ?? 0) : 0;
    const own = row.cost === null ? null : Number(row.cost);
    const price = own === null ? lookup(row.service, row.model) : null;
    const estimate = own === null && price ? estimateCost(price, row.usage) : null;
    // Tokens with no price (and no bill) are what make an issue's money too low; a call that reported
    // no usage has nothing to price and is not a missing price.
    if (own === null && row.usage !== null && !estimate) priced = false;
    const amount = own ?? estimate?.amount ?? 0;
    const currency = own === null ? estimate?.currency ?? null : row.currency;
    if (currency) currencies.add(currency);
    const basis = own === null ? "estimated" : row.cost_basis === "actual" ? "actual" : "estimated";
    if (basis === "actual") totals.actual += amount; else totals.estimated += amount;
    totals.calls += 1;
    totals.tokens_in += Number.isFinite(tokens) ? tokens : 0;
    totals.tokens_out += Number.isFinite(completion) ? completion : 0;
    const line = lines.get(row.purpose) ?? { purpose: row.purpose, calls: 0, tokens_in: 0, tokens_out: 0, amount: 0, currency: null, mixed: false };
    line.calls += 1;
    line.tokens_in += Number.isFinite(tokens) ? tokens : 0;
    line.tokens_out += Number.isFinite(completion) ? completion : 0;
    line.amount += amount;
    if (line.currency === null) line.currency = currency;
    else if (currency !== null && line.currency !== currency) line.mixed = true;
    lines.set(row.purpose, line);
  }
  return {
    currency: currencies.size === 1 ? [...currencies][0]! : null,
    actual: Math.round(totals.actual * 1e6) / 1e6,
    estimated: Math.round(totals.estimated * 1e6) / 1e6,
    total: Math.round((totals.actual + totals.estimated) * 1e6) / 1e6,
    calls: totals.calls,
    tokens_in: totals.tokens_in,
    tokens_out: totals.tokens_out,
    priced,
    lines: [...lines.values()]
      .map(({ mixed, ...line }) => ({ ...line, amount: Math.round(line.amount * 1e6) / 1e6, currency: mixed ? null : line.currency }))
      .sort((a, b) => b.amount - a.amount || a.purpose.localeCompare(b.purpose)),
  };
}

const ATTEMPT_COLUMNS = sql`a.id, r.purpose, a.service, a.model, a.usage, a.cost, a.currency, a.cost_basis`;

/**
 * What one issue cost: the paid calls whose attempts started inside its window, plus the report writer's
 * own call (its subject names the issue, its time can fall outside the window). Withdrawn and malformed
 * attempts are counted as calls but not as money.
 */
async function issueCost(kind: ReportKind, key: string, start: Date, end: Date, prices?: PriceRow[]): Promise<AdminReportCost> {
  const [priceList, inWindow, reportCall] = await Promise.all([
    prices ? Promise.resolve(prices) : priceRows(),
    sql<AttemptCostRow[]>`
      SELECT ${ATTEMPT_COLUMNS} FROM receipt_attempts a JOIN receipts r ON r.id = a.receipt_id
      WHERE a.origin = 'live' AND a.started_at >= ${start} AND a.started_at < ${end}`,
    sql<AttemptCostRow[]>`
      SELECT ${ATTEMPT_COLUMNS} FROM receipt_attempts a JOIN receipts r ON r.id = a.receipt_id
      WHERE a.origin = 'live' AND r.subject = ${`report:${kind}:${key}`}`,
  ]);
  const seen = new Set(inWindow.map((row) => row.id));
  const rows = [...inWindow, ...reportCall.filter((row) => !seen.has(row.id))];
  return costLines(rows, priceLookup(priceList));
}

/** The desk's own running cost: every paid call of the last `days` days. */
export async function recentCost(days = 7): Promise<BeforeJson<AdminReportCost>> {
  const since = new Date(Date.now() - days * 86400_000);
  const [prices, rows] = await Promise.all([
    priceRows(),
    sql<AttemptCostRow[]>`
      SELECT ${ATTEMPT_COLUMNS} FROM receipt_attempts a JOIN receipts r ON r.id = a.receipt_id
      WHERE a.origin = 'live' AND a.started_at >= ${since}`,
  ]);
  return costLines(rows, priceLookup(prices));
}

function reportPrice(row: PriceRow): BeforeJson<AdminReportPrice> {
  return {
    service: row.service,
    model: row.model,
    currency: row.currency,
    input_per_mtok: num(row.input_per_mtok),
    cached_per_mtok: num(row.cached_per_mtok),
    output_per_mtok: num(row.output_per_mtok),
    effective_on: row.price_meta?.effectiveOn ?? null,
    source_url: row.price_meta?.sourceUrl ?? null,
    checked_at: row.price_meta?.checkedAt ?? null,
    updated_at: row.updated_at,
  };
}

// ---------------------------------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------------------------------

/** Every kind's newest issues, the last week's cost and the unit prices the estimates rest on. */
export async function listReports(): Promise<BeforeJson<AdminReports>> {
  const [rows, recent, prices] = await Promise.all([
    sql<{ kind: ReportKind; key: string; revision: number; origin: string; generated_at: Date; title: string | null; entries: number; has_draft: boolean }[]>`
      SELECT r.kind, r.key, r.revision, r.origin, r.generated_at, r.content->>'title' AS title,
             CASE WHEN r.kind = 'daily'
               THEN (SELECT coalesce(sum(jsonb_array_length(coalesce(section->'items', '[]'::jsonb))), 0)::int
                       FROM jsonb_array_elements(coalesce(r.content->'sections', '[]'::jsonb)) section)
               ELSE (SELECT coalesce(sum(jsonb_array_length(coalesce(theme->'storyRefs', '[]'::jsonb))), 0)::int
                       FROM jsonb_array_elements(coalesce(r.content->'themes', '[]'::jsonb)) theme)
             END AS entries,
             (d.kind IS NOT NULL) AS has_draft
      FROM reports r LEFT JOIN report_drafts d ON d.kind = r.kind AND d.key = r.key
      ORDER BY r.kind, r.key DESC LIMIT 60`,
    recentCost(7),
    priceRows(),
  ]);
  const issues = rows.map((row) => ({
    kind: row.kind, key: row.key, title: row.title, entries: row.entries,
    generatedAt: row.generated_at, revision: row.revision, origin: row.origin, hasDraft: row.has_draft,
  }));
  return { issues, recent, prices: prices.map(reportPrice) };
}

/** Public selected reports of the issue's window the editors can still print. */
async function candidatesOf(report: ReportRow): Promise<AdminReportEntry[]> {
  const rows = await sql<{ id: string; title: string; summary: string | null; reason: string | null; source_id: string; source_name: string; first_party: boolean; at: Date | null; category: string | null }[]>`
    SELECT p.article_id AS id, p.title, p.summary, p.reason, p.source_id, s.name AS source_name, (s.tier = 'T1') AS first_party,
           coalesce(p.published_at, p.discovered_at) AS at, p.category
    FROM publications p JOIN sources s ON s.id = p.source_id
    WHERE p.visibility = 'public' AND p.selected AND NOT p.backfill
      AND p.timeline_at >= ${report.window_start} AND p.timeline_at < ${report.window_end}
    ORDER BY p.score DESC NULLS LAST, p.timeline_at DESC LIMIT 60`;
  return rows.map((row) => ({
    itemId: row.id, title: row.title, summary: row.summary, reason: row.reason?.trim() || null,
    sourceName: row.source_name, sourceId: row.source_id, firstParty: row.first_party,
    publishedAt: row.at?.toISOString() ?? null, section: sectionOf(row.category),
  }));
}

/** One issue, the working copy its editor sees (draft first), its candidates, revisions, cost and history. */
export async function reportEditor(kindInput: string, key: string): Promise<BeforeJson<AdminReportEditor> | null> {
  const kind = reportKind(kindInput);
  const [report] = await sql<ReportRow[]>`
    SELECT id, content, revision, origin, model, window_start, window_end, generated_at
    FROM reports WHERE kind = ${kind} AND key = ${key}`;
  if (!report) return null;
  const [draft, revisions, history, candidates, issueNumber, prices] = await Promise.all([
    sql<DraftRow[]>`SELECT content, base_revision, updated_by, updated_at FROM report_drafts WHERE kind = ${kind} AND key = ${key}`,
    sql<{ revision: number; generated_at: Date; reason: string | null; title: string | null }[]>`
      SELECT rr.revision, rr.generated_at, rr.reason, rr.content->>'title' AS title
      FROM report_revisions rr JOIN reports r ON r.id = rr.report_id
      WHERE r.kind = ${kind} AND r.key = ${key} ORDER BY rr.revision DESC LIMIT 30`,
    auditHistory(subjectOf(kind, key), 20),
    candidatesOf(report),
    sql<{ count: number }[]>`SELECT count(*)::int AS count FROM reports WHERE kind = ${kind} AND key <= ${key}`,
    priceRows(),
  ]);
  const cost = await issueCost(kind, key, report.window_start, report.window_end, prices);
  const working: Content = draft[0]?.content ?? report.content;
  const views = entriesOf(working, kind);
  const order = printedOrder(working, views);
  const byId = new Map(views.filter((view) => typeof view.raw.itemId === "string").map((view) => [view.raw.itemId as string, view]));
  const entries = [
    ...order.map((id) => byId.get(id)!).map((view) => entryView(view.raw, view.section)),
    ...views.filter((view) => typeof view.raw.itemId !== "string").map((view) => entryView(view.raw, view.section)),
  ];
  const leadItemId = typeof working.leadItemId === "string" ? working.leadItemId : entries.find((entry) => entry.itemId)?.itemId ?? null;
  return {
    kind,
    key,
    title: typeof working.title === "string" ? working.title : null,
    issueNumber: issueNumber[0]?.count ?? 0,
    generatedAt: report.generated_at,
    revision: report.revision,
    origin: report.origin,
    model: report.model,
    windowStart: report.window_start,
    windowEnd: report.window_end,
    hasDraft: draft.length > 0,
    draft: draft[0] ? { baseRevision: draft[0].base_revision, updatedAt: draft[0].updated_at, updatedBy: draft[0].updated_by } : null,
    verdict: verdictOf(working),
    leadItemId,
    order,
    rankingBasis: typeof working.rankingBasis === "string" ? working.rankingBasis : null,
    entries,
    candidates,
    revisions: revisions.map((row) => ({ revision: row.revision, generatedAt: row.generated_at, reason: row.reason, title: row.title })),
    cost,
    history,
  };
}

// ---------------------------------------------------------------------------------------------------
// Edits
// ---------------------------------------------------------------------------------------------------

const EditSchema = z.object({
  version: z.number().int().positive(),
  verdict: z.object({ title: z.string().trim().min(1).max(200), body: z.string().trim().max(1200).optional() }).nullable(),
  leadItemId: z.string().trim().max(200).nullable(),
  order: z.array(z.string().trim().min(1).max(200)).max(50),
  reasons: z.array(z.object({ itemId: z.string().trim().min(1).max(200), reason: z.string().trim().max(600) })).max(100),
  rankingBasis: z.string().trim().max(300).nullable(),
  add: z.array(z.string().trim().min(1).max(200)).max(20),
}).strict();

const PublishSchema = z.object({ version: z.number().int().positive(), reason: z.string().trim().max(300).optional() }).strict();
const DiscardSchema = z.object({ version: z.number().int().positive(), reason: z.string().trim().max(300).optional() }).strict();
const ReasonSchema = z.object({ reason: z.string().trim().min(1).max(300) }).strict();
const RollbackSchema = z.object({ revision: z.number().int().positive(), reason: z.string().trim().min(1).max(300) }).strict();

interface AddedRow { id: string; title: string; summary: string | null; url: string; source_id: string; source_name: string; first_party: boolean; at: Date | null; category: string | null }

/** The printed entry for a publication the editors add: the citation fields the public read layer reads. */
function addedEntry(row: AddedRow, kind: ReportKind): EntryView {
  return {
    section: sectionOf(row.category),
    raw: {
      itemId: row.id,
      title: row.title,
      summary: row.summary ?? "",
      sourceId: row.source_id,
      sourceName: row.source_name,
      sourceUrl: row.url,
      firstParty: row.first_party,
      publishedAt: row.at?.toISOString() ?? null,
      ...(kind === "daily" ? { sources: 1 } : {}),
    },
  };
}

/** Entries to add: public, selected and inside the issue's window, so an issue cannot print old news. */
async function addedEntries(tx: Tx, report: ReportRow, kind: ReportKind, ids: string[]): Promise<EntryView[]> {
  const wanted = [...new Set(ids)];
  if (!wanted.length) return [];
  const rows = await tx<AddedRow[]>`
    SELECT p.article_id AS id, p.title, p.summary, p.url, p.source_id, s.name AS source_name,
           (s.tier = 'T1') AS first_party, coalesce(p.published_at, p.discovered_at) AS at, p.category
    FROM publications p JOIN sources s ON s.id = p.source_id
    WHERE p.article_id = ANY(${wanted}::text[]) AND p.visibility = 'public' AND p.selected
      AND p.timeline_at >= ${report.window_start} AND p.timeline_at < ${report.window_end}`;
  if (rows.length !== wanted.length) throw Object.assign(new Error("只能加入本期窗口内、已公开且精选的稿件"), { statusCode: 400 });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return wanted.map((id) => addedEntry(byId.get(id)!, kind));
}

/**
 * The complete content a draft save produces, from the published issue (or its earlier draft): the printed
 * order decides what stays (选稿) and how it is printed (排序); the first entry leads and the next three are
 * the highlights. Reasons are frozen into the citations; sections and themes follow their category.
 */
async function editedContent(tx: Tx, kind: ReportKind, report: ReportRow, base: Content, edit: z.infer<typeof EditSchema>): Promise<Content> {
  const views = entriesOf(base, kind);
  const existing = new Map<string, EntryView>();
  for (const view of views) if (typeof view.raw.itemId === "string") existing.set(view.raw.itemId, view);
  const added = (await addedEntries(tx, report, kind, edit.add.filter((id) => !existing.has(id))));
  const addedById = new Map(added.map((view) => [view.raw.itemId as string, view]));
  const order = [...new Set(edit.order)];
  for (const id of order) {
    if (!existing.has(id) && !addedById.has(id)) throw Object.assign(new Error("排序里有本期没有的条目"), { statusCode: 400 });
  }
  const rawOf = (id: string) => (existing.get(id) ?? addedById.get(id))!.raw;
  // Entries without an item id cannot be addressed by the editor; they stay, after the ordered ones.
  const unpinned = views.filter((view) => typeof view.raw.itemId !== "string");
  const leadId = edit.leadItemId && order.includes(edit.leadItemId) ? edit.leadItemId : order[0] ?? null;
  const printed = leadId ? [leadId, ...order.filter((id) => id !== leadId)] : order;
  const reasons = new Map(edit.reasons.map((row) => [row.itemId, row.reason]));
  const content: Content = structuredClone(base);
  for (const [id, reason] of reasons) {
    if (!printed.includes(id)) continue;
    const raw = rawOf(id);
    if (reason.trim()) raw.reason = reason; else delete raw.reason;
  }
  // A daily prints its pack's sections in their fixed order. A period's themes follow the ranking order:
  // the weekly's printed order is the site's 榜单, read from the issue theme by theme. A section left
  // empty disappears; a newly used one is appended in its place.
  const groups = new Map<string, Content[]>();
  if (kind === "daily") {
    for (const section of base.sections ?? []) groups.set(String(section.label ?? ""), []);
  }
  for (const id of printed) {
    const view = existing.get(id) ?? addedById.get(id)!;
    if (!groups.has(view.section)) groups.set(view.section, []);
    groups.get(view.section)!.push(rawOf(id));
  }
  for (const view of unpinned) {
    if (!groups.has(view.section)) groups.set(view.section, []);
    groups.get(view.section)!.push(view.raw);
  }
  const ordered = [...groups].filter(([, items]) => items.length > 0);
  if (kind === "daily") {
    // The lead is named once more in the issue's own words; the next three printed entries are highlights.
    content.sections = ordered.map(([label, items]) => ({ label, items }));
    const lead = leadId ? rawOf(leadId) : null;
    content.leadItemId = leadId;
    if (lead) content.lead = { title: text(lead.title), leadParagraph: text(lead.summary) };
    else delete content.lead;
  } else {
    const previous = new Map<string, Content>();
    for (const theme of content.themes ?? []) previous.set(String(theme.heading ?? ""), theme);
    content.themes = ordered.map(([heading, storyRefs]) => {
      const old = previous.get(heading);
      const oldIds = (old?.storyRefs ?? []).map((raw: Content) => raw.itemId);
      const newIds = storyRefs.map((raw) => raw.itemId);
      // An introduction written for the old membership cannot keep describing the new one.
      const summary = old && oldIds.length === newIds.length && oldIds.every((id: string, i: number) => id === newIds[i]) ? old.summary ?? null : null;
      return { heading, summary, storyRefs };
    });
    content.storyOrder = printed;
    content.leadItemId = leadId;
    const lead = leadId ? rawOf(leadId) : null;
    if (lead) content.headline = text(lead.title); else delete content.headline;
  }
  content.printOrder = printed;
  content.highlights = printed.slice(1, 4);
  content.verdict = edit.verdict ?? undefined;
  if (content.verdict === undefined) delete content.verdict;
  if (edit.rankingBasis) content.rankingBasis = edit.rankingBasis; else delete content.rankingBasis;
  // Masthead figures follow what the issue now prints.
  const cited = [...printed.map(rawOf), ...unpinned.map((view) => view.raw)];
  const sources = new Set(cited.flatMap((raw) => [raw.sourceId, ...((raw.related ?? []) as Content[]).map((related) => related.sourceId)]).filter(Boolean));
  if (content.metrics && typeof content.metrics === "object") {
    if (kind === "daily") {
      content.metrics.totalEvents = printed.length;
      content.metrics.sourcesCount = sources.size;
      content.metrics.firstPartyEvents = cited.filter((raw) => raw.firstParty).length;
    } else {
      content.metrics.totalStories = printed.length;
      content.metrics.sourcesCount = sources.size;
    }
  }
  return content;
}

/** Saves the editors' working copy. The published issue and its revision number do not change. */
export async function saveReportDraft(kindInput: string, key: string, input: unknown, actor: string): Promise<BeforeJson<AdminReportEditor> | null> {
  const kind = reportKind(kindInput);
  const edit = EditSchema.parse(input);
  const saved = await sql.begin(async (tx) => {
    const [report] = await tx<ReportRow[]>`
      SELECT id, content, revision, origin, model, window_start, window_end, generated_at
      FROM reports WHERE kind = ${kind} AND key = ${key} FOR UPDATE`;
    if (!report) return false;
    const [draft] = await tx<DraftRow[]>`SELECT content, base_revision, updated_by, updated_at FROM report_drafts WHERE kind = ${kind} AND key = ${key} FOR UPDATE`;
    if (report.revision !== edit.version) throw new Conflict(STALE);
    if (draft && draft.base_revision !== report.revision) throw new Conflict(STALE);
    const base = draft?.content ?? report.content;
    const content = await editedContent(tx, kind, report, base, edit);
    await tx`
      INSERT INTO report_drafts (kind, key, content, base_revision, updated_by, updated_at)
      VALUES (${kind}, ${key}, ${tx.json(content as never)}, ${report.revision}, ${actor}, now())
      ON CONFLICT (kind, key) DO UPDATE SET content = EXCLUDED.content, base_revision = EXCLUDED.base_revision,
        updated_by = EXCLUDED.updated_by, updated_at = now()`;
    await audit(actor, "report.draft", subjectOf(kind, key), null, editSummary(base, kind), editSummary(content, kind), { db: tx });
    return true;
  });
  return saved ? reportEditor(kind, key) : null;
}

/** Publishes the draft: the current content becomes a kept revision, the draft becomes the issue. */
export async function publishReportDraft(kindInput: string, key: string, input: unknown, actor: string, requestId?: string): Promise<BeforeJson<AdminReportEditor> | null> {
  const kind = reportKind(kindInput);
  const parsed = PublishSchema.parse(input);
  const subject = subjectOf(kind, key);
  const id = requestId ? REQUEST_ID.parse(requestId) : undefined;
  if (id && (await replay(id, "report.publish", subject, actor))) return reportEditor(kind, key);
  const published = await sql.begin(async (tx) => {
    const [report] = await tx<ReportRow[]>`
      SELECT id, content, revision, origin, model, window_start, window_end, generated_at
      FROM reports WHERE kind = ${kind} AND key = ${key} FOR UPDATE`;
    if (!report) return false;
    const [draft] = await tx<DraftRow[]>`SELECT content, base_revision, updated_by, updated_at FROM report_drafts WHERE kind = ${kind} AND key = ${key} FOR UPDATE`;
    if (!draft) throw new Conflict("没有待发刊的草稿");
    if (report.revision !== parsed.version) throw new Conflict(STALE);
    if (draft.base_revision !== report.revision) throw new Conflict("这一期已被重新生成，请丢弃草稿后重新编辑");
    await tx`INSERT INTO report_revisions (report_id, revision, content, generated_at, reason)
             VALUES (${report.id}, ${report.revision}, ${tx.json(report.content as never)}, ${report.generated_at}, ${parsed.reason ?? "出刊台发刊前保留的旧版"})
             ON CONFLICT DO NOTHING`;
    await tx`UPDATE reports SET content = ${tx.json(draft.content as never)}, revision = revision + 1, origin = 'manual',
               generated_at = now(), updated_at = now() WHERE id = ${report.id}`;
    await tx`DELETE FROM report_drafts WHERE kind = ${kind} AND key = ${key}`;
    await emit("reportsChanged", { reason: `${kind} ${key} published by the editors` }, tx);
    await audit(actor, "report.publish", subject, parsed.reason ?? null,
      { revision: report.revision, content: editSummary(report.content, kind) },
      { revision: report.revision + 1, content: editSummary(draft.content, kind) }, { requestId: id, db: tx });
    return true;
  });
  return published ? reportEditor(kind, key) : null;
}

/** Drops the working copy; the published issue is left exactly as it is. */
export async function discardReportDraft(kindInput: string, key: string, input: unknown, actor: string): Promise<BeforeJson<AdminReportEditor> | null> {
  const kind = reportKind(kindInput);
  const parsed = DiscardSchema.parse(input);
  const discarded = await sql.begin(async (tx) => {
    const [report] = await tx<ReportRow[]>`SELECT id, content, revision, origin, model, window_start, window_end, generated_at
      FROM reports WHERE kind = ${kind} AND key = ${key} FOR UPDATE`;
    if (!report) return false;
    if (report.revision !== parsed.version) throw new Conflict(STALE);
    const [draft] = await tx<DraftRow[]>`SELECT content, base_revision, updated_by, updated_at FROM report_drafts WHERE kind = ${kind} AND key = ${key} FOR UPDATE`;
    if (!draft) return true;
    await tx`DELETE FROM report_drafts WHERE kind = ${kind} AND key = ${key}`;
    await audit(actor, "report.draft.discard", subjectOf(kind, key), parsed.reason ?? null,
      editSummary(draft.content, kind), null, { db: tx });
    return true;
  });
  return discarded ? reportEditor(kind, key) : null;
}

/** Rebuilds the issue by rule; a daily needs no model, a period writer that cannot run leaves its plain text. */
export async function regenerateReport(kindInput: string, key: string, input: unknown, actor: string, requestId?: string): Promise<BeforeJson<AdminReportEditor> | null> {
  const kind = reportKind(kindInput);
  const { reason } = ReasonSchema.parse(input);
  const id = requestId ? REQUEST_ID.parse(requestId) : undefined;
  const subject = subjectOf(kind, key);
  const [report] = await sql<{ id: number }[]>`SELECT id FROM reports WHERE kind = ${kind} AND key = ${key}`;
  if (!report) return null;
  if (id && (await replay(id, "report.regenerate", subject, actor))) return reportEditor(kind, key);
  // 编排失败分两类：上游数据还没准备好（窗口里没有已判断的条目）是可行动的状态，
  // 给 409 + 中文说明；其余仍按 500 交给日志，不掩盖真正的故障。
  const compose = async () => {
    if (kind === "daily") await composeDaily(key, reason);
    else if (kind === "weekly") await composeWeekly(key, reason);
    else await composeMonthly(key, reason);
  };
  try {
    await compose();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/nothing judged in its window|no daily entries in the period/.test(message)) {
      throw new Conflict(
        kind === "daily"
          ? "这一期的窗口里还没有已判断的条目，重新生成没有素材；等条目处理完成后再试。"
          : "这一期的周期内还没有可编排的每日精选条目，重新生成没有素材；等条目处理完成后再试。",
      );
    }
    throw error;
  }
  await sql`DELETE FROM report_drafts WHERE kind = ${kind} AND key = ${key}`;
  await audit(actor, "report.regenerate", subject, reason, null, { key }, { requestId: id });
  return reportEditor(kind, key);
}

/** Restores a kept revision as the issue; the content it replaces becomes a revision of its own. */
export async function rollbackReport(kindInput: string, key: string, input: unknown, actor: string, requestId?: string): Promise<BeforeJson<AdminReportEditor> | null> {
  const kind = reportKind(kindInput);
  const parsed = RollbackSchema.parse(input);
  const id = requestId ? REQUEST_ID.parse(requestId) : undefined;
  const subject = subjectOf(kind, key);
  if (id && (await replay(id, "report.rollback", subject, actor))) return reportEditor(kind, key);
  const rolled = await sql.begin(async (tx) => {
    const [report] = await tx<ReportRow[]>`
      SELECT id, content, revision, origin, model, window_start, window_end, generated_at
      FROM reports WHERE kind = ${kind} AND key = ${key} FOR UPDATE`;
    if (!report) return false;
    const [target] = await tx<{ content: Content; generated_at: Date }[]>`
      SELECT content, generated_at FROM report_revisions WHERE report_id = ${report.id} AND revision = ${parsed.revision}`;
    if (!target) throw new Conflict("这个历史版本不存在");
    await tx`INSERT INTO report_revisions (report_id, revision, content, generated_at, reason)
             VALUES (${report.id}, ${report.revision}, ${tx.json(report.content as never)}, ${report.generated_at}, ${`回滚到第 ${parsed.revision} 版前保留的当前版`})
             ON CONFLICT DO NOTHING`;
    await tx`UPDATE reports SET content = ${tx.json(target.content as never)}, revision = revision + 1, origin = 'manual',
               generated_at = now(), updated_at = now() WHERE id = ${report.id}`;
    await tx`DELETE FROM report_drafts WHERE kind = ${kind} AND key = ${key}`;
    await emit("reportsChanged", { reason: `${kind} ${key} rolled back to revision ${parsed.revision}` }, tx);
    await audit(actor, "report.rollback", subject, parsed.reason,
      { revision: report.revision, content: editSummary(report.content, kind) },
      { revision: report.revision + 1, restored: parsed.revision, content: editSummary(target.content, kind) }, { requestId: id, db: tx });
    return true;
  });
  return rolled ? reportEditor(kind, key) : null;
}

/** Whether this exact request already ran and committed: retries return its result instead of writing again. */
async function replay(requestId: string, action: string, subject: string, actor: string): Promise<boolean> {
  const rows = await sql`SELECT 1 FROM audit_log
    WHERE subject = ${subject} AND action = ${action} AND actor = ${actor} AND request_id = ${requestId} LIMIT 1`;
  return rows.length > 0;
}
