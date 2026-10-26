import { SITE } from "@aihot/site";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { CATEGORY_KEYS, CATEGORY_LABELS } from "@aihot/contracts/taxonomy";
import type { Route } from "./+types/content-item";
import type { AdminContentChain, AdminPresentationRefresh, AdminRerunJob } from "@aihot/contracts/admin";
import { adminGet } from "../../lib/admin.server";
import { useAdminAction } from "../../features/admin/action";
import { toast } from "../../features/admin/toast";
import { bj, money } from "../../features/admin/format";
import { KIND_LABEL, MODE_LABEL, TIER_LABEL, VISIBILITY_LABEL } from "../../features/admin/labels";
import {
  AdminPage,
  Badge,
  Button,
  Card,
  DataTable,
  Empty,
  Field,
  Input,
  Json,
  KV,
  ReasonDialog,
  Select,
  Textarea,
  Time,
} from "../../features/admin/ui";

export async function loader({ request, params }: Route.LoaderArgs) {
  return adminGet<AdminContentChain>(request, `/api/admin/content/${encodeURIComponent(params.id)}`);
}

export const meta: Route.MetaFunction = ({ loaderData }) => [{ title: `${loaderData?.publication?.title ?? loaderData?.article.title ?? "条目"} · ${SITE.name} 后台` }];

// 库里的英文状态值只在这一层翻成人话；没有列出的原样显示，不猜。
const STATE_LABEL: Record<string, string> = {
  new: "待处理",
  analyzed: "已判断",
  blocked: "未通过",
  skipped: "已跳过",
  failed: "失败",
};
const BODY_LABEL: Record<string, string> = { ok: "已抽取", pending: "待抽取", unconfirmed: "待确认", none: "无正文", failed: "抽取失败" };
const RELEVANCE_LABEL: Record<string, string> = { pass: "通过", block: "未通过" };
const ORIGIN_LABEL: Record<string, string> = { model: "模型输出" };
const LEDGER_LABEL: Record<string, string> = { upsert: "入选", remove: "移出" };
const RECEIPT_LABEL: Record<string, string> = { pending: "处理中", received: "已返回", completed: "已完成", unknown: "结果未知", failed: "失败" };
const DELIVERY_LABEL: Record<string, string> = { sent: "已送达", sending: "发送中", pending: "待发送", failed: "失败", unknown: "送达未知", skipped: "已跳过" };
const VERDICT_LABEL: Record<string, string> = {
  "same-fact": "同一事实",
  "same-url": "同一链接",
  "new-fact-in-story": "并入已有事件",
  "new-story": "新事件",
  roundup: "汇总归组",
  standalone: "独立",
  manual: "人工归组",
  kept: "保持不变",
  skipped: "跳过",
  historical: "历史内容",
  signal: "氛围匹配",
  "signal-native": "同源氛围",
  "signal-unmatched": "氛围未匹配",
};
const ROLE_LABEL: Record<string, string> = { primary: "主事实", report: "报道", mention: "提及" };
const VIA_LABEL: Record<string, string> = { fetch: "抓取", ingest: "采集", import: "导入" };
const LANGUAGE_LABEL: Record<string, string> = { zh: "中文", en: "英文", ja: "日文", ko: "韩文", ru: "俄文" };
const ACTION_LABEL: Record<string, string> = {
  "content.correct-publication-date": "校正发布时间",
  "content.visibility": "改公开范围",
  "content.seo": "改搜索收录",
  "content.override": "人工修正",
  "content.detach": "移出事件",
  "content.rerun.extract": "重新抽取正文",
  "content.rerun.analyze": "重新评估",
  "content.rerun.group": "重新归组",
  "content.rerun.presentation": "刷新正文展示",
  "story.merge": "合并事件",
};

/** 账号字符串（admin:1 / dev:名称）换成界面上的说法。 */
function actorName(actor: string): string {
  if (actor.startsWith("admin:")) return "管理员";
  if (actor.startsWith("dev:")) return "开发模式";
  return actor;
}

function categoryLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  return CATEGORY_LABELS[key as keyof typeof CATEGORY_LABELS] ?? key;
}

