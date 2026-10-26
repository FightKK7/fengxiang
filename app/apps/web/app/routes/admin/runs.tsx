import { useState } from "react";
import { SITE } from "@aihot/site";
import { Link, useFetcher } from "react-router";
import { useEffect } from "react";
import type { Route } from "./+types/runs";
import type { AdminDeliveryIssue, AdminReceiptIssue, AdminRuns } from "@aihot/contracts/admin";
import { adminGet } from "../../lib/admin.server";
import { useAdminAction } from "../../features/admin/action";
import { bj, duration, num } from "../../features/admin/format";
import { HEALTH_LABEL } from "../../features/admin/labels";
import { AdminPage, Badge, Button, Card, DataTable, Dot, Field, Json, ReasonDialog, Select, Stat, Stats, Time, healthTone } from "../../features/admin/ui";
import { loadParts } from "../../site-modules";


export async function loader({ request }: Route.LoaderArgs) {
  return adminGet<AdminRuns>(request, "/api/admin/runs");
}

export const meta: Route.MetaFunction = () => [{ title: `运行 · ${SITE.name} 后台` }];

const STATE_LABEL: Record<string, string> = { created: "排队", retry: "等待重试", active: "执行中" };
const JOB_LABEL: Record<string, string> = { ok: "正常", failed: "失败", running: "运行中" };
const RECEIPT_LABEL: Record<string, string> = { unknown: "结果未知", pending: "等待结果", received: "已收到", completed: "已完成", failed: "失败" };
const DELIVERY_LABEL: Record<string, string> = { unknown: "结果未知", failed: "失败", sending: "发送中", sent: "已送达" };
const INGEST_LABEL: Record<string, string> = { ok: "正常", error: "失败" };
const PROCESS_LABEL: Record<string, string> = { worker: "出刊进程" };

/** 定时任务与队列的中文名：后台不向操作者暴露 compose / sweep 这类内部代号；认不出的保留原名（悬停可见）。 */
const TASK_LABEL: Record<string, string> = {
  "content.sweep": "补处理积压条目",
  "content.translate": "生成译文",
  "hot.rank": "热度榜重算",
  "hot.snapshot": "热度落盘",
  "stories.links": "事件关联",
  "reports.compose": "出刊编排",
  "ops.retention": "过期数据清理",
  "seo.indexnow": "搜索引擎收录推送",
  "ops.recover": "失败任务恢复",
  "ops.alerts": "异常与缺期告警",
  "ops.digest": "运营摘要",
  "feedback.forward": "读者反馈转发",
  "ops.backup": "数据库备份",
  "reports.source-health": "信源健康周报",
  "sources.schedule": "到期信源检查",
  "sources.adapt-intervals": "采集间隔调整",
  "sources.x-renames": "X 账号改名跟进",
  "sources.icons": "信源图标刷新",
  "sources.mp-reconcile": "公众号核对",
  "crawlers.run": "专用抓取",
};
const QUEUE_LABEL: Record<string, string> = {
  "content.analyze": "条目分析",
  "content.extract-body": "正文抓取",
  "events.group": "事件归组",
  "events.digest": "事件简报",
  "sources.fetch": "信源抓取",
  "sources.fetch-x": "X 抓取",
  "sources.mp": "公众号抓取",
  "notify.selected": "精选推送",
  "publication.republish-source": "信源重发布",
  "media.prepare": "图片准备",
  "__pgboss__send-it": "任务投递",
};

const PARTS = await loadParts((m) => m.admin?.runs);

