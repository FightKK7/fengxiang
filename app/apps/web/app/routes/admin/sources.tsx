import { useState } from "react";
import { SITE } from "@aihot/site";
import { Form, Link, useNavigate, useSearchParams } from "react-router";
import type { Route } from "./+types/sources";
import type { AdminSourceBatchAction, AdminSourceBatchResult, AdminSourceFetch, AdminSources } from "@aihot/contracts/admin";
import { adminGet } from "../../lib/admin.server";
import { useAdminAction } from "../../features/admin/action";
import { num } from "../../features/admin/format";
import { HEALTH_LABEL, KIND_LABEL, MODE_LABEL, TIER_LABEL } from "../../features/admin/labels";
import { toast } from "../../features/admin/toast";
import { AdminPage, Badge, Button, ButtonLink, Checkbox, DataTable, Dot, FilterChips, healthTone, Input, Pager, ReasonDialog, Select, Stat, Stats, Time } from "../../features/admin/ui";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  // 筛选只有一组「状态」页签，但真正的两态是启用/暂停（enabled 列），失败与不稳定是健康状态。
  // 这里把页签值翻译成接口参数：启用/暂停走 enabled，失败/不稳定走 health；旧链接（如运行页的
  // health=failing）保持可用。
  const api = new URLSearchParams(url.searchParams);
  const state = api.get("health");
  if (state === "enabled" || state === "paused") {
    api.delete("health");
    api.set("enabled", state === "enabled" ? "true" : "false");
  }
  return adminGet<AdminSources>(request, `/api/admin/sources${api.toString() ? `?${api}` : ""}`);
}

export const meta: Route.MetaFunction = () => [{ title: `信源 · ${SITE.name} 后台` }];

/** 批量操作：选中若干信源，或对全部信源执行。 */
type BatchKind = AdminSourceBatchAction | "pause-all" | "resume-all";

const BATCH_LABEL: Record<BatchKind, string> = {
  pause: "暂停",
  resume: "启用",
  delete: "删除",
  "pause-all": "暂停",
  "resume-all": "启用",
};

const actionOf = (kind: BatchKind): AdminSourceBatchAction =>
  kind === "pause" || kind === "pause-all" ? "pause" : kind === "resume" || kind === "resume-all" ? "resume" : "delete";

