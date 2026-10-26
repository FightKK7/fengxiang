import { SITE } from "@aihot/site";
import { useRef } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/selectbench";
import type { AdminSelectBenchRuns } from "@aihot/contracts/admin";
import { adminGet } from "../../lib/admin.server";
import { useAdminAction } from "../../features/admin/action";
import { bj, num, pct } from "../../features/admin/format";
import { AdminPage, Badge, Button, Card, DataTable, Empty } from "../../features/admin/ui";
import { toast } from "../../features/admin/toast";

export async function loader({ request }: Route.LoaderArgs) {
  return adminGet<AdminSelectBenchRuns>(request, "/api/admin/selectbench");
}

export const meta: Route.MetaFunction = () => [{ title: `精选对照 · ${SITE.name} 后台` }];

export default function SelectBench({ loaderData }: Route.ComponentProps) {
  const { run, pending } = useAdminAction();
  const file = useRef<HTMLInputElement>(null);
  return (
    <AdminPage
      title="精选对照"
      actions={
        <>
          <input
            ref={file}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                const report = JSON.parse(await f.text());
                await run("POST", "/api/admin/selectbench/import", { label: f.name.replace(/\.json$/, ""), report }, { label: "import", success: "已导入" });
              } catch {
                toast("文件不是合法的报告 JSON", "error");
              }
            }}
          />
          <Button busy={pending === "import"} onClick={() => file.current?.click()}>导入报告</Button>
        </>
      }
    >
      {loaderData.runs.length ? (
        loaderData.runs.map((r) => {
          const best = [...r.models].sort((a, b) => (r.summary[b]?.f1 ?? 0) - (r.summary[a]?.f1 ?? 0))[0];
          return (
            <Card
              key={r.id}
              title={
                <Link to={`/admin/selectbench/${r.id}`} className="adm-link">
                  {r.label}
                </Link>
              }
              right={
                <span>
                  {bj(r.created_at, true)} · {r.split ?? "—"} · {num(r.sample_size)} 条 · 提示版本 {r.prompt_version ?? "未记录"}
                </span>
              }
              pad={false}
            >
              <DataTable
                rows={r.models}
                rowKey={(m) => m}
                columns={[
                  {
                    key: "model",
                    label: "模型",
                    render: (m) => (
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="adm-mono">{m}</span>
                        {m === best && r.models.length > 1 && <Badge tone="info">有效输出 F1 最高</Badge>}
                      </span>
                    ),
                  },
                  { key: "accuracy", label: "有效输出准确率", align: "right", render: (m) => pct(r.summary[m]?.accuracy) },
                  { key: "coverage", label: "覆盖率", align: "right", render: (m) => pct(r.summary[m]?.coverage) },
                  {
                    key: "completeAccuracy",
                    label: "完整准确率",
                    align: "right",
                    render: (m) => <span className="font-semibold text-ink">{pct(r.summary[m]?.completeAccuracy)}</span>,
                  },
                  { key: "precision", label: "精确率", align: "right", render: (m) => pct(r.summary[m]?.precision) },
                  { key: "recall", label: "召回率", align: "right", render: (m) => pct(r.summary[m]?.recall) },
                  {
                    key: "f1",
                    label: "F1",
                    align: "right",
                    render: (m) => <span className="font-semibold text-ink">{pct(r.summary[m]?.f1)}</span>,
                  },
                  { key: "selectedRate", label: "入选比例", align: "right", render: (m) => pct(r.summary[m]?.selectedRate) },
                  { key: "goldSelectRate", label: "金标入选", align: "right", render: (m) => pct(r.summary[m]?.goldSelectRate) },
                  {
                    key: "errors",
                    label: "失败",
                    align: "right",
                    render: (m) => {
                      const errors = r.summary[m]?.errors;
                      return errors ? <span className="text-hot">{num(errors)}</span> : "0";
                    },
                  },
                  {
                    key: "latency",
                    label: "平均耗时",
                    align: "right",
                    render: (m) => {
                      const ms = r.summary[m]?.avgLatencyMs;
                      return ms ? `${(ms / 1000).toFixed(1)} s` : "—";
                    },
                  },
                  {
                    key: "tokens",
                    label: "输入 / 输出 token",
                    align: "right",
                    render: (m) => (
                      <span className="adm-nowrap">
                        {num(r.summary[m]?.tokensIn)} / {num(r.summary[m]?.tokensOut)}
                      </span>
                    ),
                  },
                ]}
              />
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-4">
                <span>{r.cases ? `${num(r.cases)} 条逐条结果` : "只有汇总，没有逐条结果"}</span>
                {r.cases > 0 && (
                  <Link to={`/admin/selectbench/${r.id}`} className="adm-link">
                    逐条浏览
                  </Link>
                )}
              </div>
            </Card>
          );
        })
      ) : (
        <Card title="对比运行">
          <Empty>还没有对比运行。上传报告，或等评估脚本导入。</Empty>
        </Card>
      )}
    </AdminPage>
  );
}
