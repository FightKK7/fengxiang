// 后台「专用抓取」页：普通采集器抓不到的源，在这里配一条专用抓法（模板 + 目标信源 + 参数），
// 支持新建 / 编辑 / 启停 / 删除 / 试抓一次 / 立即运行 / 全部运行，并看每次命中哪一层、条数和失败原因。
// 数据来自模块自己的 /api/admin/crawlers（server.ts）；写入走 useAdminAction 带的 CSRF + 幂等头。
import { useState } from "react";
import { useLoaderData } from "react-router";
import type {
  CrawlerAdapterView, CrawlerOverview, CrawlerPreviewResult, CrawlerRunAllView, CrawlerRunView, CrawlerSourceView, CrawlerTemplateView,
} from "@aihot/crawlers/types";
import { adminGet } from "@aihot/web/lib/admin.server";
import { useAdminAction } from "@aihot/web/features/admin/action";
import { toast } from "@aihot/web/features/admin/toast";
import { AdminPage, Badge, Button, Card, DataTable, Dot, Empty, Field, Input, ReasonDialog, Select, Stat, Stats, Time } from "@aihot/web/features/admin/ui";

export async function loader({ request }: { request: Request }) {
  return adminGet<CrawlerOverview>(request, "/api/admin/crawlers");
}

export const meta = () => [{ title: "专用抓取 · 后台" }];

const TRIGGER_LABEL: Record<CrawlerRunView["triggerKind"], string> = { manual: "手动", schedule: "定时" };

/** 展示时去掉「Tier N · 」前缀：这一列讲的是用什么方式抓，不是给层级编号。 */
function shortTier(name: string): string {
  return name.replace(/^Tier \d+ · /, "");
}

/** 命中的是第几层（0 = Tier 0）；用于判断有没有降级。 */
function hitLevel(adapter: CrawlerAdapterView): number {
  const run = adapter.lastRun;
  if (!run?.tier) return -1;
  return adapter.tiers.findIndex((tier) => tier.name === run.tier);
}

interface Draft {
  mode: "create" | "edit";
  id: string | null;
  name: string;
  template: string;
  sourceId: string;
  url: string;
  config: Record<string, string>;
  enabled: boolean;
  recentRuns: CrawlerRunView[];
}

function initialConfig(template: CrawlerTemplateView): Record<string, string> {
  return Object.fromEntries(template.fields.map((field) => [field.key, field.value]));
}

function newDraft(templates: CrawlerTemplateView[], sources: CrawlerSourceView[]): Draft {
  const template = templates[0]!;
  const sourceId = sources.some((source) => source.id === template.sourceId) ? template.sourceId : (sources[0]?.id ?? "");
  return {
    mode: "create", id: null, name: "", template: template.id, sourceId,
    url: template.url, config: initialConfig(template), enabled: true, recentRuns: [],
  };
}

function editDraft(adapter: CrawlerAdapterView, templates: CrawlerTemplateView[]): Draft {
  const template = templates.find((entry) => entry.id === adapter.template)!;
  const config = initialConfig(template);
  for (const field of template.fields) {
    const value = adapter.config[field.key];
    if (value !== undefined) config[field.key] = String(value);
  }
  return {
    mode: "edit", id: adapter.id, name: adapter.name, template: adapter.template, sourceId: adapter.sourceId,
    url: adapter.url, config, enabled: adapter.enabled, recentRuns: adapter.recentRuns,
  };
}

function LastRun({ run, error }: { run: CrawlerRunView | null; error: string | null }) {
  if (!run) return <span className="adm-link-muted">从未运行</span>;
  return (
    <div className="flex flex-col gap-0.5">
      <span><Time at={run.startedAt} /> · {TRIGGER_LABEL[run.triggerKind]}</span>
      <span className="flex items-center gap-1.5 text-[11px] text-ink-3">
        <Dot tone={run.ok ? "ok" : "bad"} />
        <span className={run.ok ? undefined : "text-hot"}>{run.ok ? "成功" : "失败"}</span>
        {run.tier ? <span className="text-ink-4">· {shortTier(run.tier)}</span> : null}
      </span>
      {error ? <span className="line-clamp-2 max-w-[220px] text-[11px] text-hot" title={error}>{error}</span> : null}
    </div>
  );
}