export default function Sources({ loaderData }: Route.ComponentProps) {
  const { rows, totals, page } = loaderData;
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const { run, pending } = useAdminAction();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batch, setBatch] = useState<BatchKind | null>(null);

  const pageIds = rows.map((r) => r.id);
  const allPicked = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const somePicked = rows.some((r) => selected.has(r.id));

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPicked) for (const id of pageIds) next.delete(id);
      else for (const id of pageIds) next.add(id);
      return next;
    });
  }

  /** 列表行内直接暂停/恢复：不用进详情页，版本号取列表行自带的值。 */
  async function toggleSource(r: AdminSources["rows"][number]) {
    if (!r.updated_at) return;
    await run(
      "PATCH",
      `/api/admin/sources/${encodeURIComponent(r.id)}`,
      { patch: { enabled: !r.enabled }, version: new Date(r.updated_at).toISOString(), reason: r.enabled ? "列表页暂停采集" : "列表页恢复采集" },
      { label: `toggle:${r.id}`, success: r.enabled ? `已暂停「${r.name}」` : `已恢复「${r.name}」` },
    );
  }

  /** 列表行内立即采集：采集总开关打开时只入队，由后台进程执行。 */
  async function fetchSource(r: AdminSources["rows"][number]) {
    const res = await run<AdminSourceFetch>("POST", `/api/admin/sources/${encodeURIComponent(r.id)}/fetch`, undefined, { label: `fetch:${r.id}` });
    if (!res) return;
    const c = res.collected;
    if (!c) {
      toast("已加入采集队列，后台进程会很快开始抓取", "ok");
      return;
    }
    if (c.status === "failed") toast(`采集失败：${c.error ?? "未知错误"}`, "error");
    else if (c.status === "skipped") toast(`本次跳过：${c.error === "paused" ? "信源已暂停" : c.error === "missing" ? "信源不存在" : "这类信源不主动抓取"}`, "info");
    else toast(`采集完成：发现 ${c.found} 条，新增 ${c.created} 条${c.revised ? `，更新 ${c.revised} 条` : ""}`, "ok");
  }

  /** 执行批量命令；返回 false 让对话框保持打开（失败时原因已用 toast 提示）。 */
  async function runBatch(action: AdminSourceBatchAction, all: boolean, reason: string) {
    const res = await run<AdminSourceBatchResult>("POST", "/api/admin/sources/batch", { action, all, ids: all ? undefined : [...selected], reason }, { label: `batch:${action}` });
    if (!res) return false;
    setSelected(new Set());
    const verb = action === "pause" ? "暂停" : action === "resume" ? "启用" : "删除";
    const first = res.skipped[0];
    const skipped = res.skipped.length ? `，跳过 ${res.skipped.length} 个${first ? `（${first.name}：${first.reason}）` : ""}` : "";
    toast(`已${verb} ${res.changed} 个信源${skipped}`, res.changed ? "ok" : "info");
    return true;
  }

  const filtered = Boolean(sp.get("q") || sp.get("health") || sp.get("kind") || sp.get("mode"));
  const batchAll = batch?.endsWith("-all") ?? false;
  const batchAction = batch ? actionOf(batch) : null;
  const batchCount = batchAll
    ? batchAction === "resume"
      ? totals.paused
      : totals.enabled
    : selected.size;
  const batchDescription = batchAction === "delete"
    ? "只删除没有任何历史条目、也没有被专用抓取引用的信源；其余会被跳过并在提示里列出（建议改为暂停）。"
    : batchAction === "resume"
      ? `将恢复${batchAll ? "全部已暂停的" : "选中的"} ${batchCount} 个信源；恢复后会立即排队采集一次。`
      : `将暂停${batchAll ? "全部启用中的" : "选中的"} ${batchCount} 个信源；已有内容和历史保留。`;
  const batchTitle = `${BATCH_LABEL[batch ?? "pause"]}${batchAll ? "全部信源" : "选中的信源"}`;

  return (
    <AdminPage
      title="信源"
      actions={<ButtonLink to="/admin/sources/new" tone="primary">新建信源</ButtonLink>}
    >
      <Stats>
        <Stat label="全部" value={num(totals.total)} />
        <Stat label="启用" value={num(totals.enabled)} />
        <Stat label="暂停" value={num(totals.paused)} />
        <Stat label="失败" value={num(totals.failing)} tone={totals.failing ? "bad" : undefined} />
        <Stat label="不稳定" value={num(totals.degraded)} tone={totals.degraded ? "warn" : undefined} />
      </Stats>

      <div>
        <div className="adm-toolbar">
          <Form method="get" className="adm-toolbar-grow" preventScrollReset>
            {["kind", "health", "mode"].map((k) => sp.get(k) && <input key={k} type="hidden" name={k} value={sp.get(k)!} />)}
            <Input name="q" defaultValue={sp.get("q") ?? ""} placeholder="名称、ID 或地址，回车确认" aria-label="搜索信源" />
          </Form>
          <div className="adm-toolbar-side">
            <FilterChips
              param="health"
              options={[
                { value: "", label: "全部" },
                { value: "enabled", label: "启用" },
                { value: "paused", label: "暂停" },
                { value: "failing", label: "失败" },
                { value: "degraded", label: "不稳定" },
              ]}
            />
            <Select
              aria-label="类型"
              className="adm-select--auto"
              value={sp.get("kind") ?? ""}
              onChange={(e) => {
                const next = new URLSearchParams(sp);
                if (e.target.value) next.set("kind", e.target.value);
                else next.delete("kind");
                next.delete("page");
                navigate(`?${next}`, { preventScrollReset: true });
              }}
            >
              <option value="">全部类型</option>
              {Object.entries(KIND_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </div>
        </div>
        <div className="adm-toolbar">
          <div className="adm-toolbar-grow">
            <span className="adm-hint">{selected.size ? `已选 ${selected.size} 个信源` : "勾选左侧方框后可批量操作"}</span>
          </div>
          <div className="adm-toolbar-side">
            {selected.size > 0 && (
              <>
                <Button size="sm" tone="secondary" onClick={() => setBatch("pause")}>批量暂停</Button>
                <Button size="sm" tone="secondary" onClick={() => setBatch("resume")}>批量启用</Button>
                <Button size="sm" tone="danger" onClick={() => setBatch("delete")}>批量删除</Button>
              </>
            )}
            <Button size="sm" tone="danger" disabled={totals.enabled === 0} onClick={() => setBatch("pause-all")}>全部暂停</Button>
            <Button size="sm" tone="secondary" disabled={totals.paused === 0} onClick={() => setBatch("resume-all")}>全部启用</Button>
          </div>
        </div>
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty={filtered ? "没有符合条件的信源。" : "还没有信源。"}
          onRowClick={(r) => navigate(`/admin/sources/${encodeURIComponent(r.id)}`)}
          columns={[
            {
              key: "pick",
              label: (
                <Checkbox
                  aria-label="全选本页信源"
                  checked={allPicked}
                  indeterminate={somePicked && !allPicked}
                  onChange={togglePage}
                  onClick={(e) => e.stopPropagation()}
                />
              ),
              className: "adm-pick",
              render: (r) => (
                <span className="inline-flex" onClick={(e) => e.stopPropagation()}>
                  <Checkbox aria-label={`选择 ${r.name}`} checked={selected.has(r.id)} onChange={() => toggleOne(r.id)} />
                </span>
              ),
            },
            {
              key: "name",
              label: "信源",
              render: (r) => (
                <div className="min-w-[220px]">
                  <Link to={`/admin/sources/${encodeURIComponent(r.id)}`} className="adm-link" onClick={(e) => e.stopPropagation()}>
                    {r.name}
                  </Link>
                  <div className="adm-mono">{r.id}</div>
                  {r.health === "failing" && r.last_error && <div className="mt-1 line-clamp-1 text-[12.5px] text-hot">{r.last_error}</div>}
                </div>
              ),
            },
            { key: "kind", label: "类型", render: (r) => <Badge>{KIND_LABEL[r.kind] ?? r.kind}</Badge> },
            {
              key: "mode",
              label: "参与",
              render: (r) => (
                <div className="flex gap-1">
                  <Badge tone={r.participation_mode === "editorial" ? "info" : "muted"}>{MODE_LABEL[r.participation_mode] ?? r.participation_mode}</Badge>
                  <Badge>{TIER_LABEL[r.tier] ?? r.tier.replace("_", ".")}</Badge>
                </div>
              ),
            },
            {
              key: "health",
              label: "健康",
              render: (r) => (
                <span className="inline-flex items-center gap-1.5 adm-nowrap">
                  <Dot tone={r.enabled ? healthTone(r.health) : "muted"} />
                  {r.enabled ? HEALTH_LABEL[r.health] ?? r.health : "已暂停"}
                  {r.fail_count > 0 && <span className="adm-num text-[11px] text-ink-4">×{r.fail_count}</span>}
                </span>
              ),
            },
            { key: "ok", label: "上次成功", render: (r) => <Time at={r.last_ok_at} /> },
            { key: "interval", label: "频率", align: "right", render: (r) => `${r.interval_minutes} 分` },
            { key: "items", label: "7 天条目", align: "right", render: (r) => num(r.items_7d) },
            { key: "sel", label: "30 天精选", align: "right", render: (r) => num(r.selected_30d) },
            {
              key: "actions",
              label: "操作",
              align: "right",
              className: "adm-nowrap",
              render: (r) => (
                // 行本身可点进详情，按钮区域吞掉点击。
                <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                  <Button
                    size="sm"
                    tone="secondary"
                    busy={pending === `fetch:${r.id}`}
                    disabled={!r.enabled}
                    title={r.enabled ? "立即抓取这个信源" : "信源已暂停，恢复后才能采集"}
                    onClick={() => fetchSource(r)}
                  >
                    立即采集
                  </Button>
                  <Button
                    size="sm"
                    tone={r.enabled ? "danger" : "primary"}
                    busy={pending === `toggle:${r.id}`}
                    title={r.enabled ? "暂停后不再采集，已有内容和历史保留" : "恢复后会立即排队采集一次"}
                    onClick={() => toggleSource(r)}
                  >
                    {r.enabled ? "暂停" : "恢复"}
                  </Button>
                </div>
              ),
            },
          ]}
        />
        <Pager page={page} hasMore={rows.length === 100} />
      </div>

      <ReasonDialog
        open={batch !== null}
        title={batchTitle}
        description={batchDescription}
        danger={batchAction === "pause" || batchAction === "delete"}
        confirmLabel={BATCH_LABEL[batch ?? "pause"]}
        busy={batchAction !== null && pending === `batch:${batchAction}`}
        onClose={() => setBatch(null)}
        onSubmit={async (reason) => {
          if (!batch) return false;
          return runBatch(actionOf(batch), batch.endsWith("-all"), reason);
        }}
      />
    </AdminPage>
  );
}
