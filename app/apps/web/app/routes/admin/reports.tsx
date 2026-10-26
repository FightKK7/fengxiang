import { SITE } from "@aihot/site";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import type { ReportKind } from "@aihot/contracts/site";
import type { Route } from "./+types/reports";
import type {
  AdminReportCost,
  AdminReportEditor,
  AdminReportEntry,
  AdminReportIssueSummary,
  AdminReportPrice,
  AdminReports,
} from "@aihot/contracts/admin";
import { adminGet } from "../../lib/admin.server";
import { useAdminAction } from "../../features/admin/action";
import { bj, money, num } from "../../features/admin/format";
import { weekdayShort } from "../../lib/format";
import {
  AdminPage,
  Badge,
  Button,
  Card,
  DataTable,
  Empty,
  Field,
  Input,
  ReasonDialog,
  Select,
  Stat,
  Stats,
  Textarea,
  Time,
} from "../../features/admin/ui";

const KIND_LABEL: Record<ReportKind, string> = { daily: "每日精选", weekly: "周报", monthly: "月报" };

/** 成本明细里的用途：流水线步骤的中文名；认不出的保留原始代号。 */
const PURPOSE_LABEL: Record<string, string> = {
  prefilter_article: "预筛",
  score_article: "评分",
  structure_article: "结构化",
  understand_article: "理解",
  summarize_article: "摘要",
  translate_body: "正文翻译",
  group_article: "归组",
  group_review: "归组复核",
  story_digest: "事件简报",
};

/** 审计记录里的动作：只翻译本期出刊台会写入的几类，其余保留原始代号。 */
const ACTION_LABEL: Record<string, string> = {
  "report.draft": "保存草稿",
  "report.draft.discard": "丢弃草稿",
  "report.publish": "发刊",
  "report.regenerate": "重新生成",
  "report.rollback": "回滚",
};

export async function loader({ request }: Route.LoaderArgs) {
  const sp = new URL(request.url).searchParams;
  const kind = sp.get("kind");
  const key = sp.get("key");
  const list = await adminGet<AdminReports>(request, "/api/admin/reports");
  if (!kind || !key) return { list, editor: null as AdminReportEditor | null };
  const editor = await adminGet<AdminReportEditor>(request, `/api/admin/reports/${encodeURIComponent(kind)}/${encodeURIComponent(key)}`);
  return { list, editor };
}

export const meta: Route.MetaFunction = () => [{ title: `出刊台 · ${SITE.name} 后台` }];

/** 一期窗口的模型成本：金额、调用数、token；三种口径合成一条数据带。 */
function CostCards({ cost, label }: { cost: AdminReportCost; label: string }) {
  const currency = cost.currency ?? "USD";
  return (
    <>
      <Stat
        label={label}
        value={cost.total ? money(cost.total, currency) : "—"}
        hint={
          cost.currency
            ? cost.actual
              ? `账单 ${money(cost.actual, currency)} · 估算 ${money(cost.estimated, currency)}`
              : "全部按单价估算，供应商未回传账单"
            : "没有已定价的调用"
        }
      />
      <Stat label="付费调用" value={num(cost.calls)} hint={cost.priced ? "所用模型都填了单价" : "有模型缺单价，金额偏小"} />
      <Stat label="token 入 / 出" value={`${num(cost.tokens_in)} / ${num(cost.tokens_out)}`} hint="输入 / 输出" />
    </>
  );
}

/** 估算口径说清楚：钱是按单价算的，不是供应商账单。 */
function costBasisNote(cost: AdminReportCost) {
  if (!cost.calls) return "这一期窗口内没有付费调用。";
  return cost.actual
    ? `其中 ${money(cost.actual, cost.currency ?? "USD")} 是供应商回执里的账单，其余按单价估算。`
    : "全部金额按单价表的单价估算，不是账单；供应商回传金额后以账单为准。";
}

