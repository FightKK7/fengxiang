import { SITE } from "@aihot/site";
import { Form, Link, useSearchParams } from "react-router";
import type { Route } from "./+types/audit";
import type { AdminAudit } from "@aihot/contracts/admin";
import { adminGet } from "../../lib/admin.server";
import { bj } from "../../features/admin/format";
import { AdminPage, Button, ButtonLink, Card, DataTable, Input, Json, Pager } from "../../features/admin/ui";


export async function loader({ request }: Route.LoaderArgs) {
  return adminGet<AdminAudit>(request, `/api/admin/audit${new URL(request.url).search}`);
}

export const meta: Route.MetaFunction = () => [{ title: `审计记录 · ${SITE.name} 后台` }];

function subjectLink(subject: string | null) {
  if (!subject) return null;
  const [kind, id] = [subject.slice(0, subject.indexOf(":")), subject.slice(subject.indexOf(":") + 1)];
  if (kind === "content") return <Link className="adm-link adm-nowrap" to={`/admin/content/${id}`}>{subject}</Link>;
  if (kind === "source") return <Link className="adm-link adm-nowrap" to={`/admin/sources/${encodeURIComponent(id)}`}>{subject}</Link>;
  return <span className="adm-mono adm-nowrap">{subject}</span>;
}

export default function Audit({ loaderData }: Route.ComponentProps) {
  const [sp] = useSearchParams();
  const filtering = !!sp.get("action") || !!sp.get("subject");
  return (
    <AdminPage title="审计记录">
      <Form method="get" className="adm-toolbar">
        <div className="adm-toolbar-grow">
          <Input name="action" defaultValue={sp.get("action") ?? ""} placeholder="操作前缀，例如 content. 或 source." aria-label="按操作筛选" />
        </div>
        <div className="adm-toolbar-grow">
          <Input name="subject" defaultValue={sp.get("subject") ?? ""} placeholder="对象，例如 source:openai-blog" aria-label="按对象筛选" />
        </div>
        <div className="adm-toolbar-side">
          <Button type="submit" size="sm" tone="primary">筛选</Button>
          {filtering && <ButtonLink to="/admin/audit" size="sm" tone="ghost">清空</ButtonLink>}
        </div>
      </Form>
      <Card title="操作记录" right={<span>{loaderData.rows.length} 条 · 第 {loaderData.page} 页</span>} pad={false} scrollable>
        <DataTable
          rows={loaderData.rows}
          rowKey={(r) => r.id}
          empty="没有记录"
          columns={[
            { key: "t", label: "时间", render: (r) => <span className="adm-num adm-nowrap text-[12.5px]">{bj(r.created_at, true)}</span> },
            { key: "a", label: "操作", render: (r) => <span className="adm-mono adm-nowrap" title={r.action}>{r.action}</span> },
            { key: "s", label: "对象", render: (r) => subjectLink(r.subject) },
            { key: "who", label: "操作人", render: (r) => <span className="adm-nowrap text-[12.5px] text-ink-3">{r.actor}</span> },
            { key: "r", label: "原因", render: (r) => (r.reason ? <span className="text-[12.5px] text-ink-3">{r.reason}</span> : <span className="adm-link-muted">—</span>) },
            { key: "d", label: "变化", render: (r) => (r.before || r.after ? <Json value={{ before: r.before, after: r.after }} label="前后" /> : null) },
          ]}
        />
      </Card>
      <Pager page={loaderData.page} hasMore={loaderData.rows.length === 100} />
    </AdminPage>
  );
}
