import { SITE } from "@aihot/site";
import { Form, Link, useNavigate, useSearchParams } from "react-router";
import type { Route } from "./+types/content";
import type { AdminContentRow, AdminContentSearch } from "@aihot/contracts/admin";
import { adminGet } from "../../lib/admin.server";
import { VISIBILITY_LABEL } from "../../features/admin/labels";
import { AdminPage, Badge, Button, Card, DataTable, Empty, Input, Time } from "../../features/admin/ui";


export async function loader({ request }: Route.LoaderArgs) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!q) return { q, rows: [] as AdminContentRow[] };
  const { rows } = await adminGet<AdminContentSearch>(request, `/api/admin/content?q=${encodeURIComponent(q)}`);
  return { q, rows };
}

export const meta: Route.MetaFunction = () => [{ title: `条目 · ${SITE.name} 后台` }];

/** 一行状态标签：精选、可见性、处理状态；红色只留给下架。 */
function rowBadges(row: AdminContentRow) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {row.selected && <Badge tone="info">精选</Badge>}
      {row.visibility && (
        <Badge tone={row.visibility === "withdrawn" ? "bad" : row.visibility === "public" ? "muted" : "warn"}>
          {VISIBILITY_LABEL[row.visibility] ?? row.visibility}
        </Badge>
      )}
      {!row.visibility && <Badge tone="muted">{row.processing_state}</Badge>}
    </span>
  );
}

export default function Content({ loaderData }: Route.ComponentProps) {
  const { q, rows } = loaderData;
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  return (
    <AdminPage title="条目">
      <Form method="get" className="adm-toolbar">
        <div className="adm-toolbar-grow">
          <Input name="q" defaultValue={sp.get("q") ?? ""} placeholder="内容 ID、原文链接或标题关键词" aria-label="搜索条目" autoFocus />
        </div>
        <div className="adm-toolbar-side">
          <Button type="submit" tone="primary">查找</Button>
        </div>
      </Form>
      {q ? (
        <Card
          pad={false}
          title={`“${q}”的查找结果`}
          right={<span>{rows.length === 50 ? "只显示前 50 条，请再加关键词" : `${rows.length} 条`}</span>}
        >
          <DataTable
            rows={rows}
            rowKey={(row) => row.id}
            onRowClick={(row) => navigate(`/admin/content/${row.id}`)}
            empty="没有找到。原文链接会先规范化再比对；标题支持中英文片段。"
            columns={[
              {
                key: "title",
                label: "标题",
                render: (row) => (
                  <div className="min-w-[240px]">
                    <Link to={`/admin/content/${row.id}`} className="adm-link font-medium" onClick={(event) => event.stopPropagation()}>
                      {row.title}
                    </Link>
                    <div className="adm-mono mt-0.5">{row.id}</div>
                  </div>
                ),
              },
              { key: "source", label: "信源", render: (row) => <span className="adm-nowrap">{row.source}</span> },
              { key: "status", label: "状态", render: rowBadges },
              { key: "score", label: "分数", align: "right", render: (row) => row.score ?? "—" },
              { key: "discovered", label: "发现", render: (row) => <Time at={row.discovered_at} /> },
            ]}
          />
        </Card>
      ) : (
        <Empty>输入内容 ID、原文链接或标题关键词开始查找。</Empty>
      )}
    </AdminPage>
  );
}