function CostLines({ cost }: { cost: AdminReportCost }) {
  if (!cost.lines.length) return <Empty>没有付费调用。</Empty>;
  return (
    <DataTable
      rows={cost.lines}
      rowKey={(line) => line.purpose}
      dense
      columns={[
        {
          key: "purpose",
          label: "用途",
          render: (line) =>
            PURPOSE_LABEL[line.purpose] ? (
              <span>{PURPOSE_LABEL[line.purpose]}</span>
            ) : (
              <span className="adm-mono">{line.purpose}</span>
            ),
        },
        { key: "calls", label: "调用", align: "right", render: (line) => num(line.calls) },
        { key: "tokens", label: "token 入 / 出", align: "right", render: (line) => `${num(line.tokens_in)} / ${num(line.tokens_out)}` },
        { key: "amount", label: "金额", align: "right", render: (line) => (line.currency ? money(line.amount, line.currency) : "—") },
      ]}
    />
  );
}

/** 期限：每日精选看日期，周报看周次，月报看年月；格式认不出就原样显示。 */
function issueDate(issue: AdminReportIssueSummary) {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(issue.key);
  if (issue.kind === "daily" && day) return `${Number(day[2])} 月 ${Number(day[3])} 日`;
  const week = /^(\d{4})-W(\d{1,2})$/.exec(issue.key);
  if (week) return `第 ${Number(week[2])} 周`;
  const month = /^(\d{4})-(\d{2})$/.exec(issue.key);
  if (month) return `${month[1]} 年 ${Number(month[2])} 月`;
  return issue.key;
}