/**
 * 处理链路的一步：左边是步骤名、关键值和时间，右边是细节。
 * 两步之间用 2px 黑线切块，左右之间只用 1px 细线；不做色块、圆点和卡片盒子。
 */
function Step({
  name,
  value,
  meta,
  tone,
  muted,
  children,
}: {
  name: string;
  value: ReactNode;
  meta?: ReactNode;
  tone?: "bad" | "warn";
  /** 空步骤：值降成 14px 元信息，不拿 19px 大字撑空。 */
  muted?: boolean;
  children: ReactNode;
}) {
  const toneClass = tone === "bad" ? " adm-tone-bad" : tone === "warn" ? " adm-tone-warn" : "";
  return (
    <Card>
      <div className="grid gap-3 sm:grid-cols-[132px_minmax(0,1fr)] sm:gap-7">
        <div className="min-w-0">
          <div className="adm-label">{name}</div>
          {muted ? (
            <div className={`adm-num text-[14px] leading-[1.6] text-ink-4${toneClass}`}>{value}</div>
          ) : (
            <div className={`adm-num text-[19px] font-semibold leading-[1.45] text-ink${toneClass}`}>{value}</div>
          )}
          {meta && <div className="mt-1 text-[11px] leading-[1.7] text-ink-4">{meta}</div>}
        </div>
        <div className="min-w-0 border-t border-line pt-3 sm:border-l sm:border-t-0 sm:pl-7 sm:pt-0">{children}</div>
      </div>
    </Card>
  );
}

type Dialog = null | "visibility" | "seo" | "override" | "analyze" | "extract" | "presentation" | "group" | "detach" | "merge";

