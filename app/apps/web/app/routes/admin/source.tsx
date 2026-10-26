import { SITE } from "@aihot/site";
import { useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/source";
import { REPLACEABLE_SOURCE_KINDS, type AdminSource, type AdminSourceDetail, type AdminSourceFetch, type AdminSourcePreview, type AdminSourceUpdate } from "@aihot/contracts/admin";
import { adminGet } from "../../lib/admin.server";
import { useAdminAction } from "../../features/admin/action";
import { toast } from "../../features/admin/toast";
import { bj, duration, num } from "../../features/admin/format";
import { HEALTH_LABEL, KIND_LABEL, MODE_LABEL, TIER_LABEL, VISIBILITY_LABEL } from "../../features/admin/labels";
import { AdminPage, Badge, Button, Card, DataTable, Dot, Empty, Field, healthTone, Input, Json, KV, ReasonDialog, Select, Stat, Stats, Textarea, Time } from "../../features/admin/ui";

export async function loader({ request, params }: Route.LoaderArgs) {
  return adminGet<AdminSourceDetail>(request, `/api/admin/sources/${encodeURIComponent(params.id)}`);
}

export const meta: Route.MetaFunction = ({ loaderData }) => [{ title: `${loaderData?.source.name ?? "信源"} · ${SITE.name} 后台` }];

type Draft = Pick<AdminSource, "name" | "kind" | "interval_minutes" | "tier" | "participation_mode" | "signal_group_id" | "first_party" | "owner_entity_id" | "site_fulltext" | "syndicate_fulltext"> & { tags: string; config: string };

function draftOf(s: AdminSource): Draft {
  return {
    name: s.name,
    kind: s.kind,
    interval_minutes: s.interval_minutes,
    tier: s.tier,
    participation_mode: s.participation_mode,
    signal_group_id: s.signal_group_id,
    first_party: s.first_party,
    owner_entity_id: s.owner_entity_id,
    site_fulltext: s.site_fulltext,
    syndicate_fulltext: s.syndicate_fulltext,
    tags: s.tags.join(", "),
    config: JSON.stringify(s.config, null, 2),
  };
}

/** 采集记录的状态。 */
const RUN_LABEL: Record<string, string> = { ok: "成功", failed: "失败", skipped: "跳过" };
/** 能直接抓取的采集方式；外部上报与公众号由来源方推送，不能预览。 */
const PREVIEWABLE = new Set(["rss", "web_list", "json_list", "x_search"]);
/** 条目处理状态。 */
const STATE_LABEL: Record<string, string> = { new: "待处理", analyzed: "已处理", failed: "失败", skipped: "跳过", blocked: "拦截" };
/** 保存弹窗里列出改动字段时用的中文名。 */
const FIELD_LABEL: Record<string, string> = {
  name: "名称",
  kind: "采集方式",
  interval_minutes: "采集间隔",
  tier: "等级",
  participation_mode: "参与方式",
  signal_group_id: "讨论分组",
  first_party: "一手",
  owner_entity_id: "运营主体",
  site_fulltext: "站内全文",
  syndicate_fulltext: "对外全文",
  tags: "标签",
  config: "采集配置",
};
/** 修改记录的动作用中文。 */
const ACTION_LABEL: Record<string, string> = { "source.update": "修改设置", "source.create": "创建信源", "source.fetch": "手动采集" };

/** 审计里的操作人：密码登录记成 admin:<id>，不在界面上露出数字。 */
function actorName(actor: string): string {
  return actor.startsWith("admin:") ? "管理员" : actor.startsWith("dev:") ? "开发账号" : actor;
}

export default function SourceDetail({ loaderData }: Route.ComponentProps) {
  const { source: s, runs, items, stats, history } = loaderData;
  const { run, pending } = useAdminAction();
  const [draft, setDraft] = useState<Draft>(() => draftOf(s));
  const [draftFor, setDraftFor] = useState(s.updated_at);
  const [preview, setPreview] = useState<AdminSourcePreview | null>(null);
  const [dialog, setDialog] = useState<null | "save" | "toggle">(null);
  const [configError, setConfigError] = useState<string | null>(null);
  // 历史回填：从采集配置里读出来单独放两个数字框，省得让人手改 JSON（0 = 不回填，默认）。
  const backfill = (() => {
    try {
      const c = JSON.parse(draft.config) as { _aihot?: { initialBackfillMonths?: number; initialBackfillLimit?: number } };
      return { months: Number(c?._aihot?.initialBackfillMonths ?? 12), limit: Number(c?._aihot?.initialBackfillLimit ?? 30) };
    } catch {
      return { months: 12, limit: 30 };
    }
  })();
  const setBackfill = (field: "initialBackfillMonths" | "initialBackfillLimit", value: number) => {
    let c: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(draft.config) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) c = parsed as Record<string, unknown>;
    } catch {}
    const aihot = { ...((c._aihot as Record<string, unknown> | undefined) ?? {}), [field]: value };
    setDraft({ ...draft, config: JSON.stringify({ ...c, _aihot: aihot }, null, 2) });
  };
  if (draftFor !== s.updated_at) {
    // The source changed (our own save or someone else's): start from the saved state.
    setDraft(draftOf(s));
    setDraftFor(s.updated_at);
  }
  const base = `/api/admin/sources/${encodeURIComponent(s.id)}`;

  const patch = (): AdminSourceUpdate["patch"] | null => {
    let config: unknown;
    try {
      config = JSON.parse(draft.config);
      setConfigError(null);
    } catch (e) {
      setConfigError(`配置不是合法 JSON：${(e as Error).message}`);
      return null;
    }
    const next: Record<string, unknown> = {
      ...draft,
      tags: draft.tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean),
      config,
      interval_minutes: Number(draft.interval_minutes),
      signal_group_id: draft.signal_group_id || null,
      owner_entity_id: draft.owner_entity_id || null,
    };
    const before = draftOf(s) as Record<string, unknown>;
    const changed: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(next)) {
      const was = k === "tags" ? s.tags : k === "config" ? s.config : before[k];
      if (JSON.stringify(v) !== JSON.stringify(was)) changed[k] = v;
    }
    if (draft.kind !== s.kind) changed.config = config;
    return changed as AdminSourceUpdate["patch"];
  };
  const changes = (() => {
    try {
      return Object.keys(patchPreview(draft, s)).length;
    } catch {
      return 1;
    }
  })();
  const changedFields = (() => {
    try {
      return Object.keys(patchPreview(draft, s)).map((k) => FIELD_LABEL[k] ?? k);
    } catch {
      return [];
    }
  })();

  return (
    <AdminPage
      title={
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {s.name}
          {!s.enabled && <Badge tone="muted">已暂停</Badge>}
          <Badge tone="info">{KIND_LABEL[s.kind] ?? s.kind}</Badge>
          <Badge>{MODE_LABEL[s.participation_mode] ?? s.participation_mode}</Badge>
        </span>
      }
      actions={
        <>
          {PREVIEWABLE.has(draft.kind) ? (
            <Button
              busy={pending === "preview"}
              onClick={async () => {
                const p = patch();
                if (!p) return;
                const r = changes && (REPLACEABLE_SOURCE_KINDS as readonly string[]).includes(draft.kind)
                  ? await run<AdminSourcePreview>("POST", "/api/admin/sources/preview", { id: s.id, kind: draft.kind, config: p.config ?? s.config, participation_mode: draft.participation_mode }, { label: "preview", revalidate: false })
                  : await run<AdminSourcePreview>("POST", `${base}/preview`, undefined, { label: "preview", revalidate: false });
                if (r) setPreview(r);
              }}
            >
              预览抓取
            </Button>
          ) : (
            <span className="max-w-[210px] text-[11px] text-ink-4">这类信源由来源方推送，不能预览抓取</span>
          )}
          <Button
            tone="primary"
            busy={pending === "fetch"}
            disabled={!s.enabled}
            title={s.enabled ? "立即抓取一次这个信源" : "信源已暂停，恢复后才能采集"}
            onClick={async () => {
              const r = await run<AdminSourceFetch>("POST", `${base}/fetch`, undefined, { label: "fetch" });
              if (!r) return;
              const c = r.collected;
              // 采集总开关关闭时后台当场抓取并带回结果；打开时只入队，由 worker 执行。
              if (!c) {
                toast("已加入采集队列，后台进程会很快开始抓取", "ok");
                return;
              }
              if (c.status === "failed") toast(`采集失败：${c.error ?? "未知错误"}`, "error");
              else if (c.status === "skipped") toast(`本次跳过：${c.error === "paused" ? "信源已暂停" : c.error === "missing" ? "信源不存在" : "这类信源不主动抓取"}`, "info");
              else toast(`采集完成：发现 ${c.found} 条，新增 ${c.created} 条${c.revised ? `，更新 ${c.revised} 条` : ""}`, "ok");
            }}
          >
            立即采集
          </Button>
          <Button tone={s.enabled ? "danger" : "primary"} onClick={() => setDialog("toggle")}>
            {s.enabled ? "暂停" : "恢复"}
          </Button>
        </>
      }
    >
      <Stats>
        <Stat
          label="健康"
          value={
            <span className="inline-flex items-center gap-2">
              <Dot tone={s.enabled ? healthTone(s.health) : "muted"} />
              {s.enabled ? HEALTH_LABEL[s.health] ?? s.health : "已暂停"}
            </span>
          }
          hint={s.fail_count ? `连续失败 ${s.fail_count} 次` : s.last_ok_at ? `上次成功 ${bj(s.last_ok_at)}` : "还没有成功记录"}
          tone={s.enabled && s.health === "failing" ? "bad" : s.enabled && s.health === "degraded" ? "warn" : undefined}
        />
        <Stat label="累计条目" value={num(stats.total)} />
        <Stat label="近 7 天" value={num(stats.last7d)} />
        <Stat label="入选精选" value={num(stats.selected)} />
      </Stats>

      {s.last_error && s.health !== "ok" && (
        <Card title="最近一次采集失败" right={s.last_fetch_at ? <span className="adm-num">上次抓取 {bj(s.last_fetch_at, true)}</span> : undefined}>
          <p className="adm-pre-wrap text-[14px] text-hot">{s.last_error}</p>
        </Card>
      )}

      {preview && (
        <Card
          title="抓取预览"
          right={
            <span className="inline-flex items-center gap-3">
              <span className="adm-num">
                {preview.count} 条 · {preview.ms}ms · 未入库
              </span>
              <Button tone="ghost" size="sm" onClick={() => setPreview(null)}>
                收起
              </Button>
            </span>
          }
          pad={false}
        >
          <DataTable
            rows={preview.items}
            rowKey={(i) => i.url}
            empty="没有抓到条目。检查地址、选择器或登录要求。"
            columns={[
              {
                key: "title",
                label: "标题",
                render: (i) => (
                  <div className="min-w-[280px]">
                    <a href={i.url} target="_blank" rel="noreferrer" className="adm-link">
                      {i.title}
                    </a>
                    {i.excerpt && <div className="mt-0.5 line-clamp-2 text-[12.5px] text-ink-4">{i.excerpt}</div>}
                  </div>
                ),
              },
              { key: "published", label: "发布", render: (i) => <Time at={i.publishedAt} /> },
            ]}
          />
        </Card>
      )}

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="grid gap-5">
          <Card title="信源设置" right={<span className="adm-num">版本 {bj(s.updated_at, true)}</span>}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="名称">
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </Field>
              {(REPLACEABLE_SOURCE_KINDS as readonly string[]).includes(s.kind) && (
                <Field label="采集方式" hint="修改保留历史；保存前先预览">
                  <Select value={draft.kind} onChange={(e) => { setDraft({ ...draft, kind: e.target.value }); setPreview(null); }}>
                    {REPLACEABLE_SOURCE_KINDS.map((kind) => <option key={kind} value={kind}>{KIND_LABEL[kind]}</option>)}
                  </Select>
                </Field>
              )}
              <Field label="采集间隔（分钟，1–1440）">
                <Input type="number" min={1} max={1440} value={draft.interval_minutes} onChange={(e) => setDraft({ ...draft, interval_minutes: Number(e.target.value) })} />
              </Field>
              <Field label="参与方式">
                <Select value={draft.participation_mode} onChange={(e) => setDraft({ ...draft, participation_mode: e.target.value })}>
                  {Object.entries(MODE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </Field>
              <Field label="等级">
                <Select value={draft.tier} onChange={(e) => setDraft({ ...draft, tier: e.target.value })}>
                  {Object.entries(TIER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </Field>
              <Field label="讨论分组 ID">
                <Input value={draft.signal_group_id ?? ""} onChange={(e) => setDraft({ ...draft, signal_group_id: e.target.value })} />
              </Field>
              <Field label="运营主体 ID">
                <Input value={draft.owner_entity_id ?? ""} onChange={(e) => setDraft({ ...draft, owner_entity_id: e.target.value })} />
              </Field>
              <Field label="标签（逗号分隔）">
                <Input value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} />
              </Field>
              <div className="flex flex-col justify-end gap-2 text-[14px] text-ink-3">
                {([
                  ["site_fulltext", "站内可展示全文"],
                  ["syndicate_fulltext", "对外接口可带全文"],
                ] as const).map(([k, label]) => (
                  <label key={k} className="inline-flex items-center gap-2">
                    <input type="checkbox" className="size-4 accent-[var(--ink)]" checked={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.checked })} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="历史回填（月）" hint="首次抓取最多回溯几个月；0 = 不回填历史，只收接入之后的新变化。">
                <Input type="number" min={0} max={120} value={backfill.months} onChange={(e) => setBackfill("initialBackfillMonths", Number(e.target.value))} />
              </Field>
              <Field label="单次回填条数" hint="首次抓取最多入库几条；0 = 一条历史都不回填。">
                <Input type="number" min={0} max={200} value={backfill.limit} onChange={(e) => setBackfill("initialBackfillLimit", Number(e.target.value))} />
              </Field>
            </div>
            <div className="mt-4">
              <Field label="采集配置（JSON）">
                <Textarea className="font-mono" rows={Math.min(18, draft.config.split("\n").length + 1)} value={draft.config} onChange={(e) => setDraft({ ...draft, config: e.target.value })} spellCheck={false} />
              </Field>
              {configError && <div className="mt-1 text-[12.5px] text-hot">{configError}</div>}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              {changes > 0 && <span className="text-[12.5px] text-ink-4">{changedFields.join("、")} 未保存</span>}
              <Button tone="ghost" disabled={!changes} onClick={() => setDraft(draftOf(s))}>还原</Button>
              <Button tone="primary" disabled={!changes} onClick={() => patch() && setDialog("save")}>保存</Button>
            </div>
          </Card>

          <Card title="最近条目" pad={false}>
            <DataTable
              rows={items}
              rowKey={(r) => r.id}
              empty="还没有采集到内容。"
              columns={[
                {
                  key: "t",
                  label: "标题",
                  render: (r) => (
                    <Link to={`/admin/content/${r.id}`} className="adm-link line-clamp-2 min-w-[260px]">{r.title_zh || r.title}</Link>
                  ),
                },
                {
                  key: "s",
                  label: "状态",
                  render: (r) => (
                    <span className="flex flex-wrap gap-1">
                      {r.selected && <Badge tone="info">精选</Badge>}
                      {r.visibility && r.visibility !== "public" && <Badge tone="warn">{VISIBILITY_LABEL[r.visibility] ?? r.visibility}</Badge>}
                      <Badge tone={r.processing_state === "failed" ? "bad" : "muted"}>{STATE_LABEL[r.processing_state] ?? r.processing_state}</Badge>
                    </span>
                  ),
                },
                { key: "d", label: "发现", render: (r) => <Time at={r.discovered_at} /> },
              ]}
            />
          </Card>
        </div>

        <div className="grid gap-5">
          <Card title="状态">
            <KV
              items={[
                ["信源 ID", <span className="adm-mono">{s.id}</span>],
                ["采集方式", KIND_LABEL[s.kind] ?? s.kind],
                ["参与方式", MODE_LABEL[s.participation_mode] ?? s.participation_mode],
                ["等级", TIER_LABEL[s.tier] ?? s.tier],
                ["上次抓取", s.last_fetch_at ? <span className="adm-num">{bj(s.last_fetch_at, true)}</span> : null],
                ["上次成功", s.last_ok_at ? <span className="adm-num">{bj(s.last_ok_at, true)}</span> : null],
                ["下次抓取", s.next_fetch_at ? <span className="adm-num">{bj(s.next_fetch_at, true)}</span> : null],
                ["创建", <span className="adm-num">{bj(s.created_at, true)}</span>],
              ]}
            />
            {s.cursor && <div className="mt-3"><Json value={s.cursor} label="游标（上次读到哪）" /></div>}
          </Card>
          <Card title="采集记录" pad={false}>
            <DataTable
              dense
              rows={runs}
              rowKey={(r) => r.id}
              empty="还没有采集记录。"
              columns={[
                { key: "at", label: "时间", render: (r) => <span className="adm-num adm-nowrap">{bj(r.started_at)}</span> },
                {
                  key: "st",
                  label: "结果",
                  render: (r) => (
                    <span className="inline-flex flex-wrap gap-1">
                      <Badge tone={r.status === "ok" ? "ok" : r.status === "failed" ? "bad" : "muted"} title={r.error ?? undefined}>{RUN_LABEL[r.status] ?? r.status}</Badge>
                      {!!r.detail?.presentationFailures?.length && <Badge tone="warn" title={r.detail.presentationFailures.map((f) => `${f.url}: ${f.error}`).join("\n")}>正文展示待处理 {r.detail.presentationFailures.length}</Badge>}
                      {!!r.detail?.dropped && <Badge tone="bad" title="有一段更早的帖子没能读完，其中的内容可能漏采">可能漏采</Badge>}
                      {!r.detail?.dropped && !!r.detail?.backlog && <Badge tone="warn" title="帖子多于一轮能读的页数，余下的在后面几轮接着读">续读 {r.detail.backlog} 段</Badge>}
                    </span>
                  ),
                },
                { key: "n", label: "发现/新增", align: "right", render: (r) => `${r.found_count ?? "—"}/${r.new_count ?? "—"}` },
                { key: "ms", label: "耗时", align: "right", render: (r) => duration(r.started_at, r.finished_at) },
              ]}
            />
          </Card>
          <Card title="修改记录">
            {history.length ? (
              <ul className="grid gap-2">
                {history.map((h, i) => (
                  <li key={i}>
                    <div className="text-[14px] text-ink-3">
                      <span className="text-ink">{ACTION_LABEL[h.action] ?? h.action}</span> · {actorName(h.actor)} · <span className="adm-num">{bj(h.created_at)}</span>
                    </div>
                    {h.reason && <div className="mt-0.5 text-[12.5px] text-ink-4">原因：{h.reason}</div>}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>没有人工修改。</Empty>
            )}
          </Card>
        </div>
      </div>

      <ReasonDialog
        open={dialog === "save"}
        title="保存信源设置"
        description={`${draft.kind !== s.kind ? `采集方式由 ${KIND_LABEL[s.kind]} 调整为 ${KIND_LABEL[draft.kind]}，保留历史内容。` : ""}将修改：${changedFields.join("、") || "无"}`}
        busy={pending === "save"}
        onClose={() => setDialog(null)}
        onSubmit={async (reason) => {
          const p = patch();
          if (!p) return false;
          const body: AdminSourceUpdate = { patch: p, version: new Date(s.updated_at).toISOString(), reason };
          const r = await run("PATCH", base, body, { label: "save", success: "已保存" });
          return r !== null;
        }}
      />
      <ReasonDialog
        open={dialog === "toggle"}
        title={s.enabled ? "暂停这个信源" : "恢复这个信源"}
        description={s.enabled ? "暂停后不再采集，已有内容和历史保留。" : "恢复后会立即排队采集一次。"}
        danger={s.enabled}
        confirmLabel={s.enabled ? "暂停" : "恢复"}
        busy={pending === "toggle"}
        onClose={() => setDialog(null)}
        onSubmit={async (reason) => {
          const r = await run("PATCH", base, { patch: { enabled: !s.enabled }, version: new Date(s.updated_at).toISOString(), reason }, { label: "toggle", success: s.enabled ? "已暂停" : "已恢复" });
          return r !== null;
        }}
      />
    </AdminPage>
  );
}

/** Field names that differ from the saved source (for the confirmation text). */
function patchPreview(draft: Draft, s: AdminSource): Record<string, true> {
  const out: Record<string, true> = {};
  const saved = draftOf(s);
  for (const k of Object.keys(draft) as Array<keyof Draft>) {
    if (k === "config") {
      try {
        if (JSON.stringify(JSON.parse(draft.config)) !== JSON.stringify(s.config)) out.config = true;
      } catch {
        out.config = true;
      }
    } else if (String(draft[k] ?? "") !== String(saved[k] ?? "")) out[k] = true;
  }
  return out;
}