/** 已出刊的期：11px 期号 + 19px 日期，一期一行；选中的一期用 2px 左黑线标出。 */
function IssueList({ list, kind, issueKey }: { list: AdminReports; kind: string | null; issueKey: string | null }) {
  const groups = useMemo(() => {
    const out = new Map<ReportKind, AdminReportIssueSummary[]>();
    for (const issue of list.issues) out.set(issue.kind, [...(out.get(issue.kind) ?? []), issue]);
    return [...out];
  }, [list]);
  return (
    <Card title="已出刊" pad={false} scrollable>
      <div className="adm-scroll min-h-0 flex-1">
        {groups.length === 0 ? (
          <Empty>还没有出刊：等出刊任务跑完再回来编辑。</Empty>
        ) : (
          groups.map(([groupKind, issues]) => (
            <div key={groupKind} className="pt-3 first:pt-1">
              <div className="px-3 pb-1 text-[11px] text-[color:var(--ink-4)]">
                {KIND_LABEL[groupKind]} · {issues.length} 期
              </div>
              {issues.map((issue) => {
                const active = issue.kind === kind && issue.key === issueKey;
                const weekday = issue.kind === "daily" && /^\d{4}-\d{2}-\d{2}$/.test(issue.key) ? weekdayShort(issue.key) : null;
                return (
                  <Link
                    key={`${issue.kind}:${issue.key}`}
                    to={`?kind=${issue.kind}&key=${encodeURIComponent(issue.key)}`}
                    aria-current={active ? "true" : undefined}
                    className={`block border-l-2 py-2 pl-2.5 pr-3 ${
                      active ? "border-[color:var(--ink)]" : "border-[color:transparent] hover:border-[color:var(--line)]"
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="adm-mono">{issue.key}</span>
                      <span className="flex shrink-0 items-center gap-1">
                        {issue.hasDraft && <Badge tone="bad">草稿</Badge>}
                        {issue.revision > 1 && <span className="adm-num text-[11px] text-[color:var(--ink-4)]">v{issue.revision}</span>}
                        <span className="adm-num text-[11px] text-[color:var(--ink-4)]">{issue.entries} 条</span>
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-serif text-[19px] font-semibold leading-tight text-[color:var(--ink)]">{issueDate(issue)}</span>
                      {weekday && <span className="text-[11px] text-[color:var(--ink-4)]">{weekday}</span>}
                    </div>
                  </Link>
                );
              })}
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

/** 单价表：这一期的估算依据；显示每个服务/模型的输入、缓存、输出单价。 */
function PriceList({ prices }: { prices: AdminReportPrice[] }) {
  if (!prices.length) {
    return <Empty>还没有录入单价，这一期只能等供应商回执里的金额。</Empty>;
  }
  return (
    <div>
      {prices.map((price, index) => (
        <div key={`${price.service}:${price.model}`} className={`py-2 ${index > 0 ? "border-t border-[color:var(--line)]" : "pt-0"}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-[14px] text-[color:var(--ink)]">
              {price.service} / {price.model}
            </span>
            <span className="adm-num text-[11px] text-[color:var(--ink-4)]">
              {price.effective_on ? `自 ${price.effective_on} 起` : "未填生效日"}
            </span>
          </div>
          <div className="adm-num mt-0.5 text-[12.5px] text-[color:var(--ink-3)]">
            入 {money(price.input_per_mtok, price.currency)} · 缓存 {money(price.cached_per_mtok, price.currency)} · 出{" "}
            {money(price.output_per_mtok, price.currency)} / 百万 token
          </div>
          {price.source_url && (
            <a href={price.source_url} target="_blank" rel="noreferrer" className="adm-link-muted text-[11px]">
              价格页
            </a>
          )}
        </div>
      ))}
      <p className="mt-1 border-t border-[color:var(--line)] pt-2 text-[11px] text-[color:var(--ink-4)]">
        金额 = 输入（未命中缓存）/ 缓存命中 / 输出 × 单价，按 token 计。供应商回执自带金额时以账单为准，历史回执不改写。
      </p>
    </div>
  );
}

/** The editors' working copy: order, lead, reasons and the verdict are saved together as one draft. */
function ReportDesk({ editor, prices }: { editor: AdminReportEditor; prices: AdminReportPrice[] }) {
  const { run, pending } = useAdminAction();
  const [verdictTitle, setVerdictTitle] = useState(editor.verdict?.title ?? "");
  const [verdictBody, setVerdictBody] = useState(editor.verdict?.body ?? "");
  const [rows, setRows] = useState<AdminReportEntry[]>(() => editor.entries.filter((entry) => entry.itemId));
  const [reasons, setReasons] = useState<Record<string, string>>(() =>
    Object.fromEntries(editor.entries.filter((entry) => entry.itemId).map((entry) => [entry.itemId!, entry.reason ?? ""])));
  const [rankingBasis, setRankingBasis] = useState(editor.rankingBasis ?? "");
  const [added, setAdded] = useState<string[]>([]);
  const [pick, setPick] = useState("");
  const [dialog, setDialog] = useState<"" | "publish" | "regenerate" | "rollback" | "discard">("");
  const [rollbackTo, setRollbackTo] = useState<number | null>(null);
  // A reload after a command brings new content; drop a stale selection rather than sending it back.
  useEffect(() => setPick(""), [editor]);

  const path = `/api/admin/reports/${editor.kind}/${encodeURIComponent(editor.key)}`;
  const available = editor.candidates.filter((candidate) => candidate.itemId && !rows.some((row) => row.itemId === candidate.itemId));
  const originLabel = editor.origin === "manual" ? "手工编辑" : editor.origin === "imported" ? "导入" : "规则生成";

  const move = (index: number, delta: number) => {
    const next = [...rows];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    setRows(next);
  };

  const remove = (id: string) => {
    setRows((current) => current.filter((row) => row.itemId !== id));
    setAdded((current) => current.filter((item) => item !== id));
  };

  const add = () => {
    const candidate = available.find((entry) => entry.itemId === pick);
    if (!candidate) return;
    setRows((current) => [...current, candidate]);
    setReasons((current) => ({ ...current, [candidate.itemId!]: candidate.reason ?? "" }));
    setAdded((current) => [...current, candidate.itemId!]);
    setPick("");
  };

  const saveDraft = () =>
    run("POST", `${path}/draft`, {
      version: editor.revision,
      verdict: verdictTitle.trim() ? { title: verdictTitle.trim(), ...(verdictBody.trim() ? { body: verdictBody.trim() } : {}) } : null,
      leadItemId: rows[0]?.itemId ?? null,
      order: rows.map((row) => row.itemId!),
      reasons: rows.filter((row) => row.itemId).map((row) => ({ itemId: row.itemId!, reason: reasons[row.itemId!] ?? "" })),
      rankingBasis: rankingBasis.trim() || null,
      add: added.filter((id) => rows.some((row) => row.itemId === id)),
    }, { label: "report-draft", success: "草稿已保存；发刊前读者看不到" });

  return (
    <div className="space-y-6">
      <Card
        title={`${KIND_LABEL[editor.kind]} ${editor.key} · 第 ${String(editor.issueNumber).padStart(3, "0")} 期`}
        right={
          <span className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
            {editor.hasDraft ? <Badge tone="bad">有未发刊草稿</Badge> : <Badge tone="ok">已发刊</Badge>}
            <span className="adm-num">v{editor.revision}</span>
            <span>{originLabel}</span>
          </span>
        }
      >
        <Stats>
          <CostCards cost={editor.cost} label="本期窗口成本" />
        </Stats>
        <p className="mt-3 text-[12.5px] text-[color:var(--ink-4)]">
          窗口 {bj(editor.windowStart, true)} – {bj(editor.windowEnd, true)}；{costBasisNote(editor.cost)}
          {editor.model ? ` 成文模型 ${editor.model}。` : " 每日精选不调用模型。"}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button busy={pending === "report-draft"} onClick={saveDraft}>保存草稿</Button>
          <Button tone="primary" onClick={() => setDialog("publish")}>发刊</Button>
          <Button onClick={() => setDialog("regenerate")}>重新生成</Button>
          {editor.hasDraft && <Button tone="danger" onClick={() => setDialog("discard")}>丢弃草稿</Button>}
        </div>
        {editor.hasDraft && editor.draft && (
          <p className="mt-2 text-[11px] text-ink-4">
            草稿基于 v{editor.draft.baseRevision} · {bj(editor.draft.updatedAt)} · {editor.draft.updatedBy}
          </p>
        )}
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <Card title="今日判断">
            <div className="space-y-3">
              <Field label="判断标题">
                <Input value={verdictTitle} maxLength={200} onChange={(event) => setVerdictTitle(event.target.value)} placeholder="例：三家协同办公厂商在同一天改了计费方式" />
              </Field>
              <Field label="导语（可选）">
                <Textarea value={verdictBody} maxLength={1200} onChange={(event) => setVerdictBody(event.target.value)} placeholder="一句解释，写影响结构，不写价值排序" />
              </Field>
            </div>
          </Card>

          <Card title="选稿与排序" pad={false}>
            {rows.length === 0 ? (
              <Empty>这一期还没有条目，从下面候选里加入。</Empty>
            ) : (
              rows.map((row, index) => (
                <div key={row.itemId ?? index} className="border-t border-[color:var(--line)] px-3 py-3 first:border-t-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[color:var(--ink-4)]">
                        <span className="adm-num">{String(index + 1).padStart(2, "0")}</span>
                        <span>{row.section}</span>
                        <span>{row.sourceName}</span>
                        {index === 0 && <Badge tone="info">头条</Badge>}
                      </div>
                      <div className="mt-1 text-[16px] font-medium leading-snug text-[color:var(--ink)]">{row.title}</div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <Button size="sm" onClick={() => move(index, -1)} disabled={index === 0} aria-label="上移">
                        ↑
                      </Button>
                      <Button size="sm" onClick={() => move(index, 1)} disabled={index === rows.length - 1} aria-label="下移">
                        ↓
                      </Button>
                      <Button size="sm" tone="ghost" onClick={() => row.itemId && remove(row.itemId)}>
                        移出
                      </Button>
                    </div>
                  </div>
                  <div className="mt-2">
                    <Field label="所以呢">
                      <Textarea
                        className="min-h-[56px]! py-1.5!"
                        rows={2}
                        maxLength={600}
                        value={reasons[row.itemId ?? ""] ?? ""}
                        onChange={(event) => row.itemId && setReasons((current) => ({ ...current, [row.itemId!]: event.target.value }))}
                        placeholder="一句风向观察（可选），写原文没有的对照或影响结构；留空表示沿用条目自己的观察"
                      />
                    </Field>
                  </div>
                </div>
              ))
            )}
            <div className="border-t border-[color:var(--line)] p-3">
              <div className="mb-2 text-[11px] text-[color:var(--ink-4)]">从本期候选加入</div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-[220px] flex-1">
                  <Select value={pick} onChange={(event) => setPick(event.target.value)} aria-label="候选项">
                    <option value="">选择一条本期窗口内已精选、尚未排入的稿件</option>
                    {available.map((candidate) => (
                      <option key={candidate.itemId!} value={candidate.itemId!}>{`[${candidate.section}] ${candidate.title}`}</option>
                    ))}
                  </Select>
                </div>
                <Button onClick={add} disabled={!pick}>加入</Button>
              </div>
            </div>
          </Card>

          <Card title="排序依据">
            <Field
              label="为什么这样排"
              hint={editor.kind === "weekly"
                ? "首页「风向榜」直接取本期周报的打印顺序（头条 → 主题 → 主题内）。"
                : "例：影响面从大到小；同一厂商不连排；价格变化优先于功能更新；前四条进首页。"}
            >
              <Input value={rankingBasis} maxLength={300} onChange={(event) => setRankingBasis(event.target.value)} placeholder="写一句排序理由，发刊后仍可看到" />
            </Field>
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card title="本期成本明细" right={<span>估算</span>} pad={false}>
            <CostLines cost={editor.cost} />
          </Card>

          <Card title="单价（估算依据）">
            <PriceList prices={prices} />
          </Card>

          <Card title="版本历史" pad={false}>
            <DataTable
              rows={editor.revisions}
              rowKey={(revision) => revision.revision}
              dense
              empty="还没有历史版本。"
              columns={[
                { key: "v", label: "版", render: (revision) => <span className="adm-num">v{revision.revision}</span> },
                { key: "t", label: "时间", render: (revision) => <Time at={revision.generatedAt} /> },
                { key: "r", label: "原因", render: (revision) => revision.reason ?? "—" },
                {
                  key: "a",
                  label: "",
                  align: "right",
                  render: (revision) => (
                    <Button size="sm" onClick={() => { setRollbackTo(revision.revision); setDialog("rollback"); }}>回滚</Button>
                  ),
                },
              ]}
            />
          </Card>

          <Card title="操作记录" pad={false}>
            <DataTable
              rows={editor.history}
              rowKey={(entry) => `${entry.action}-${String(entry.created_at)}`}
              dense
              empty="还没有人工操作。"
              columns={[
                { key: "t", label: "时间", render: (entry) => <Time at={String(entry.created_at)} /> },
                {
                  key: "a",
                  label: "动作",
                  render: (entry) =>
                    ACTION_LABEL[entry.action] ? (
                      <span>{ACTION_LABEL[entry.action]}</span>
                    ) : (
                      <span className="adm-mono">{entry.action}</span>
                    ),
                },
                { key: "r", label: "原因", render: (entry) => entry.reason ?? "—" },
                { key: "who", label: "操作者", render: (entry) => <span className="text-[color:var(--ink-4)]">{entry.actor}</span> },
              ]}
            />
          </Card>
        </div>
      </div>

      <ReasonDialog
        open={dialog === "publish"}
        title={`发刊：${KIND_LABEL[editor.kind]} ${editor.key}`}
        description="发刊后读者立刻看到这一版；旧版会保留在版本历史里，可随时回滚。"
        confirmLabel="发刊"
        requireReason={false}
        busy={pending === "report-publish"}
        onClose={() => setDialog("")}
        onSubmit={async (reason) => (await run("POST", `${path}/publish`, { version: editor.revision, ...(reason.trim() ? { reason } : {}) }, { label: "report-publish", success: "已发刊" })) !== null}
      />
      <ReasonDialog
        open={dialog === "regenerate"}
        title={`重新生成：${KIND_LABEL[editor.kind]} ${editor.key}`}
        description="按规则重排这一期并写回（每日精选不调用模型；周/月报的成文模型在关闭时只出规则版）。当前版会先存进版本历史，未发刊的草稿会被丢弃。"
        confirmLabel="重新生成"
        busy={pending === "report-regenerate"}
        onClose={() => setDialog("")}
        onSubmit={async (reason) => (await run("POST", `${path}/regenerate`, { reason }, { label: "report-regenerate", success: "已重新生成" })) !== null}
      />
      <ReasonDialog
        open={dialog === "rollback"}
        title={`回滚到 v${rollbackTo ?? ""}`}
        description="把这一期恢复成选中的历史版本；当前版会先保留为新的历史版本，所以回滚本身也能再回滚。"
        confirmLabel="回滚"
        danger
        busy={pending === "report-rollback"}
        onClose={() => setDialog("")}
        onSubmit={async (reason) => {
          if (!rollbackTo) return false;
          return (await run("POST", `${path}/rollback`, { revision: rollbackTo, reason }, { label: "report-rollback", success: `已回滚到 v${rollbackTo}` })) !== null;
        }}
      />
      <ReasonDialog
        open={dialog === "discard"}
        title="丢弃草稿"
        description="未发刊的修改全部丢弃，读者看到的版本不变。"
        confirmLabel="丢弃"
        danger
        requireReason={false}
        busy={pending === "report-discard"}
        onClose={() => setDialog("")}
        onSubmit={async (reason) => (await run("POST", `${path}/draft/discard`, { version: editor.revision, ...(reason.trim() ? { reason } : {}) }, { label: "report-discard", success: "草稿已丢弃" })) !== null}
      />
    </div>
  );
}

export default function ReportsAdmin({ loaderData }: Route.ComponentProps) {
  const { list, editor } = loaderData;
  const [sp] = useSearchParams();
  const counts = useMemo(() => {
    const byKind: Partial<Record<ReportKind, number>> = {};
    for (const issue of list.issues) byKind[issue.kind] = (byKind[issue.kind] ?? 0) + 1;
    return byKind;
  }, [list]);
  return (
    <AdminPage title="出刊台">
      <Stats>
        <CostCards cost={list.recent} label="近 7 天模型成本" />
        <Stat label="已出刊" value={`${list.issues.length} 期`} hint={`每日精选 ${counts.daily ?? 0} · 周报 ${counts.weekly ?? 0} · 月报 ${counts.monthly ?? 0}`} />
      </Stats>
      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <IssueList list={list} kind={sp.get("kind")} issueKey={sp.get("key")} />
        <div className="min-w-0">
          {editor ? (
            <ReportDesk
              key={`${editor.kind}:${editor.key}:${editor.revision}:${editor.hasDraft ? editor.draft?.updatedAt : ""}`}
              editor={editor}
              prices={list.prices}
            />
          ) : (
            <Card title="选择一期">
              <Empty>
                {list.issues.length === 0
                  ? "第一期出刊后，这里可以编辑当期的今日判断、选稿和「所以呢」。"
                  : "在左侧选一期（每日精选 / 周报 / 月报），开始编辑。"}
              </Empty>
            </Card>
          )}
        </div>
      </div>
    </AdminPage>
  );
}
