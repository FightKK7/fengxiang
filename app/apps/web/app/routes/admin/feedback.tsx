import { ADMIN, SITE } from "@aihot/site";
import { useState } from "react";
import { Form, useSearchParams } from "react-router";
import type { Route } from "./+types/feedback";
import type { AdminFeedback, AdminFeedbackRow } from "@aihot/contracts/admin";
import { adminGet } from "../../lib/admin.server";
import { useAdminAction } from "../../features/admin/action";
import { bj } from "../../features/admin/format";
import { FEEDBACK_STATUS } from "../../features/admin/labels";
import { AdminPage, Badge, Button, Card, Empty, FilterChips, Input, Pager, ReasonDialog, Select, Textarea, Time } from "../../features/admin/ui";



export async function loader({ request }: Route.LoaderArgs) {
  return adminGet<AdminFeedback>(request, `/api/admin/feedback${new URL(request.url).search}`);
}

export const meta: Route.MetaFunction = () => [{ title: `反馈 · ${SITE.name} 后台` }];

const TONE: Record<string, "accent" | "warn" | "ok" | "muted"> = { new: "accent", triaged: "warn", replied: "ok", resolved: "ok", spam: "muted" };

/** 一条反馈：2px 黑线开头，11px 元信息 + 19px 主题行 + 14px 正文，动作行靠右。 */
function FeedbackEntry({ f }: { f: AdminFeedbackRow }) {
  const { run, pending } = useAdminAction();
  const [note, setNote] = useState(f.note ?? "");
  const [dialog, setDialog] = useState<null | "ban" | "email-ban" | "erase">(null);
  const base = `/api/admin/feedback/${f.id}`;
  const version = new Date(f.updated_at).toISOString();
  // 第一条非空行当主题，其余作为正文。
  const lines = f.content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const subject = lines[0] ?? f.content.trim();
  const body = lines.slice(1).join("\n");
  return (
    <article className="border-t-2 border-ink py-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line pb-2 text-[11px] text-ink-4">
        <span className="adm-num text-ink-2">#{f.id}</span>
        <Badge tone={TONE[f.status] ?? "muted"}>{FEEDBACK_STATUS[f.status] ?? f.status}</Badge>
        <Time at={f.created_at} />
        {f.email && <a className="adm-link-muted" href={`mailto:${f.email}`}>{f.email}</a>}
        {f.page_url && <a className="adm-link-muted inline-block max-w-[320px] truncate align-bottom" href={f.page_url} target="_blank" rel="noreferrer">{f.page_url}</a>}
        {f.from_source > 1 && <Badge tone="info" title="同一来源（IP 与浏览器家族的不可逆标识）">同来源 {f.from_source} 条</Badge>}
        {f.banned && <Badge tone="bad">来源已封禁</Badge>}
        {f.email_banned && <Badge tone="bad">邮箱已临时封禁</Badge>}
        {!f.forwarded_at && f.status === "new" && (
          <Badge tone="warn" title={f.forward_error && f.forward_error !== "pending" ? `还没有转发到内部飞书群：${f.forward_error}` : "还没有转发到内部飞书群"}>未转发</Badge>
        )}
      </div>
      <h3 className="mt-2.5 text-[19px] leading-[1.55] text-ink">{subject}</h3>
      {body && <p className="mt-1.5 whitespace-pre-wrap text-[14px] leading-relaxed text-ink-3">{body}</p>}
      {f.screenshot === "local" && (
        <a href={`${base}/screenshot`} target="_blank" rel="noreferrer" className="mt-2 inline-block">
          <img src={`${base}/screenshot`} alt="反馈截图" loading="lazy" className="max-h-48 border border-line" />
        </a>
      )}
      {f.screenshot === "feishu" && <p className="mt-2 text-[12.5px] text-ink-4">截图已随反馈转到内部飞书群。</p>}
      {f.screenshot === "gone" && <p className="mt-2 text-[12.5px] text-ink-4">截图未能转到飞书，已删除。</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <Select
          aria-label="处理状态"
          className="adm-select--auto"
          value={f.status}
          disabled={!!pending}
          onChange={(e) => run("PATCH", base, { status: e.target.value, version }, { label: "status", success: "状态已更新" })}
        >
          {Object.entries(FEEDBACK_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Textarea
          rows={1}
          aria-label={`反馈 #${f.id} 的处理备注`}
          className="!min-h-[34px] max-w-[420px] flex-1"
          placeholder="处理备注（仅内部可见）"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <Button disabled={note === (f.note ?? "")} busy={pending === "note"} onClick={() => run("PATCH", base, { note: note || null, version }, { label: "note", success: "备注已保存" })}>
          保存备注
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <Button tone="ghost" onClick={() => setDialog(f.banned ? null : "ban")} disabled={f.banned} title="拒绝这个来源的后续反馈">封禁来源</Button>
          {f.email && <Button tone="ghost" onClick={() => setDialog("email-ban")} disabled={f.email_banned} title="拒绝填写这个邮箱的反馈，48 小时后自动解除">临时封禁邮箱</Button>}
          <Button tone="ghost" onClick={() => setDialog("erase")} title="按隐私说明删除提交者的资料">删除资料</Button>
        </div>
      </div>
      <ReasonDialog
        open={dialog === "ban"}
        title="封禁这个反馈来源"
        description={`同一来源之后提交反馈会被拒绝。来源标识不可还原成 IP。${ADMIN.banNote ?? ""}`}
        danger
        confirmLabel="封禁"
        onClose={() => setDialog(null)}
        onSubmit={async (reason) => (await run("POST", "/api/admin/feedback-bans", { sourceHash: f.source_hash, reason }, { label: "ban", success: "已封禁" })) !== null}
      />
      <ReasonDialog
        open={dialog === "email-ban"}
        title="临时封禁这个反馈邮箱"
        description="填写这个邮箱的反馈将暂停 48 小时，换网络或浏览器也生效。邮箱未经验证，请只在确认持续滥用后使用；不会连带封禁其他邮箱或访问网页。"
        danger
        confirmLabel="封禁 48 小时"
        onClose={() => setDialog(null)}
        onSubmit={async (reason) => (await run("POST", "/api/admin/feedback-bans", { feedbackId: f.id, reason }, { label: "email-ban", success: "邮箱已临时封禁 48 小时" })) !== null}
      />
      <ReasonDialog
        open={dialog === "erase"}
        title="删除提交者资料"
        description="删除正文、邮箱、页面地址和截图，只保留处理记录。不可恢复。"
        danger
        confirmLabel="删除"
        onClose={() => setDialog(null)}
        onSubmit={async (reason) => (await run("POST", `${base}/erase`, { reason }, { label: "erase", success: "资料已删除" })) !== null}
      />
    </article>
  );
}

export default function FeedbackAdmin({ loaderData }: Route.ComponentProps) {
  const { rows, counts, bans, page } = loaderData;
  const [sp] = useSearchParams();
  const { run } = useAdminAction();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const searching = !!sp.get("q");
  return (
    <AdminPage
      title="反馈"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterChips
          param="status"
          options={[{ value: "", label: "全部", count: total }, ...Object.entries(FEEDBACK_STATUS).map(([k, v]) => ({ value: k, label: v, count: counts[k] ?? 0 }))]}
        />
        <Form method="get" className="w-full max-w-xs">
          {sp.get("status") && <input type="hidden" name="status" value={sp.get("status")!} />}
          <Input name="q" defaultValue={sp.get("q") ?? ""} placeholder="搜索内容、邮箱、页面" aria-label="搜索反馈" />
        </Form>
      </div>
      {rows.length ? (
        <div className="border-b border-line">
          {rows.map((f) => <FeedbackEntry key={`${f.id}-${f.updated_at}`} f={f} />)}
        </div>
      ) : (
        <Empty>{searching ? "没有匹配的反馈，换个关键词试试" : "还没有反馈"}</Empty>
      )}
      <Pager page={page} hasMore={rows.length === 50} />
      {bans.length > 0 && (
        <Card title="反馈封禁" right={<span>{bans.length} 条生效中</span>}>
          <ul className="divide-y divide-line text-[12.5px]">
            {bans.map((b) => (
              <li key={b.source_hash} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  {b.source_hash.startsWith("email:") ? "邮箱" : "来源"} · <span className="adm-mono">{b.source_hash}</span> · {b.reason} · {b.created_by} · {bj(b.created_at, true)}
                  {b.expires_at && <span> · {bj(b.expires_at, true)} 自动解除</span>}
                </span>
                <Button size="sm" tone="ghost" onClick={() => run("DELETE", `/api/admin/feedback-bans/${encodeURIComponent(b.source_hash)}`, undefined, { label: `unban-${b.source_hash}`, success: "已解除封禁" })}>
                  解除
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </AdminPage>
  );
}
