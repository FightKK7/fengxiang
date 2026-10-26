import { SITE } from "@aihot/site";
import { Fragment, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { CATEGORY_LABELS } from "@aihot/contracts/taxonomy";
import type { Route } from "./+types/selectbench-run";
import type { AdminSelectBenchCases, AdminSelectBenchDecision } from "@aihot/contracts/admin";
import { adminGet } from "../../lib/admin.server";
import { bj, num, pct } from "../../features/admin/format";
import { AdminPage, Badge, ButtonLink, Card, Empty, FilterChips, Select } from "../../features/admin/ui";

export async function loader({ request, params }: Route.LoaderArgs) {
  return adminGet<AdminSelectBenchCases>(request, `/api/admin/selectbench/${encodeURIComponent(params.runId)}${new URL(request.url).search}`);
}

export const meta: Route.MetaFunction = ({ loaderData }) => [{ title: `${loaderData?.run.label ?? "精选对照"} · ${SITE.name} 后台` }];

/** 金标：应入选 / 不选 / 两可。红色留给失败，这里只用墨色与灰。 */
const GOLD: Record<string, { label: string; tone: "info" | "muted" }> = {
  select: { label: "应入选", tone: "info" },
  reject: { label: "不选", tone: "muted" },
  either: { label: "两可", tone: "muted" },
};

function verdict(d: AdminSelectBenchDecision | undefined, gold: string) {
  if (!d) return <span className="adm-link-muted">—</span>;
  if (d.decision === null) {
    return (
      <Badge tone="bad" title={d.error ?? undefined}>
        失败
      </Badge>
    );
  }
  const right = gold === "either" || d.decision === gold;
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <Badge tone={right ? (d.decision === "select" ? "ok" : "muted") : "bad"}>{d.decision === "select" ? "入选" : "不选"}</Badge>
      <span className="adm-num text-[11px] text-ink-4">{d.score ?? "—"}</span>
    </span>
  );
}