export default function ContentItem({ loaderData }: Route.ComponentProps) {
  const c = loaderData;
  const a = c.article;
  const p = c.publication;
  const { run, pending } = useAdminAction();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [presentation, setPresentation] = useState<AdminPresentationRefresh | null>(null);
  const [visibility, setVisibility] = useState<string>(p?.visibility ?? "public");
  const [fields, setFields] = useState({ title: "", summary: "", reason: "", category: "", tags: "", scoreMode: "", score: "", selected: "", silent: "" });
  const [mergeInto, setMergeInto] = useState("");
  const version = c.override?.version ?? 0;
  const base = `/api/admin/content/${encodeURIComponent(a.id)}`;
  const story = c.membership[0];
  const title = p?.title ?? a.title;
  const undelivered = c.deliveries.filter((d) => d.status === "unknown" || d.status === "failed").length;

  const openOverride = () => {
    const f = (c.override?.fields ?? {}) as Record<string, unknown>;
    setFields({
      title: String(f.title ?? ""),
      summary: String(f.summary ?? ""),
      reason: String(f.reason ?? ""),
      category: String(f.category ?? ""),
      tags: Array.isArray(f.tags) ? (f.tags as string[]).join(", ") : "",
      scoreMode: f.score === null ? "none" : typeof f.score === "number" ? "value" : "",
      score: typeof f.score === "number" ? String(f.score) : "",
      selected: f.selected === undefined ? "" : String(f.selected),
      silent: f.silent === undefined ? "" : String(f.silent),
    });
    setDialog("override");
  };

  return (
    <AdminPage
      title={<span className="line-clamp-2">{title}</span>}
      meta={
        <>
          <span className="adm-mono">{a.id}</span>
          <span aria-hidden="true">·</span>
          <Link className="adm-link" to={`/admin/sources/${encodeURIComponent(a.source_id)}`}>
            {a.source_name}
          </Link>
          <span aria-hidden="true">·</span>
          <a className="adm-link max-w-[420px] truncate" href={a.url} target="_blank" rel="noreferrer">
            {a.url}
          </a>
          {p && p.visibility !== "withdrawn" && (
            <>
              <span aria-hidden="true">·</span>
              <a className="adm-link" href={`/items/${a.id}`} target="_blank" rel="noreferrer">
                公开页
              </a>
            </>
          )}
        </>
      }
      actions={
        <>
          <Button onClick={() => setDialog("visibility")}>公开范围</Button>
          {p && <Button onClick={() => setDialog("seo")}>{p.indexable ? "取消收录" : "标记收录"}</Button>}
          <Button
            tone="ghost"
            onClick={() => {
              setPresentation(null);
              setDialog("presentation");
            }}
          >
            刷新正文展示
          </Button>
          <Button onClick={() => setDialog("analyze")}>重新评估</Button>
          <Button tone="primary" onClick={openOverride}>
            人工修正
          </Button>
        </>
      }
    >
      {a.processing_error && (
        <Card title="处理失败">
          <p className="adm-pre-wrap text-[14px] adm-tone-bad">{a.processing_error}</p>
        </Card>
      )}

      <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_320px] xl:gap-10">
        <div className="space-y-7">
          <Step
            name="信源"
            value={MODE_LABEL[a.participation_mode] ?? a.participation_mode}
            meta={`${KIND_LABEL[a.source_kind] ?? a.source_kind} · ${TIER_LABEL[a.tier] ?? a.tier}`}
          >
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[14px] text-ink-3">
              <Link className="adm-link" to={`/admin/sources/${encodeURIComponent(a.source_id)}`}>
                {a.source_name}
              </Link>
              <span aria-hidden="true" className="text-ink-4">
                ·
              </span>
              <span>站内全文 {a.site_fulltext ? "允许" : "不允许"}</span>
              <span aria-hidden="true" className="text-ink-4">
                ·
              </span>
              <span>对外全文 {a.syndicate_fulltext ? "允许" : "不允许"}</span>
            </div>
          </Step>

          <Step
            name="发现"
            value={c.discoveries.length ? `${c.discoveries.length} 次` : "—"}
            muted={!c.discoveries.length}
            meta={c.discoveries.length ? <>最近 <Time at={c.discoveries.at(-1)!.discovered_at} /></> : undefined}
          >
            <DataTable
              rows={c.discoveries}
              rowKey={(d) => `${d.source_id}-${d.discovered_at}`}
              empty="没有发现记录"
              columns={[
                { key: "at", label: "时间", render: (d) => <Time at={d.discovered_at} /> },
                { key: "via", label: "方式", render: (d) => <span className="adm-mono">{VIA_LABEL[d.via] ?? d.via}</span> },
                {
                  key: "source",
                  label: "发现于",
                  render: (d) =>
                    d.source_id === a.source_id ? (
                      <span className="text-ink-4">本条信源</span>
                    ) : (
                      <span className="adm-mono">{d.source_id}</span>
                    ),
                },
              ]}
            />
            <p className="mt-3 text-[11px] leading-[1.7] text-ink-4">
              原文时间 {a.published_at ? <Time at={a.published_at} /> : "未知"}
              {a.published_at_claim && !a.published_at ? `（原文声称 ${a.published_at_claim}，未采信）` : ""}
              <span aria-hidden="true" className="mx-1.5">
                ·
              </span>
              时间轴 <Time at={a.timeline_at} />
            </p>
          </Step>

          <Step
            name="正文"
            value={`第 ${a.revision} 版`}
            meta={`${BODY_LABEL[a.body_status] ?? a.body_status} · ${a.body_chars ?? 0} 字符`}
          >
            <DataTable
              rows={c.revisions}
              rowKey={(r) => r.revision}
              empty="只有初始版本"
              dense
              columns={[
                { key: "version", label: "版本", render: (r) => <span className="adm-num">v{r.revision}</span> },
                { key: "title", label: "标题", render: (r) => <span className="line-clamp-1">{r.title}</span> },
                { key: "at", label: "时间", render: (r) => <Time at={r.created_at} /> },
              ]}
            />
            <div className="mt-3">
              <Button size="sm" onClick={() => setDialog("extract")}>
                重新抽取正文
              </Button>
            </div>
          </Step>

          <Step
            name="模型判断"
            value={c.analyses.length ? `${c.analyses.length} 次` : "—"}
            muted={!c.analyses.length}
            meta={c.analyses.length ? <>最近 <Time at={c.analyses[0]!.created_at} /></> : undefined}
          >
            {c.analyses.length ? (
              <div>
                {c.analyses.map((an, i) => (
                  <div key={an.id} className={i ? "mt-4 border-t border-line pt-4" : ""}>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Badge tone={an.relevance === "pass" ? "ok" : "bad"}>
                        {RELEVANCE_LABEL[an.relevance ?? ""] ?? an.relevance ?? "未判断"}
                      </Badge>
                      {an.selected && <Badge tone="accent">入选</Badge>}
                      <Badge>分数 {an.score ?? "—"}</Badge>
                      {an.category && <Badge>{categoryLabel(an.category)}</Badge>}
                      <span className="text-[11px] leading-[1.7] text-ink-4">
                        {an.model ?? "未记录模型"} · 输入 v{an.input_revision} · {ORIGIN_LABEL[an.origin] ?? an.origin} ·{" "}
                        <Time at={an.created_at} />
                      </span>
                    </div>
                    {an.title_zh && <div className="mt-2 text-[16px] leading-[1.6] text-ink">{an.title_zh}</div>}
                    {an.reason_zh && <p className="mt-1 text-[12.5px] leading-[1.85] text-ink-3">{an.reason_zh}</p>}
                    {an.receipts.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] leading-[1.7] text-ink-4">
                        {an.receipts.map((r) => (
                          <span key={r.id} className="adm-num">
                            回执 #{r.id} · {RECEIPT_LABEL[r.status] ?? r.status} · {r.model ?? r.service}
                            {r.cost !== null ? ` · ${money(r.cost, r.currency ?? "USD")}` : ""}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <Empty>{a.participation_mode === "editorial" ? "还没有判断（等待队列或失败）" : "氛围信源不做编辑判断"}</Empty>
            )}
          </Step>

          <Step
            name="公开"
            value={p ? VISIBILITY_LABEL[p.visibility] ?? p.visibility : "—"}
            tone={p?.visibility === "withdrawn" ? "bad" : undefined}
            muted={!p}
            meta={p ? <>更新于 <Time at={p.updated_at} /></> : undefined}
          >
            {p ? (
              <KV
                items={[
                  [
                    "范围",
                    <Badge tone={p.visibility === "public" ? "ok" : p.visibility === "withdrawn" ? "bad" : "warn"}>
                      {VISIBILITY_LABEL[p.visibility] ?? p.visibility}
                    </Badge>,
                  ],
                  [
                    "精选",
                    p.selected ? (p.visible_after ? <>是（<Time at={p.visible_after} />起可见）</> : "是（立即可见）") : "否",
                  ],
                  ["栏目", categoryLabel(p.category)],
                  ["标签", p.tags.length ? p.tags.join("、") : null],
                  ["摘要", p.summary],
                  ["风向观察", p.reason],
                  ["正文", p.body_mode === "full" ? "全文" : "仅摘要"],
                  ["对外全文", p.syndicate ? "可带" : "不带"],
                  [
                    "搜索收录",
                    p.indexable ? (p.seo_indexed_at ? "人工标记收录" : "精选自动收录") : p.seo_excluded_at ? "人工排除收录" : "不收录",
                  ],
                ]}
              />
            ) : (
              <Empty>没有公开投影（未通过相关性判断或仍在处理）</Empty>
            )}
            {c.override && (
              <div className="mt-4 border-t border-line pt-3">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[11px] leading-[1.7] text-ink-4">
                  <span>人工设置 v{c.override.version}</span>
                  <span aria-hidden="true">·</span>
                  <span>{actorName(c.override.updated_by)}</span>
                  <span aria-hidden="true">·</span>
                  <Time at={c.override.updated_at} />
                  {c.override.reason && <span>· {c.override.reason}</span>}
                </div>
                <div className="mt-2">
                  <Json value={{ visibility: c.override.visibility, ...c.override.fields }} label="修正字段" />
                </div>
              </div>
            )}
          </Step>

          <Step
            name="精选"
            value={c.ledger.length ? LEDGER_LABEL[c.ledger[0]!.op] ?? c.ledger[0]!.op : "—"}
            muted={!c.ledger.length}
            meta={c.ledger.length ? `${c.ledger.length} 条变更` : undefined}
          >
            <DataTable
              rows={c.ledger}
              rowKey={(l) => l.seq}
              dense
              empty="没有精选变更记录"
              columns={[
                { key: "seq", label: "序号", render: (l) => <span className="adm-num text-ink-4">#{l.seq}</span> },
                {
                  key: "op",
                  label: "操作",
                  render: (l) => <Badge tone={l.op === "remove" ? "warn" : "ok"}>{LEDGER_LABEL[l.op] ?? l.op}</Badge>,
                },
                { key: "visible", label: "可见时间", render: (l) => <Time at={l.visible_at} /> },
                { key: "changed", label: "写入时间", render: (l) => <Time at={l.changed_at} /> },
              ]}
            />
          </Step>

          <Step
            name="事件归组"
            value={story ? `#${story.story_id}` : "—"}
            muted={!story}
            meta={
              story
                ? a.grouped_at
                  ? <>归组于 <Time at={a.grouped_at} /></>
                  : "已归组"
                : a.grouped_at
                  ? <>上次归组 <Time at={a.grouped_at} /></>
                  : undefined
            }
          >
            {c.membership.length ? (
              <ul>
                {c.membership.map((m, i) => (
                  <li key={m.fact_id} className={i ? "mt-3 border-t border-line pt-3" : ""}>
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="adm-num text-[11px] text-ink-4">事实 #{m.fact_id}</span>
                      <span className="text-[14px] text-ink">{m.fact_title}</span>
                      <Badge>{ROLE_LABEL[m.role] ?? m.role}</Badge>
                      {m.manual && <Badge tone="info">人工归组</Badge>}
                    </div>
                    {m.story_public_id && (
                      <div className="mt-1 text-[12.5px] leading-[1.8]">
                        <span className="text-ink-4">事件：</span>
                        <a className="adm-link" href={`/story/${m.story_public_id}`} target="_blank" rel="noreferrer">
                          {m.story_title}
                        </a>
                        <span className="adm-mono ml-2">#{m.story_id}</span>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>没有归组记录</Empty>
            )}
            {c.decisions.length > 0 && (
              <div className="mt-4 border-t border-line pt-3">
                <div className="adm-label">判断记录</div>
                <ul className="mt-1">
                  {c.decisions.map((d, i) => (
                    <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-[12.5px] leading-[1.8]">
                      <Time at={d.created_at} />
                      <Badge tone="muted">{VERDICT_LABEL[d.verdict] ?? d.verdict}</Badge>
                      {d.fact_id !== null && <span className="adm-num text-ink-4">事实 #{d.fact_id}</span>}
                      {d.receipt_id !== null && <span className="adm-num text-ink-4">回执 #{d.receipt_id}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setDialog("group")}>
                重新归组
              </Button>
              {c.membership.length > 0 && (
                <Button size="sm" onClick={() => setDialog("detach")}>
                  移出事件
                </Button>
              )}
              {story?.story_id && (
                <Button size="sm" onClick={() => setDialog("merge")}>
                  并入其他事件
                </Button>
              )}
            </div>
          </Step>

          <Step
            name="投递"
            value={c.deliveries.length ? `${c.deliveries.length} 条` : "—"}
            tone={undelivered ? "bad" : undefined}
            muted={!c.deliveries.length}
            meta={c.deliveries.length ? (undelivered ? `${undelivered} 条未确认送达` : "全部已确认") : undefined}
          >
            <DataTable
              rows={c.deliveries}
              rowKey={(d) => `${d.target_key}-${d.dedupe_key}`}
              dense
              empty="没有推送记录"
              columns={[
                { key: "target", label: "目标", render: (d) => <span className="adm-mono">{d.target_key}</span> },
                {
                  key: "status",
                  label: "状态",
                  render: (d) => (
                    <Badge tone={d.status === "sent" ? "ok" : d.status === "unknown" || d.status === "failed" ? "bad" : "muted"}>
                      {DELIVERY_LABEL[d.status] ?? d.status}
                    </Badge>
                  ),
                },
                { key: "created", label: "创建时间", render: (d) => <Time at={d.created_at} /> },
                { key: "sent", label: "送达时间", render: (d) => <Time at={d.sent_at} /> },
              ]}
            />
          </Step>
        </div>

        <aside className="space-y-7">
          <Card>
            <div className="adm-label">状态</div>
            <div className="flex flex-wrap gap-2">
              {p ? (
                <Badge tone={p.visibility === "public" ? "ok" : p.visibility === "withdrawn" ? "bad" : "warn"}>
                  {VISIBILITY_LABEL[p.visibility] ?? p.visibility}
                </Badge>
              ) : (
                <Badge>未公开</Badge>
              )}
              {p?.selected && <Badge tone="accent">精选</Badge>}
              {p?.eligible === false && <Badge>不进公开面</Badge>}
              {a.backfill && <Badge tone="warn">历史回灌</Badge>}
              <Badge tone={a.processing_state === "failed" ? "bad" : "muted"}>
                {STATE_LABEL[a.processing_state] ?? a.processing_state}
              </Badge>
              {c.override && (
                <Badge tone="info" title={c.override.reason ?? undefined}>
                  人工设置 v{c.override.version}
                </Badge>
              )}
            </div>
          </Card>

          <Card>
            <div className="adm-label">原始信息</div>
            <KV
              items={[
                ["原标题", a.title],
                ["作者", a.author],
                ["语言", a.language ? LANGUAGE_LABEL[a.language] ?? a.language : null],
                ["身份键", <span className="adm-mono break-all">{a.identity_key}</span>],
              ]}
            />
          </Card>

          <Card>
            <div className="adm-label">修改记录</div>
            {c.history.length ? (
              <ul>
                {c.history.map((h, i) => (
                  <li key={i} className={i ? "mt-3 border-t border-line pt-3" : ""}>
                    <div className="text-[14px] leading-[1.7] text-ink">{ACTION_LABEL[h.action] ?? h.action}</div>
                    <div className="mt-0.5 text-[11px] leading-[1.7] text-ink-4">
                      {actorName(h.actor)} · {bj(h.created_at, true)}
                    </div>
                    {h.reason && <p className="mt-1 text-[12.5px] leading-[1.85] text-ink-3">{h.reason}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>没有人工操作</Empty>
            )}
          </Card>
        </aside>
      </div>

      <ReasonDialog
        open={dialog === "seo"}
        title={p?.indexable ? "取消搜索收录" : "标记为可收录"}
        description={
          p?.indexable
            ? "详情页改回不收录，并移出站点地图；即使是精选，也不再自动收录，直到重新标记。"
            : "详情页默认不收录，精选内容自动收录。标记后改为收录、进入站点地图，并在下一次 IndexNow 提交。适合有独立价值、摘要与正文完整的内容。"
        }
        confirmLabel={p?.indexable ? "取消收录" : "标记收录"}
        busy={pending === "seo"}
        onClose={() => setDialog(null)}
        onSubmit={async (reason) =>
          (await run("POST", `${base}/seo`, { indexed: !p?.indexable, reason }, { label: "seo", success: p?.indexable ? "已取消收录" : "已标记为可收录" })) !== null
        }
      />

      <ReasonDialog
        open={dialog === "visibility"}
        title="公开范围"
        description="改动立刻作用于网站、API、RSS 和搜索；下架前先核实。"
        danger={visibility === "withdrawn"}
        confirmLabel="应用"
        busy={pending === "visibility"}
        onClose={() => setDialog(null)}
        onSubmit={async (reason) =>
          (await run("POST", `${base}/visibility`, { visibility, reason, version }, { label: "visibility", success: "公开范围已更新" })) !== null
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {(
            [
              ["public", "公开", "正常展示"],
              ["summary-only", "仅摘要", "不展示正文，保留标题摘要"],
              ["withdrawn", "下架", "所有出口移除，链接 404"],
            ] as const
          ).map(([v, label, hint]) => (
            <label
              key={v}
              className={`block cursor-pointer border border-line px-3 py-2 ${
                visibility === v ? "border-b-2 border-b-ink" : "border-b-2 border-b-transparent"
              }`}
            >
              <input type="radio" name="visibility" className="sr-only" checked={visibility === v} onChange={() => setVisibility(v)} />
              <span className={`block text-[14px] leading-[1.6] ${visibility === v ? "text-ink" : "text-ink-3"}`}>{label}</span>
              <span className="mt-0.5 block text-[11px] leading-[1.7] text-ink-4">{hint}</span>
            </label>
          ))}
        </div>
      </ReasonDialog>

      <ReasonDialog
        open={dialog === "override"}
        title="人工修正"
        description="留空 = 不修正；清掉已有修正会一并清除。"
        confirmLabel="保存修正"
        busy={pending === "override"}
        onClose={() => setDialog(null)}
        onSubmit={async (reason) => {
          const next: Record<string, unknown> = {};
          const clear: string[] = [];
          for (const k of ["title", "summary", "reason"] as const) {
            if (fields[k].trim()) next[k] = fields[k].trim();
            else if (c.override?.fields[k] !== undefined) clear.push(k);
          }
          if (fields.category) next.category = fields.category;
          else if (c.override?.fields.category !== undefined) clear.push("category");
          if (fields.tags.trim()) next.tags = fields.tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean);
          else if (c.override?.fields.tags !== undefined) clear.push("tags");
          if (fields.scoreMode === "none") next.score = null;
          else if (fields.scoreMode === "value") next.score = Number(fields.score);
          else if (c.override?.fields.score !== undefined) clear.push("score");
          for (const k of ["selected", "silent"] as const) {
            if (fields[k] === "true" || fields[k] === "false") next[k] = fields[k] === "true";
            else if (c.override?.fields[k] !== undefined) clear.push(k);
          }
          return (
            (await run("POST", `${base}/override`, { fields: next, clear, reason, version }, { label: "override", success: "修正已保存并重新发布" })) !== null
          );
        }}
      >
        <Field label="标题">
          <Input value={fields.title} placeholder={p?.title ?? ""} onChange={(e) => setFields({ ...fields, title: e.target.value })} />
        </Field>
        <Field label="摘要">
          <Textarea rows={3} value={fields.summary} placeholder={p?.summary ?? ""} onChange={(e) => setFields({ ...fields, summary: e.target.value })} />
        </Field>
        <Field label="风向观察">
          <Textarea rows={2} value={fields.reason} placeholder={p?.reason ?? ""} onChange={(e) => setFields({ ...fields, reason: e.target.value })} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="栏目">
            <Select value={fields.category} onChange={(e) => setFields({ ...fields, category: e.target.value })}>
              <option value="">不修正</option>
              {CATEGORY_KEYS.map((k) => (
                <option key={k} value={k}>
                  {CATEGORY_LABELS[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="标签（逗号分隔）">
            <Input value={fields.tags} onChange={(e) => setFields({ ...fields, tags: e.target.value })} />
          </Field>
          <Field label="评分">
            <Select value={fields.scoreMode} onChange={(e) => setFields({ ...fields, scoreMode: e.target.value })}>
              <option value="">按模型</option>
              <option value="none">撤销评分</option>
              <option value="value">人工评分</option>
            </Select>
          </Field>
          {fields.scoreMode === "value" && (
            <Field label="分数（0–100）">
              <Input type="number" min={0} max={100} step="any" required value={fields.score} onChange={(e) => setFields({ ...fields, score: e.target.value })} />
            </Field>
          )}
          <Field label="精选">
            <Select value={fields.selected} onChange={(e) => setFields({ ...fields, selected: e.target.value })}>
              <option value="">按模型</option>
              <option value="true">强制入选</option>
              <option value="false">强制不选</option>
            </Select>
          </Field>
          <Field label="推送">
            <Select value={fields.silent} onChange={(e) => setFields({ ...fields, silent: e.target.value })}>
              <option value="">正常</option>
              <option value="true">静默（入选也不推送）</option>
              <option value="false">取消静默</option>
            </Select>
          </Field>
        </div>
      </ReasonDialog>

      <ReasonDialog
        open={dialog === "analyze"}
        title="对当前修订重新评估"
        description="会发起一次新的模型调用（计费并记录回执）。同一次提交重复点击不会重复收费。"
        requireReason={false}
        confirmLabel="重新评估"
        busy={pending === "analyze"}
        onClose={() => setDialog(null)}
        onSubmit={async () => (await run("POST", `${base}/rerun`, { step: "analyze" }, { label: "analyze", success: "已加入评估队列" })) !== null}
      />
      <ReasonDialog
        open={dialog === "presentation"}
        title="刷新正文展示"
        description="先检查原网页的图片、链接和排版变化。文字内容相同时保留现有摘要、译文、精选和事件归属。"
        requireReason={false}
        confirmLabel={presentation?.ready && presentation.changed ? "应用展示更新" : "预览变化"}
        busy={pending === "presentation"}
        onClose={() => setDialog(null)}
        onSubmit={async () => {
          const apply = presentation?.ready && presentation.changed;
          const result = await run<AdminPresentationRefresh>(
            "POST",
            `${base}/rerun`,
            { step: "presentation", ...(apply ? { version: presentation.version } : { preview: true }) },
            { label: "presentation", revalidate: !!apply, ...(apply ? { success: "正文展示已更新" } : {}) },
          );
          if (!result) {
            setPresentation(null);
            return false;
          }
          setPresentation(result);
          return result.applied;
        }}
      >
        {presentation && (
          <div className="space-y-2 text-[12.5px] leading-[1.85] text-ink-3">
            <p>
              图片 {presentation.images.before} → {presentation.images.after}，链接 {presentation.links.before} → {presentation.links.after}。
            </p>
            <p>{presentation.reason ?? (presentation.changed ? "可以应用本次展示更新。" : "当前正文展示无需更新。")}</p>
            {presentation.translation === "reused" && <p>中文译文会保留原有文字，并同步图片和链接。</p>}
          </div>
        )}
      </ReasonDialog>
      <ReasonDialog
        open={dialog === "extract"}
        title="重新抽取正文"
        requireReason={false}
        confirmLabel="重新抽取"
        busy={pending === "extract"}
        onClose={() => setDialog(null)}
        onSubmit={async () => {
          const r = await run<AdminRerunJob>("POST", `${base}/rerun`, { step: "extract" }, { label: "extract" });
          if (!r) return false;
          // 采集总开关关闭时后端当场抽取并带回结果；打开时只入队，由 worker 执行。
          if (r.extracted) {
            const { state, bodyStatus, chars } = r.extracted;
            if (state === "ok") toast(`正文已重新抽取：${bodyStatus === "ok" ? `${chars} 字符` : bodyStatus}`, "ok");
            else if (state === "unconfirmed") toast("没取到正文：站点限制或页面结构变了，已标记为待确认", "info");
            else toast("这条已有正文，跳过抽取", "info");
          } else if (!r.jobId) toast("已经有一个抽取任务在队列里，没有重复入队", "info");
          else toast("已加入抽取队列", "ok");
          return true;
        }}
      />
      <ReasonDialog
        open={dialog === "group"}
        title="重新归组"
        description="人工归组的成员关系不会被覆盖。"
        requireReason={false}
        confirmLabel="重新归组"
        busy={pending === "group"}
        onClose={() => setDialog(null)}
        onSubmit={async () => (await run("POST", `${base}/rerun`, { step: "group" }, { label: "group", success: "已加入归组队列" })) !== null}
      />
      <ReasonDialog
        open={dialog === "detach"}
        title="移出事件"
        description="这条内容会作为独立内容展示，事件页随之更新。"
        danger
        confirmLabel="移出"
        busy={pending === "detach"}
        onClose={() => setDialog(null)}
        onSubmit={async (reason) => (await run("POST", `${base}/detach`, { reason }, { label: "detach", success: "已移出事件" })) !== null}
      />
      <ReasonDialog
        open={dialog === "merge"}
        title="合并事件"
        description={`把事件 #${story?.story_id}（${story?.story_title ?? ""}）并入另一个事件；旧链接会跳转到新事件。`}
        danger
        confirmLabel="合并"
        busy={pending === "merge"}
        onClose={() => setDialog(null)}
        onSubmit={async (reason) => {
          if (!/^\d+$/.test(mergeInto.trim())) return false;
          return (
            (await run("POST", "/api/admin/stories/merge", { from: story!.story_id, into: Number(mergeInto), reason }, { label: "merge", success: "事件已合并" })) !== null
          );
        }}
      >
        <Field label="并入的目标事件编号" hint="在该事件任一内容的详情页里可以看到 #编号">
          <Input inputMode="numeric" value={mergeInto} onChange={(e) => setMergeInto(e.target.value)} placeholder="例如 1234" />
        </Field>
      </ReasonDialog>
    </AdminPage>
  );
}