export default function RunsAdmin({ loaderData }: Route.ComponentProps) {
  const refresh = useFetcher<typeof loader>();
  const r = refresh.data ?? loaderData;
  const { run, pending } = useAdminAction();
  const [receipt, setReceipt] = useState<AdminReceiptIssue | null>(null);
  const [billed, setBilled] = useState("false");
  const [delivery, setDelivery] = useState<AdminDeliveryIssue | null>(null);
  const [outcome, setOutcome] = useState<"sent" | "drop" | "resend">("sent");
  // Failure group to put back into processing ("" = every failure of the last 30 days).
  const [requeue, setRequeue] = useState<string | null>(null);

  // Live view: refresh every 20 s while visible.
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && refresh.state === "idle" && refresh.load("/admin/runs"), 20_000);
    return () => clearInterval(t);
  }, [refresh]);

  const backlog = new Map<string, Record<string, { n: number; oldest: string }>>();
  for (const q of r.queues) backlog.set(q.name, { ...(backlog.get(q.name) ?? {}), [q.state]: { n: q.n, oldest: q.oldest } });
  const queued = r.queues.filter((q) => q.state !== "active").reduce((a, q) => a + q.n, 0);
  const worker = r.processes.find((p) => p.role === "worker");
  const failing = r.jobs.filter((j) => j.status === "failed");
  const unknownReceipts = r.receipts.issues.filter((x) => x.status === "unknown").length;
  const unknownDeliveries = r.deliveries.filter((d) => d.status === "unknown").length;

  return (
    <AdminPage
      title="运行"
      meta={<>每 20 秒刷新 · 最近检查 {bj(r.checkedAt)}</>}
    >
      <Stats>
        <Stat
          label="后台进程"
          value={
            <span className="inline-flex items-center gap-2">
              <Dot tone={worker?.alive ? "ok" : "bad"} />
              {worker ? (worker.alive ? "运行中" : "心跳中断") : "未上报"}
            </span>
          }
          hint={worker ? <>{worker.host} · 心跳 <Time at={worker.at} /></> : "没有进程上报心跳"}
        />
        <Stat label="队列积压" value={num(queued)} tone={queued > 500 ? "warn" : undefined} hint="排队与等待重试" />
        <Stat label="失败的定时任务" value={num(failing.length)} tone={failing.length ? "bad" : "ok"} hint="最近一次运行失败" />
        <Stat
          label="回执结果未知"
          value={num(unknownReceipts)}
          tone={unknownReceipts ? "bad" : "ok"}
          hint={`7 天 ${num(Object.values(r.receipts.counts).reduce((a, b) => a + b, 0))} 次付费请求`}
        />
        <Stat label="投递待核实" value={num(unknownDeliveries)} tone={unknownDeliveries ? "bad" : "ok"} hint="外部推送结果未知" />
      </Stats>

      {r.grouping.waiting > 0 && (
        <Card
          title="等待去重确认的精选"
          right={<span>{num(r.grouping.waiting)} 条等待 · {num(r.grouping.needsAttention)} 条超过 10 分钟</span>}
          pad={false}
          scrollable
        >
          <p className="pb-3 text-[12.5px] text-ink-4">这些新闻已达到精选条件，确认是否重复后才会进入精选。最多展示等待最久的 30 条。</p>
          <DataTable dense rows={r.grouping.items} rowKey={(item) => item.articleId} columns={[
            { key: "title", label: "新闻", render: (item) => <Link className="adm-link" to={`/admin/content/${item.articleId}`}>{item.title}</Link> },
            { key: "since", label: "开始等待", render: (item) => <Time at={item.since} /> },
            { key: "recovery", label: "下一步", render: (item) => <Badge tone={item.recovery === "manual" ? "bad" : "warn"}>{item.recovery === "manual" ? "需处理后恢复" : item.recovery === "receipt" ? "等待付费结果自动恢复" : "自动处理中"}</Badge> },
            { key: "error", label: "原因", render: (item) => <span className="line-clamp-2 text-[12.5px] text-ink-4">{item.receiptId ? `回执 #${item.receiptId} · ` : ""}{item.error ?? "等待身份确认"}</span> },
          ]} />
        </Card>
      )}

      <div className="grid gap-x-8 gap-y-7 lg:grid-cols-2">
        <Card title="队列" pad={false}>
          <DataTable
            dense
            rows={[...backlog.entries()]}
            rowKey={([name]) => name}
            empty="队列是空的"
            columns={[
              { key: "n", label: "队列", render: ([name]) => <span className="adm-nowrap" title={name}>{QUEUE_LABEL[name] ?? name}</span> },
              ...(["created", "retry", "active"] as const).map((st) => ({
                key: st,
                label: STATE_LABEL[st],
                align: "right" as const,
                render: ([, v]: [string, Record<string, { n: number; oldest: string }>]) => (v[st] ? <span title={`最早 ${bj(v[st]!.oldest, true)}`}>{num(v[st]!.n)}</span> : <span className="text-ink-4">0</span>),
              })),
              { key: "old", label: "最早排队", render: ([, v]) => <Time at={v.created?.oldest ?? v.retry?.oldest ?? null} /> },
            ]}
          />
        </Card>
        <Card title="定时任务" pad={false}>
          <DataTable
            dense
            rows={r.jobs}
            rowKey={(j) => j.job}
            columns={[
              { key: "j", label: "任务", render: (j) => <span className="adm-nowrap" title={j.job}>{TASK_LABEL[j.job] ?? j.job}</span> },
              { key: "s", label: "上次", render: (j) => <Badge tone={j.status === "ok" ? "ok" : j.status === "failed" ? "bad" : "muted"} title={j.error ?? undefined}>{JOB_LABEL[j.status] ?? j.status ?? "运行中"}</Badge> },
              { key: "at", label: "时间", render: (j) => <Time at={j.started_at} /> },
              { key: "d", label: "耗时", align: "right", render: (j) => duration(j.started_at, j.finished_at) },
              { key: "f", label: "24h 失败", align: "right", render: (j) => (j.failed_24h ? <span className="text-hot">{j.failed_24h}/{j.runs_24h}</span> : `0/${j.runs_24h}`) },
            ]}
          />
        </Card>
      </div>

      {r.failedJobs.length > 0 && (
        <Card title="24 小时内失败的队列任务" right={<span>{num(r.failedJobs.length)} 个队列</span>} pad={false} scrollable>
          <DataTable
            dense
            rows={r.failedJobs}
            rowKey={(j) => j.name}
            columns={[
              { key: "n", label: "队列", render: (j) => <span className="adm-nowrap" title={j.name}>{QUEUE_LABEL[j.name] ?? j.name}</span> },
              { key: "c", label: "失败", align: "right", render: (j) => num(j.failed) },
              { key: "l", label: "最近", render: (j) => <Time at={j.last} /> },
              { key: "o", label: "最近错误", render: (j) => <span className="line-clamp-2 text-[12.5px] text-ink-4" title={j.last_output ?? undefined}>{j.last_output}</span> },
            ]}
          />
        </Card>
      )}

      <div className="grid gap-x-8 gap-y-7 lg:grid-cols-2">
        <Card title="需要核对的付费回执" right={<span>{Object.entries(r.receipts.counts).map(([k, v]) => `${RECEIPT_LABEL[k] ?? k} ${v}`).join(" · ")}</span>} pad={false} scrollable>
          <DataTable
            dense
            rows={r.receipts.issues}
            rowKey={(x) => x.id}
            empty="没有待处理的回执"
            columns={[
              { key: "id", label: "回执", render: (x) => <span className="adm-num adm-nowrap">#{x.id}</span> },
              { key: "s", label: "状态", render: (x) => <Badge tone={x.status === "unknown" ? "bad" : "warn"}>{RECEIPT_LABEL[x.status] ?? x.status}</Badge> },
              { key: "w", label: "服务", render: (x) => <span className="adm-nowrap">{x.service}{x.model ? ` · ${x.model}` : ""}</span> },
              { key: "p", label: "用途", render: (x) => (x.subject && /^[\w-]{10,}$/.test(x.subject) && x.purpose.includes("analy") ? <Link className="adm-link" to={`/admin/content/${x.subject}`}>{x.purpose}</Link> : x.purpose) },
              { key: "e", label: "错误", render: (x) => <span className="line-clamp-2 text-[12.5px] text-ink-4" title={x.error ?? ""}>{x.error}</span> },
              { key: "a", label: "", render: (x) => (x.status === "unknown" ? <Button size="sm" onClick={() => setReceipt(x)}>核对</Button> : null) },
            ]}
          />
        </Card>
        <Card title="需要核实的投递" pad={false} scrollable>
          <DataTable
            dense
            rows={r.deliveries}
            rowKey={(d) => d.id}
            empty="没有待核实的投递"
            columns={[
              { key: "t", label: "目标", render: (d) => <span className="adm-mono adm-nowrap" title={d.target_key}>{d.target_key}</span> },
              { key: "s", label: "状态", render: (d) => <Badge tone={d.status === "unknown" ? "bad" : "warn"}>{DELIVERY_LABEL[d.status] ?? d.status}</Badge> },
              { key: "sub", label: "内容", render: (d) => (d.subject_kind === "selected" ? <Link className="adm-link" to={`/admin/content/${d.subject_id}`}>{d.subject_id}</Link> : `${d.subject_kind} ${d.subject_id}`) },
              { key: "at", label: "时间", render: (d) => <Time at={d.updated_at} /> },
              { key: "a", label: "", render: (d) => <Button size="sm" onClick={() => setDelivery(d)}>处理</Button> },
            ]}
          />
        </Card>
      </div>

      <div className="grid gap-x-8 gap-y-7 lg:grid-cols-2">
        <Card title="延迟或失败的信源" right={<Link className="adm-link" to="/admin/sources?health=failing">全部失败信源</Link>} pad={false} scrollable>
          <DataTable
            dense
            rows={r.lagging}
            rowKey={(s) => s.id}
            empty="信源都按时采集"
            columns={[
              { key: "n", label: "信源", render: (s) => <Link className="adm-link" to={`/admin/sources/${encodeURIComponent(s.id)}`}>{s.name}</Link> },
              { key: "h", label: "健康", render: (s) => <Badge tone={healthTone(s.health)}>{HEALTH_LABEL[s.health] ?? s.health}</Badge> },
              { key: "ok", label: "上次成功", render: (s) => <Time at={s.last_ok_at} /> },
              { key: "nx", label: "应抓", render: (s) => <Time at={s.next_fetch_at} /> },
              { key: "e", label: "错误", render: (s) => <span className="line-clamp-1 text-[12.5px] text-ink-4" title={s.last_error ?? ""}>{s.last_error}</span> },
            ]}
          />
        </Card>
        <Card
          title="处理失败（近 30 天，按错误归类）"
          right={
            <span className="flex items-center gap-3">
              {r.retrying.count > 0 && <span>等待重试 {num(r.retrying.count)} 条 · 下一次 <Time at={r.retrying.next} /></span>}
              {r.errors.length > 0 && <Button size="sm" onClick={() => setRequeue("")}>全部重新处理</Button>}
            </span>
          }
          pad={false} scrollable
        >
          <DataTable
            dense
            rows={r.errors}
            rowKey={(e) => e.error}
            empty="没有处理失败"
            columns={[
              { key: "e", label: "错误", render: (e) => <span className="adm-mono" title={e.error}>{e.error}</span> },
              { key: "n", label: "条数", align: "right", render: (e) => num(e.n) },
              { key: "x", label: "示例", render: (e) => <Link className="adm-link" to={`/admin/content/${e.example}`}>查看</Link> },
              { key: "l", label: "最近", render: (e) => <Time at={e.last} /> },
              { key: "a", label: "", align: "right", render: (e) => <Button size="sm" onClick={() => setRequeue(e.error)}>重新处理</Button> },
            ]}
          />
        </Card>
      </div>

      {PARTS.map(({ name, part: Part }) => (r.modules[name] != null ? <Part key={name} data={r.modules[name]} /> : null))}

      <div className="grid gap-x-8 gap-y-7 lg:grid-cols-2">
        <Card title="任务时间线" pad={false} scrollable>
          <DataTable
            dense
            rows={r.timeline}
            rowKey={(t) => t.id}
            columns={[
              { key: "at", label: "开始", render: (t) => <span className="adm-num adm-nowrap">{bj(t.started_at, true)}</span> },
              { key: "j", label: "任务", render: (t) => <span className="adm-nowrap" title={t.job}>{TASK_LABEL[t.job] ?? t.job}</span> },
              { key: "s", label: "结果", render: (t) => <Badge tone={t.status === "ok" ? "ok" : t.status === "failed" ? "bad" : "muted"} title={t.error ?? undefined}>{JOB_LABEL[t.status] ?? t.status ?? "运行中"}</Badge> },
              { key: "d", label: "耗时", align: "right", render: (t) => duration(t.started_at, t.finished_at) },
            ]}
          />
        </Card>
        <Card title="外部上报" pad={false} scrollable>
          <DataTable
            dense
            rows={r.ingest}
            rowKey={(e) => `${e.client}-${e.created_at}`}
            empty="还没有外部上报（采集脚本）"
            columns={[
              { key: "at", label: "时间", render: (e) => <Time at={e.created_at} /> },
              { key: "c", label: "客户端", render: (e) => <span className="adm-mono adm-nowrap" title={e.client}>{e.client}</span> },
              { key: "k", label: "类型", render: (e) => e.kind },
              { key: "s", label: "结果", render: (e) => <Badge tone={e.status === "ok" ? "ok" : e.status === "error" ? "bad" : "muted"} title={e.error ?? undefined}>{INGEST_LABEL[e.status] ?? e.status}</Badge> },
              { key: "x", label: "摘要", render: (e) => <Json value={e.summary} label="摘要" /> },
            ]}
          />
        </Card>
      </div>

      {r.processes.length > 0 && (
        <Card title="后台进程">
          <ul className="grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {r.processes.map((p) => (
              <li key={p.role} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Dot tone={p.alive ? "ok" : "bad"} />
                <span className="text-[14px] text-ink">{PROCESS_LABEL[p.role] ?? p.role}</span>
                <span className="adm-mono">{p.host} · pid {p.pid} · {p.release} · 启动于 {bj(p.startedAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ReasonDialog
        open={!!receipt}
        title={`核对回执 #${receipt?.id ?? ""}`}
        description="自动恢复后仍未知的请求需要人工放行。核对计费情况；暂时无法核对但已获准恢复时，选择计费未知并写明授权。放行后会再次调用，可能重复计费。"
        confirmLabel="记录并放行"
        busy={pending === "release"}
        onClose={() => setReceipt(null)}
        onSubmit={async (note) => (await run("POST", `/api/admin/receipts/${receipt!.id}/release`, { billed: billed === "unknown" ? null : billed === "true", note }, { label: "release", success: "已放行" })) !== null}
      >
        <Field label="供应商是否计费">
          <Select value={billed} onChange={(e) => setBilled(e.target.value)}>
            <option value="false">未计费（请求没有被接受）</option>
            <option value="true">已计费（结果没有取回）</option>
            <option value="unknown">计费未知（已获准恢复）</option>
          </Select>
        </Field>
      </ReasonDialog>
      <ReasonDialog
        open={requeue !== null}
        title={requeue ? "重新处理这一类失败" : "重新处理全部失败"}
        description="这些文章会重新进入处理队列（正文、判断、发布）。模型调用会重新计费；供应商拒绝的内容可能再次失败。"
        confirmLabel="重新处理"
        busy={pending === "requeue"}
        onClose={() => setRequeue(null)}
        onSubmit={async (reason) => (await run("POST", "/api/admin/processing/requeue", { group: requeue || null, reason }, { label: "requeue", success: "已重新排队" })) !== null}
      />
      <ReasonDialog
        open={!!delivery}
        title="处理投递"
        description="先到对应飞书群确认有没有收到。确认没收到再重发；开发环境不会真的发出。"
        confirmLabel="确认"
        danger={outcome === "resend"}
        busy={pending === "delivery"}
        onClose={() => setDelivery(null)}
        onSubmit={async (note) => (await run("POST", `/api/admin/deliveries/${delivery!.id}/resolve`, { outcome, note }, { label: "delivery", success: "已处理" })) !== null}
      >
        <Field label="结果">
          <Select value={outcome} onChange={(e) => setOutcome(e.target.value as typeof outcome)}>
            <option value="sent">群里已收到，标记为已送达</option>
            <option value="drop">不再发送</option>
            <option value="resend">群里没有，重新发送</option>
          </Select>
        </Field>
      </ReasonDialog>
    </AdminPage>
  );
}