export default function SelectBenchRun({ loaderData: d }: Route.ComponentProps) {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const [open, setOpen] = useState<string | null>(null);
  const model = sp.get("model") ?? d.run.models[0]!;
  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(sp);
    if (v) next.set(k, v);
    else next.delete(k);
    navigate(`?${next}`, { preventScrollReset: true });
  };

  return (
    <AdminPage
      title={d.run.label}
      meta={
        <>
          {bj(d.run.created_at, true)} · {d.run.split ?? "—"} · {num(d.run.sample_size)} 条 · 提示版本 {d.run.prompt_version ?? "未记录"}
        </>
      }
      actions={<ButtonLink to="/admin/selectbench" size="sm">全部运行</ButtonLink>}
    >
      <div className="flex flex-col gap-px bg-line sm:flex-row">
        {d.run.models.map((m) => {
          const s = d.run.summary[m] ?? {};
          const on = m === model;
          const fg = on ? "text-bg" : "text-ink-4";
          return (
            <button
              key={m}
              type="button"
              onClick={() => set("model", m)}
              aria-pressed={on}
              className={`min-w-0 p-3 text-left sm:flex-1 ${on ? "bg-ink" : "bg-bg"}`}
            >
              <div className={`text-[12.5px] font-medium leading-snug [overflow-wrap:anywhere] ${on ? "text-bg" : "text-ink"}`}>{m}</div>
              <div className={`mt-1 text-[11px] ${fg}`}>有效输出 F1</div>
              <div className={`adm-num text-[19px] font-semibold leading-tight ${on ? "text-bg" : "text-ink"}`}>{pct(s.f1)}</div>
              <div className={`adm-num mt-1.5 text-[11px] leading-relaxed ${fg}`}>
                准确 {pct(s.accuracy)} · 覆盖 {pct(s.coverage)} · 完整 {pct(s.completeAccuracy)}
              </div>
              <div className={`adm-num text-[11px] leading-relaxed ${fg}`}>
                精确 {pct(s.precision)} · 召回 {pct(s.recall)} · 金标入选 {pct(s.goldSelectRate)}
              </div>
              <div className={`adm-num text-[11px] leading-relaxed ${fg}`}>
                误选 {s.fp ?? "—"} · 漏选 {s.fn ?? "—"} ·{" "}
                {s.decisiveErrors !== undefined ? (
                  <>
                    决定失败 {s.decisiveErrors}
                    {s.eitherErrors ? ` · 两可失败 ${s.eitherErrors}` : ""}
                  </>
                ) : (
                  <>失败 {s.errors ?? 0}</>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div>
        <FilterChips
          param="outcome"
          options={[
            { value: "", label: "全部" },
            { value: "fp", label: "误选" },
            { value: "fn", label: "漏选" },
            { value: "tp", label: "选对" },
            { value: "tn", label: "正确不选" },
            { value: "either", label: "两可" },
            { value: "error", label: "失败" },
          ]}
        />
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Select
            className="adm-select--auto"
            aria-label="样本分层"
            value={sp.get("stratum") ?? ""}
            onChange={(e) => set("stratum", e.target.value || null)}
          >
            <option value="">全部分层</option>
            {d.strata.map((s) => (
              <option key={s.stratum ?? "none"} value={s.stratum ?? ""}>
                {s.stratum ?? "未分层"}（{s.n}）
              </option>
            ))}
          </Select>
          <label className="inline-flex items-center gap-2 text-[12.5px] text-ink-3">
            <input
              type="checkbox"
              className="size-4 accent-ink"
              checked={sp.get("disagree") === "1"}
              onChange={(e) => set("disagree", e.target.checked ? "1" : null)}
            />
            只看模型之间有分歧的
          </label>
          <span className="text-[11px] text-ink-4">
            {d.rows.length === 400 ? "仅显示前 400 条" : `${d.rows.length} 条`} · 筛选按 {model}
          </span>
        </div>
      </div>

      <Card pad={false}>
        {d.rows.length ? (
          <div className="overflow-x-auto">
            <table className="adm-table min-w-[760px]">
              <thead>
                <tr>
                  <th>样本</th>
                  <th>金标</th>
                  {d.run.models.map((m) => (
                    <th key={m}>{m}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.rows.map((r) => (
                  <Fragment key={r.case_id}>
                    <tr className="adm-row-link" onClick={() => setOpen(open === r.case_id ? null : r.case_id)}>
                      <td className="max-w-[420px]">
                        <div className="line-clamp-2 text-ink">{r.title}</div>
                        <div className="mt-0.5 text-[11px] text-ink-4">
                          {r.stratum ?? "—"} · {r.case_id}
                        </div>
                      </td>
                      <td>
                        <Badge tone={GOLD[r.gold]?.tone ?? "muted"}>{GOLD[r.gold]?.label ?? r.gold}</Badge>
                      </td>
                      {d.run.models.map((m) => (
                        <td key={m}>{verdict(r.by_model[m], r.gold)}</td>
                      ))}
                    </tr>
                    {open === r.case_id && (
                      <tr>
                        <td colSpan={2 + d.run.models.length}>
                          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            {d.run.models.map((m) => {
                              const x = r.by_model[m];
                              return (
                                <div key={m} className="border border-line p-3">
                                  <div className="mb-1 flex items-baseline justify-between gap-2 text-[11px] text-ink-4">
                                    <span className="text-[11px] font-medium text-ink">{m}</span>
                                    {x?.category && <span>{CATEGORY_LABELS[x.category as keyof typeof CATEGORY_LABELS] ?? x.category}</span>}
                                  </div>
                                  <div className="text-[12.5px] leading-relaxed text-ink-3">{x?.error ?? x?.reason ?? "（没有理由）"}</div>
                                  <div className="mt-1 text-[11px] text-ink-4">
                                    相关性 {x?.relevance ?? "—"}
                                    {x?.receiptId ? ` · 回执 #${x.receiptId}` : ""}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>没有符合条件的样本</Empty>
        )}
      </Card>
    </AdminPage>
  );
}