function RunHistory({ runs, unit }: { runs: CrawlerRunView[]; unit: string }) {
  if (!runs.length) return <p className="text-[12px] text-ink-4">还没有运行记录。</p>;
  return (
    <ul className="space-y-1.5">
      {runs.map((run) => (
        <li key={run.startedAt} className="flex flex-wrap items-baseline gap-x-2 text-[12px]">
          <Time at={run.startedAt} />
          <span className="text-ink-4">{TRIGGER_LABEL[run.triggerKind]}</span>
          <Badge tone={run.ok ? "ok" : "bad"}>{run.ok ? "成功" : "失败"}</Badge>
          <span className="text-ink-4">{run.tier ?? "—"}</span>
          <span className="adm-num">{run.items} {unit} · 新增 {run.created} · {run.durationMs}ms</span>
          {run.error ? <span className="w-full text-[11px] text-hot">{run.error}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function PreviewPanel({ result }: { result: CrawlerPreviewResult }) {
  return (
    <div className="adm-preview">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px]">
        <Badge tone={result.ok ? "ok" : "bad"}>{result.ok ? "试抓成功" : "试抓失败"}</Badge>
        <span>观测 <b className="adm-num">{result.observed}</b> {result.unit}</span>
        <span>会推送 <b className="adm-num">{result.items.length}</b> 条</span>
        <span className="adm-num text-ink-4">{result.durationMs} ms</span>
      </div>
      {result.error && <p className="mt-2 text-[12px] text-hot">{result.error}</p>}
      <ul className="mt-2 space-y-1">
        {result.tiers.map((tier) => (
          <li key={tier.name} className="flex flex-wrap items-baseline gap-x-2 text-[11px] text-ink-4">
            <span>{tier.name}</span>
            <span>
              {tier.skipped ? "跳过" : tier.ok ? `成功 · ${tier.durationMs}ms` : `失败：${tier.error ?? "未知错误"}`}
            </span>
          </li>
        ))}
      </ul>
      {result.items.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-line pt-2">
          {result.items.map((item) => (
            <li key={item.url} className="truncate text-[12px] text-ink-2">{item.title}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 新建 / 编辑对话框：模板决定字段；「试抓一次」当场用表单值跑一次，不落库。 */
function EditDialog({
  draft, templates, sources, onClose,
}: {
  draft: Draft;
  templates: CrawlerTemplateView[];
  sources: CrawlerSourceView[];
  onClose: () => void;
}) {
  const { run, pending } = useAdminAction();
  const [form, setForm] = useState(draft);
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<CrawlerPreviewResult | null>(null);
  const template = templates.find((entry) => entry.id === form.template)!;
  const previewing = pending === "crawler-preview";
  const saving = pending === "crawler-save";

  const previewNow = async () => {
    setPreview(null);
    const result = await run<CrawlerPreviewResult>(
      "POST", "/api/admin/crawlers/preview",
      { name: form.name, template: form.template, sourceId: form.sourceId, url: form.url, config: form.config },
      { label: "crawler-preview", revalidate: false },
    );
    if (result) setPreview(result);
  };

  return (
    <div className="adm-overlay">
      <button type="button" className="adm-overlay-bg" aria-label="关闭" onClick={onClose} />
      <form
        role="dialog"
        aria-modal="true"
        className="adm-dialog"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!reason.trim()) return;
          const body = {
            name: form.name, template: form.template, sourceId: form.sourceId, url: form.url,
            config: form.config, enabled: form.enabled, reason: reason.trim(),
          };
          const result = draft.mode === "create"
            ? await run("POST", "/api/admin/crawlers", body, { label: "crawler-save", success: "抓取器已创建" })
            : await run("PATCH", `/api/admin/crawlers/${encodeURIComponent(draft.id!)}`, body, { label: "crawler-save", success: "已保存" });
          if (result) onClose();
        }}
      >
        <h2 className="adm-dialog-title">{draft.mode === "create" ? "新建抓取器" : `编辑：${draft.name}`}</h2>
        <div className="adm-dialog-body grid gap-4 sm:grid-cols-2">
          <Field label="名称">
            <Input required maxLength={40} value={form.name} placeholder="飞书功能变化" onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </Field>
          {draft.mode === "create" && (
            <Field label="抓取模板">
              <Select
                value={form.template}
                onChange={(event) => {
                  const next = templates.find((entry) => entry.id === event.target.value)!;
                  const sourceId = sources.some((source) => source.id === next.sourceId) ? next.sourceId : form.sourceId;
                  setForm({ ...form, template: next.id, url: next.url, sourceId, config: initialConfig(next) });
                }}
              >
                {templates.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
              </Select>
            </Field>
          )}
          <Field label="目标信源">
            <Select value={form.sourceId} onChange={(event) => setForm({ ...form, sourceId: event.target.value })}>
              {sources.map((source) => (
                <option key={source.id} value={source.id}>{source.name}{source.enabled ? "" : "（已停用）"}</option>
              ))}
            </Select>
          </Field>
          <Field label="页面地址">
            <Input required value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} />
          </Field>
          {template.fields.map((field) => (
            <Field key={field.key} label={field.label} hint={field.hint}>
              <Input
                type={field.kind === "number" ? "number" : "text"}
                min={field.min}
                max={field.max}
                value={form.config[field.key] ?? field.value}
                onChange={(event) => setForm({ ...form, config: { ...form.config, [field.key]: event.target.value } })}
              />
            </Field>
          ))}

        </div>
        <div className="adm-dialog-body">
          <p className="text-[12px] text-ink-4">{template.about}{draft.mode === "edit" ? "启用 / 停用在列表里直接切换。" : ""}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button size="sm" busy={previewing} disabled={previewing} onClick={previewNow}>试抓一次</Button>
            <span className="text-[11px] text-ink-4">只读：不推送、不写快照</span>
          </div>
          {preview && <div className="mt-3"><PreviewPanel result={preview} /></div>}
        </div>
        {draft.mode === "edit" && (
          <div className="adm-dialog-body">
            <div className="adm-label mb-2">最近运行</div>
            <RunHistory runs={form.recentRuns} unit={template.unit} />
          </div>
        )}
        <div className="adm-dialog-body">
          <Field label="原因（写进审计记录）">
            <Input required value={reason} placeholder="为什么建/改这条抓取器" onChange={(event) => setReason(event.target.value)} />
          </Field>
        </div>
        <div className="adm-dialog-foot">
          <Button tone="ghost" onClick={onClose}>取消</Button>
          <Button type="submit" tone="primary" busy={saving} disabled={!reason.trim()}>保存</Button>
        </div>
      </form>
    </div>
  );
}

export default function AdminCrawlers() {
  const { adapters, templates, sources, generatedAt } = useLoaderData<typeof loader>();
  const { run, pending } = useAdminAction();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [removing, setRemoving] = useState<CrawlerAdapterView | null>(null);
  const failed = adapters.filter((adapter) => adapter.lastRun && !adapter.lastRun.ok).length;
  const enabled = adapters.filter((adapter) => adapter.enabled).length;
  const degraded = adapters.filter((adapter) => hitLevel(adapter) > 0).length;

  const runAll = async () => {
    const result = await run<CrawlerRunAllView>("POST", "/api/admin/crawlers/run-all", undefined, { label: "crawler-run-all" });
    if (!result) return;
    const skipped = result.results.filter((row) => row.skipped).length;
    const total = result.results.length - skipped;
    if (result.failed > 0) toast(`全部运行：${total - result.failed} 成功、${result.failed} 失败`, "error");
    else toast(`全部运行：${total} 个成功${skipped ? `，${skipped} 个跳过` : ""}`, "ok");
  };

  return (
    <AdminPage
      title="专用抓取"
      meta={<>{adapters.length} 条 · 读取于 <Time at={generatedAt} /></>}
      actions={
        <>
          <Button onClick={runAll} busy={pending === "crawler-run-all"} disabled={pending !== null}>全部运行</Button>
          <Button tone="primary" onClick={() => setDraft(newDraft(templates, sources))}>新建抓取器</Button>
        </>
      }
    >
      <Stats>
        <Stat label="抓取器" value={adapters.length} />
        <Stat label="启用" value={enabled} />
        <Stat label="上次失败" value={failed} tone={failed ? "bad" : "ok"} />
        <Stat label="已降级" value={degraded} tone={degraded ? "warn" : undefined} />
      </Stats>

      <Card title="抓取器" pad={false}>
        <DataTable
          rows={adapters}
          rowKey={(adapter) => adapter.id}
          empty={
            <div>
              还没有专用抓取器。普通采集器抓不到的源，在这里配一条专用抓法。
              <div className="mt-3"><Button tone="primary" size="sm" onClick={() => setDraft(newDraft(templates, sources))}>新建抓取器</Button></div>
            </div>
          }
          columns={[
            {
              key: "adapter",
              label: "抓取器",
              className: "min-w-[160px]",
              render: (adapter) => (
                <span className="text-ink" title={`模板 ${adapter.templateName} · ${adapter.id}`}>{adapter.name}</span>
              ),
            },
            {
              key: "source",
              label: "目标信源",
              className: "min-w-[130px]",
              render: (adapter) => (
                <div className="flex flex-col gap-0.5">
                  <span>{adapter.sourceName ?? adapter.sourceId}</span>
                  {adapter.sourceEnabled === false && <span className="adm-tone-warn text-[11px]">源已停用</span>}
                  {adapter.sourceEnabled === null && <span className="text-[11px] text-hot">源不存在</span>}
                </div>
              ),
            },
            {
              key: "chain",
              label: "抓取方式",
              className: "min-w-[190px]",
              render: (adapter) => {
                const usable = adapter.tiers.filter((tier) => tier.available);
                const blocked = adapter.tiers.length - usable.length;
                return (
                  <div
                    className="flex flex-col gap-0.5"
                    title={adapter.tiers.map((tier) => `${tier.name}${tier.available ? "" : "（未启用）"}${tier.note ? `：${tier.note}` : ""}`).join("\n")}
                  >
                    <span className="text-[12.5px]">{usable.length ? usable.map((tier) => shortTier(tier.name)).join(" → ") : "没有可用层级"}</span>
                    {blocked > 0 && <span className="text-[11px] text-ink-4">另有 {blocked} 级未启用</span>}
                  </div>
                );
              },
            },
            {
              key: "lastRun",
              label: "上次运行",
              className: "min-w-[190px]",
              render: (adapter) => <LastRun run={adapter.lastRun} error={adapter.lastError} />,
            },
            {
              key: "items",
              label: "条数",
              align: "right",
              render: (adapter) =>
                adapter.lastRun ? (
                  <div>
                    <div className="adm-nowrap">{adapter.lastRun.items} {adapter.unit}</div>
                    <div className="adm-nowrap text-[11px] text-ink-4">新增 {adapter.lastRun.created} · {adapter.lastRun.durationMs}ms</div>
                  </div>
                ) : "—",
            },
            {
              key: "action",
              label: "操作",
              align: "right",
              render: (adapter) => (
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={adapter.enabled}
                    aria-label={adapter.enabled ? `停用 ${adapter.name}` : `启用 ${adapter.name}`}
                    className="adm-switch"
                    disabled={pending !== null}
                    onClick={async () => {
                      await run("PATCH", `/api/admin/crawlers/${encodeURIComponent(adapter.id)}/enabled`, { enabled: !adapter.enabled }, {
                        label: `crawler-toggle-${adapter.id}`,
                        success: adapter.enabled ? "已停用" : "已启用",
                      });
                    }}
                  >
                    <span className="adm-switch-track" aria-hidden="true" />
                    <span className="adm-nowrap">{adapter.enabled ? "启用" : "已停用"}</span>
                  </button>
                  <Button
                    size="sm"
                    busy={pending === `crawler-${adapter.id}`}
                    disabled={pending !== null || !adapter.enabled || adapter.sourceEnabled === false}
                    title={!adapter.enabled ? "抓取器已停用，先编辑启用" : adapter.sourceEnabled === false ? "目标信源已停用，先到「信源」页启用" : undefined}
                    onClick={async () => {
                      const result = await run<{ ok: boolean; run: CrawlerRunView }>(
                        "POST", `/api/admin/crawlers/${encodeURIComponent(adapter.id)}/run`, undefined,
                        { label: `crawler-${adapter.id}` },
                      );
                      if (!result) return;
                      if (result.run?.ok) toast(`${adapter.name}：${result.run.items} ${adapter.unit}，新增 ${result.run.created}`, "ok");
                      else toast(`${adapter.name} 运行失败：${result.run?.error ?? "未知错误"}`, "error");
                    }}
                  >
                    立即运行
                  </Button>
                  <Button size="sm" onClick={() => setDraft(editDraft(adapter, templates))}>编辑</Button>
                  <Button size="sm" tone="ghost" onClick={() => setRemoving(adapter)}>删除</Button>
                </div>
              ),
            },
          ]}
        />
      </Card>

      {draft && (
        <EditDialog key={`${draft.mode}-${draft.id ?? "new"}`} draft={draft} templates={templates} sources={sources} onClose={() => setDraft(null)} />
      )}

      <ReasonDialog
        open={!!removing}
        title={removing ? `删除抓取器：${removing.name}` : "删除抓取器"}
        description="删除后不再运行，也不在列表显示；历史运行记录和审计保留。"
        confirmLabel="删除"
        danger
        busy={pending?.startsWith("crawler-delete") === true}
        onClose={() => setRemoving(null)}
        onSubmit={async (reason) => {
          if (!removing) return false;
          const result = await run("DELETE", `/api/admin/crawlers/${encodeURIComponent(removing.id)}`, { reason }, {
            label: `crawler-delete-${removing.id}`, success: "已删除",
          });
          return result !== null;
        }}
      />
    </AdminPage>
  );
}
