import { useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/models";
import type { AdminModels } from "@aihot/contracts/admin";
import { SITE } from "@aihot/site";
import { adminGet } from "../../lib/admin.server";
import { useAdminAction } from "../../features/admin/action";
import { bj, money, num } from "../../features/admin/format";
import {
  AdminPage,
  Badge,
  Button,
  ButtonLink,
  Card,
  DataTable,
  Empty,
  Field,
  FilterChips,
  ReasonDialog,
  Select,
  Time,
} from "../../features/admin/ui";
import { webModules } from "../../site-modules";

export async function loader({ request }: Route.LoaderArgs) {
  const days = new URL(request.url).searchParams.get("days") ?? "7";
  return adminGet<AdminModels>(request, `/api/admin/models?days=${encodeURIComponent(days)}`);
}

export const meta: Route.MetaFunction = () => [{ title: `模型 · ${SITE.name} 后台` }];

const SOURCE_LABEL = { admin: "后台切换", env: "环境变量", default: "代码默认" } as const;

/** 天数页签：空值就是 loader 的默认 7 天。 */
const DAY_OPTIONS = [
  { value: "1", label: "24 小时" },
  { value: "", label: "7 天" },
  { value: "30", label: "30 天" },
];

/** A cost the provider did not report and no price covers: a link to the prices when a module keeps them. */
function Unpriced() {
  const prices = webModules().find((m) => m.admin?.prices)?.admin?.prices;
  if (prices) return <Link to={prices} className="adm-link adm-nowrap">未定价</Link>;
  return (
    <span className="adm-link-muted adm-nowrap" title="服务商没有返回费用，按 token 数和你的模型单价自己估算">
      未定价
    </span>
  );
}

const secs = (ms: number | null) => (ms == null ? "—" : ms >= 10_000 ? `${Math.round(ms / 1000)} s` : `${(ms / 1000).toFixed(1)} s`);

/** 能力名后面那对括号是解释，不是标题。19px 标题只放名字，解释降为 12.5px 导语。 */
function splitLabel(label: string): { name: string; note: string } {
  const open = label.indexOf("（");
  const close = label.lastIndexOf("）");
  if (open > 0 && close > open) return { name: label.slice(0, open), note: label.slice(open + 1, close) };
  return { name: label, note: "" };
}

/** 备用模型现在是什么状态，加上主模型下一次复查的时间。 */
function fallbackState(f: NonNullable<AdminModels["capabilities"][number]["fallback"]>): string {
  const state = f.primaryPaused
    ? f.backupPaused
      ? "主备均暂停，等待恢复"
      : "正在接续"
    : f.backupPaused
      ? "暂不可用"
      : "就绪";
  return f.nextProbeAt ? `${state} · ${bj(f.nextProbeAt)} 复查主模型` : state;
}

export default function ModelsAdmin({ loaderData: m }: Route.ComponentProps) {
  const { run, pending } = useAdminAction();
  const [target, setTarget] = useState<AdminModels["capabilities"][number] | null>(null);
  const [choice, setChoice] = useState<string>("");
  const labelOf = (key: string) => m.capabilities.find((c) => `capability:${c.key}` === key)?.label ?? key;

  return (
    <AdminPage
      title="模型"
    >
      <div className="adm-toolbar">
        <div className="adm-toolbar-grow">
          <FilterChips param="days" options={DAY_OPTIONS} />
        </div>
        <span className="adm-toolbar-side max-sm:hidden text-[11px] text-ink-4">只统计所选窗口内的调用</span>
      </div>

      {m.capabilities.map((c) => {
        const { name } = splitLabel(c.label);
        const total = c.usage.reduce((a, u) => a + u.calls, 0);
        return (
          <Card key={c.key} pad={false}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h3 className="text-[19px] leading-snug tracking-normal text-ink">{name}</h3>
                  <span className="adm-mono">{c.current.model}</span>
                  <Badge tone={c.current.source === "admin" ? "info" : "muted"}>{SOURCE_LABEL[c.current.source]}</Badge>
                  {c.fallback && (
                    <span className="text-[11px] text-ink-4">
                      备用 {c.fallback.model} · {fallbackState(c.fallback)}
                    </span>
                  )}
                </div>

              </div>
              <Button
                size="sm"
                onClick={() => {
                  setTarget(c);
                  setChoice(c.current.model);
                }}
              >
                切换
              </Button>
            </div>

            <div className="mt-3">
              {c.usage.length ? (
                <DataTable
                  dense
                  rows={c.usage}
                  rowKey={(u) => `${u.purpose}|${u.model}|${u.promptVersion}`}
                  columns={[
                    { key: "m", label: "模型", className: "adm-nowrap", render: (u) => <span className="adm-mono">{u.model}</span> },
                    {
                      key: "v",
                      label: "提示版本",
                      className: "hidden sm:table-cell",
                      render: (u) => (
                        <span className="adm-mono block max-w-[180px] truncate" title={u.promptVersion ?? undefined}>
                          {u.promptVersion ?? "—"}
                        </span>
                      ),
                    },
                    {
                      key: "p",
                      label: "用途",
                      className: "hidden sm:table-cell",
                      render: (u) => (
                        <span className="adm-mono block max-w-[220px] truncate" title={u.purpose}>
                          {u.purpose}
                        </span>
                      ),
                    },
                    { key: "c", label: "调用", align: "right", render: (u) => num(u.calls) },
                    {
                      key: "ok",
                      label: "成功率",
                      align: "right",
                      render: (u) => {
                        const rate = u.calls ? u.ok / u.calls : 0;
                        return (
                          <span className={rate < 0.95 ? "text-hot" : ""} title={`失败 ${u.failed} · 结果未知 ${u.unknown}`}>
                            {`${Math.round(rate * 1000) / 10}%`}
                          </span>
                        );
                      },
                    },
                    {
                      key: "l",
                      label: "耗时 p50 / p95",
                      align: "right",
                      render: (u) => <span className="adm-nowrap">{`${secs(u.p50)} / ${secs(u.p95)}`}</span>,
                    },
                    {
                      key: "t",
                      label: "输入 / 输出 token",
                      align: "right",
                      render: (u) => <span className="adm-nowrap">{`${num(u.tokensIn)} / ${num(u.tokensOut)}`}</span>,
                    },
                    {
                      key: "$",
                      label: "费用",
                      align: "right",
                      render: (u) =>
                        u.actualCost !== null ? (
                          <span className="adm-nowrap">{money(u.actualCost, u.currency ?? "USD")}</span>
                        ) : u.estimate ? (
                          <span className="adm-nowrap" title="按用量 × 单价推算">
                            ≈ {money(u.estimate.amount, u.estimate.currency)}
                          </span>
                        ) : (
                          <Unpriced />
                        ),
                    },
                  ]}
                />
              ) : (
                <Empty>{`${m.days} 天内没有调用${total === 0 && c.vision ? "（只在有图片时使用）" : ""}`}</Empty>
              )}
            </div>
          </Card>
        );
      })}

      <Card title="切换模型记录" pad={false}>
        {m.history.length ? (
          <DataTable
            dense
            rows={m.history}
            rowKey={(h) => `${h.at}|${h.subject}`}
            columns={[
              { key: "at", label: "时间", render: (h) => <Time at={h.at} title={bj(h.at, true)} /> },
              { key: "c", label: "能力", render: (h) => splitLabel(labelOf(h.subject)).name },
              {
                key: "m",
                label: "变化",
                render: (h) => (
                  <span className="adm-mono">
                    {h.before?.model ?? "—"} → {h.after?.model ?? "—"}
                  </span>
                ),
              },
              { key: "r", label: "原因", render: (h) => h.reason ?? <span className="adm-link-muted">—</span> },
              { key: "a", label: "操作人", render: (h) => h.actor },
            ]}
          />
        ) : (
          <Empty>还没有在后台切换过模型</Empty>
        )}
      </Card>

      <Card
        title="同批样本对比（精选对照）"
        right={<ButtonLink to="/admin/selectbench" size="sm">全部运行</ButtonLink>}
        pad={false}
      >
        {m.benches.length ? (
          <DataTable
            dense
            rows={m.benches}
            rowKey={(b) => b.id}
            columns={[
              {
                key: "l",
                label: "运行",
                render: (b) => (
                  <Link to={`/admin/selectbench/${b.id}`} className="adm-link">
                    {b.label}
                  </Link>
                ),
              },
              { key: "m", label: "模型", render: (b) => <span className="adm-mono">{b.models.join("、")}</span> },
              { key: "n", label: "样本", align: "right", render: (b) => num(b.sample_size) },
              { key: "at", label: "时间", render: (b) => <span className="adm-nowrap">{bj(b.created_at)}</span> },
            ]}
          />
        ) : (
          <Empty>还没有导入对比运行。同一批人工金标样本可以逐条比较各模型的入选决定。</Empty>
        )}
      </Card>

      <ReasonDialog
        open={!!target}
        title={`切换模型：${target ? splitLabel(target.label).name : ""}`}
        description="只影响之后的新任务。选「恢复默认」会回到环境变量或代码默认。"
        confirmLabel="切换"
        busy={pending === "switch"}
        onClose={() => setTarget(null)}
        onSubmit={async (reason) =>
          (await run(
            "POST",
            `/api/admin/models/${target!.key}`,
            { model: choice === "__default" ? null : choice, reason },
            { label: "switch", success: "已切换，下一次调用生效" },
          )) !== null
        }
      >
        <Field label="模型">
          <Select value={choice} onChange={(e) => setChoice(e.target.value)}>
            {m.choices
              .filter((x) => !target?.vision || x.vision)
              .map((x) => (
                <option key={x.key} value={x.key}>
                  {x.key}（{x.service}）
                </option>
              ))}
            <option value="__default">恢复默认（{target?.env} 或 {target?.defaultModel}）</option>
          </Select>
        </Field>
      </ReasonDialog>
    </AdminPage>
  );
}
