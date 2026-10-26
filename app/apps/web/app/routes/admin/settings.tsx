import { ADMIN, SITE } from "@aihot/site";
import { useRef, useState } from "react";
import type { Route } from "./+types/settings";
import type { AdminSettings } from "@aihot/contracts/admin";
import { adminGet } from "../../lib/admin.server";
import { useAdminAction } from "../../features/admin/action";
import { bj, num } from "../../features/admin/format";
import { AdminPage, Badge, Button, Card, DataTable, Input, ReasonDialog } from "../../features/admin/ui";
import { toast } from "../../features/admin/toast";


export async function loader({ request }: Route.LoaderArgs) {
  return adminGet<AdminSettings>(request, "/api/admin/settings");
}

export const meta: Route.MetaFunction = () => [{ title: `设置 · ${SITE.name} 后台` }];

function QrSlot({ slot, label, src }: { slot: "wechatQr" | "feishuQr"; label: string; src: string | null }) {
  const { run, pending } = useAdminAction();
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-start gap-4">
      {src ? (
        <img src={src} alt={label} className="size-28 shrink-0 border border-line object-contain" />
      ) : (
        <div className="flex size-28 shrink-0 items-center justify-center border border-line text-[12.5px] text-ink-4">未设置</div>
      )}
      <div className="min-w-0">
        <div className="text-[14px] text-ink">{label}</div>
        <div className="adm-mono mt-0.5 break-all">{src ?? "还没有上传图片"}</div>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            if (file.size > 2 * 1024 * 1024) return toast("图片最大 2MB", "error");
            const image = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });
            await run("POST", "/api/admin/settings/contact-qr", { slot, image }, { label: `qr-${slot}`, success: `${label}已更换，关于页 5 分钟内更新` });
          }}
        />
        <Button className="mt-2" size="sm" busy={pending === `qr-${slot}`} onClick={() => input.current?.click()}>更换图片</Button>
      </div>
    </div>
  );
}

const BUDGET_LABEL = { perMinute: "每分钟", perHour: "每小时", perDay: "每天" } as const;

function BudgetRow({ b }: { b: AdminSettings["budgets"][number] }) {
  const { run, pending } = useAdminAction();
  const [v, setV] = useState({ perMinute: b.per_minute, perHour: b.per_hour, perDay: b.per_day });
  const [open, setOpen] = useState(false);
  const changed = v.perMinute !== b.per_minute || v.perHour !== b.per_hour || v.perDay !== b.per_day;
  return (
    <tr>
      <td><span className="adm-mono adm-nowrap" title={b.service}>{b.service}</span></td>
      {(["perMinute", "perHour", "perDay"] as const).map((k) => (
        <td key={k}>
          <Input
            type="number"
            min={0}
            aria-label={`${b.service} ${BUDGET_LABEL[k]}上限`}
            className="!w-24 text-right"
            value={v[k]}
            onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })}
          />
        </td>
      ))}
      <td className="text-right">
        <span className="adm-num text-ink-3">{num(b.used_hour)} / {num(b.used_day)}</span>
      </td>
      <td className="text-right">
        <Button size="sm" tone="primary" disabled={!changed} onClick={() => setOpen(true)}>保存</Button>
        <ReasonDialog
          open={open}
          title={`调整 ${b.service} 的请求上限`}
          description={`上限是付费请求的熔断：超过后请求暂停并按窗口重试。填 0 表示立即停用这个服务。${ADMIN.budgetNote ?? ""}`}
          confirmLabel="保存"
          busy={pending === "budget"}
          onClose={() => setOpen(false)}
          onSubmit={async (reason) => (await run("PUT", `/api/admin/budgets/${encodeURIComponent(b.service)}`, { ...v, reason }, { label: "budget", success: "上限已更新" })) !== null}
        />
      </td>
    </tr>
  );
}

function TargetToggle({ t }: { t: AdminSettings["targets"][number] }) {
  const { run, pending } = useAdminAction();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" tone={t.enabled ? "danger" : "primary"} onClick={() => setOpen(true)}>{t.enabled ? "停用" : "启用"}</Button>
      <ReasonDialog
        open={open}
        title={`${t.enabled ? "停用" : "启用"}：${t.note ?? t.key}`}
        description={t.enabled ? "停用后新的推送不再发往这个群。" : "启用时间会被记录：启用之前的内容不会补推。开发与彩排环境即使启用也不会真的发出。"}
        danger={t.enabled}
        confirmLabel={t.enabled ? "停用" : "启用"}
        busy={pending === "target"}
        onClose={() => setOpen(false)}
        onSubmit={async (reason) => (await run("POST", `/api/admin/notify-targets/${encodeURIComponent(t.key)}`, { enabled: !t.enabled, reason }, { label: "target", success: "已更新" })) !== null}
      />
    </>
  );
}

export default function SettingsAdmin({ loaderData: s }: Route.ComponentProps) {
  return (
    <AdminPage title="设置">
      <div className="grid gap-x-10 gap-y-7 lg:grid-cols-2">
        <Card title="关于页二维码">
          <div className="space-y-5">
            <QrSlot slot="wechatQr" label="微信公众号二维码" src={s.contact.wechatQr} />
            <QrSlot slot="feishuQr" label="飞书群二维码" src={s.contact.feishuQr} />
          </div>
        </Card>
        <Card title="通知目的地" right={<span>{s.targets.length} 个</span>} pad={false}>
          <DataTable
            rows={s.targets}
            rowKey={(t) => t.key}
            columns={[
              { key: "k", label: "目的地", render: (t) => <div className="min-w-0"><div className="text-[14px] text-ink">{t.note ?? t.key}</div><div className="adm-mono">{t.key}{t.config_ref ? ` · ${t.config_ref}` : ""}</div></div> },
              { key: "e", label: "状态", render: (t) => <div className="flex flex-col items-start gap-1"><Badge tone={t.enabled ? "ok" : "muted"}>{t.enabled ? "已启用" : "已停用"}</Badge><span className="adm-nowrap text-[11px] text-ink-4">{t.enabled ? `启用于 ${bj(t.enabled_at)}` : t.last_sent_at ? `上次投递 ${bj(t.last_sent_at)}` : "还没有投递"}</span></div> },
              { key: "d", label: "7 天投递", align: "right", render: (t) => num(t.deliveries_7d) },
              { key: "a", label: "", align: "right", render: (t) => <TargetToggle t={t} /> },
            ]}
          />
        </Card>
      </div>
      <Card title="付费请求上限" pad={false}>
        <div className="adm-table-wrap">
          <table className="adm-table min-w-[680px]">
            <thead>
              <tr>
                <th>服务</th>
                <th className="text-right">每分钟</th>
                <th className="text-right">每小时</th>
                <th className="text-right">每天</th>
                <th className="text-right">已用（时 / 24h）</th>
                <th />
              </tr>
            </thead>
            <tbody>{s.budgets.map((b) => <BudgetRow key={`${b.service}-${b.updated_at}`} b={b} />)}</tbody>
          </table>
        </div>
      </Card>
    </AdminPage>
  );
}
