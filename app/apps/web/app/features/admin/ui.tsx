// 后台的共用件：页头、区块、数据带、表格、按钮、表单、标签、页签、弹窗与「写原因」对话框。
// 版式全部走 features/admin/admin.css 的 .adm-* 类；页面自己不再写颜色、字号、圆角。
import { AnimatePresence, motion } from "motion/react";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { ago, bj } from "./format";

/** 页头：朱点 + 11px 眉线、宋体 26px 标题、宋体导语；动作放在标题右侧，窄屏落到下一行。 */
export function AdminPage({
  title,
  meta,
  actions,
  children,
}: {
  title: ReactNode;
  /** 标题下的一行数据（ID/来源/时间/窗口），不是导语：没有数据就不传。 */
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="adm-page">
      <header className="adm-head">
        <div className="adm-head-row">
          <div className="adm-head-main">
            <h1 className="adm-title">{title}</h1>
            {meta && <div className="adm-page-meta">{meta}</div>}
          </div>
          {actions && <div className="adm-actions">{actions}</div>}
        </div>
      </header>
      <div className="adm-body">{children}</div>
    </div>
  );
}

/** 区块内的表格滚动时，表头吸顶。 */
const InScrollCard = createContext(false);

/** 一个区块：2px 黑线 + 12.5px 粗标题；没有卡片、圆角与阴影。 */
export function Card({
  title,
  right,
  children,
  className = "",
  pad = true,
  scrollable = false,
}: {
  title?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  pad?: boolean;
  scrollable?: boolean;
}) {
  return (
    <section className={`adm-sec ${scrollable ? "adm-sec--scroll" : ""} ${className}`}>
      {(title || right) && (
        <div className="adm-sec-head">
          {title ? <h2 className="adm-sec-title">{title}</h2> : <span />}
          {right && <div className="adm-sec-meta">{right}</div>}
        </div>
      )}
      <div className={`adm-sec-body ${pad ? "adm-sec-body--pad" : ""}`}>
        <InScrollCard.Provider value={scrollable}>{children}</InScrollCard.Provider>
      </div>
    </section>
  );
}

/** 数据带：横向排列的指标，用 1px 细线分隔；不要卡片。 */
export function Stats({ children }: { children: ReactNode }) {
  return <div className="adm-figs">{children}</div>;
}

export function Stat({ label, value, hint, tone }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: "ok" | "warn" | "bad" }) {
  const color = tone === "bad" ? " adm-tone-bad" : tone === "warn" ? " adm-tone-warn" : tone === "ok" ? " adm-tone-ok" : "";
  return (
    <div className="adm-fig">
      <div className="adm-fig-label">{label}</div>
      <div className={`adm-fig-value${color}`}>{value}</div>
      {hint && <div className="adm-fig-hint">{hint}</div>}
    </div>
  );
}

type Tone = "ok" | "warn" | "bad" | "muted" | "accent" | "info";

/** 11px 方角标签；红色只给编辑判断与告警。 */
export function Badge({ tone = "muted", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`adm-tag adm-tag--${tone}`}>
      {children}
    </span>
  );
}

/** 5×5 方块状态点（和刊头期号的朱点同一种标记）。 */
export function Dot({ tone }: { tone: Tone }) {
  return <span className={`adm-dot adm-dot--${tone === "accent" ? "accent" : tone}`} aria-hidden="true" />;
}

export function healthTone(h: string | null | undefined): Tone {
  return h === "ok" ? "ok" : h === "degraded" ? "warn" : h === "failing" ? "bad" : "muted";
}

export function Time({ at, title }: { at: string | null | undefined; title?: string }) {
  if (!at) return <span className="adm-link-muted">—</span>;
  return (
    <time dateTime={String(at)} title={title ?? bj(at, true)} className="adm-num adm-nowrap" suppressHydrationWarning>
      {ago(at)}
    </time>
  );
}

export interface Column<T> {
  key: string;
  label: ReactNode;
  render: (row: T) => ReactNode;
  className?: string;
  align?: "right";
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  empty = "暂无数据",
  onRowClick,
  dense,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (r: T) => string | number;
  empty?: ReactNode;
  onRowClick?: (r: T) => void;
  dense?: boolean;
}) {
  const scrollable = useContext(InScrollCard);
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    <div className="adm-table-wrap" tabIndex={scrollable ? 0 : undefined}>
      <table className={`adm-table${dense ? " adm-table--dense" : ""}`}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={`${c.align === "right" ? "text-right" : ""} ${c.className ?? ""}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={rowKey(r)}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              className={onRowClick ? "adm-row-link" : undefined}
            >
              {columns.map((c) => (
                <td key={c.key} className={`${c.align === "right" ? "adm-num text-right" : ""} ${c.className ?? ""}`}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="adm-empty">{children}</div>;
}

type ButtonTone = "primary" | "secondary" | "danger" | "ghost";

export function Button({
  tone = "secondary",
  size = "md",
  busy,
  children,
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ButtonTone; size?: "sm" | "md"; busy?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || busy}
      className={`adm-btn adm-btn--${tone}${size === "sm" ? " adm-btn--sm" : ""} ${className}`}
    >
      {busy && <span className="adm-btn-spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function ButtonLink({ to, children, tone = "secondary", size = "md" }: { to: string; children: ReactNode; tone?: ButtonTone; size?: "sm" | "md" }) {
  return (
    <Link to={to} className={`adm-btn adm-btn--${tone}${size === "sm" ? " adm-btn--sm" : ""}`}>
      {children}
    </Link>
  );
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="adm-field">
      <span className="adm-label">{label}</span>
      {children}
      {hint && <span className="adm-hint">{hint}</span>}
    </label>
  );
}

export function Input(props: React.ComponentProps<"input">) {
  return <input {...props} className={`adm-input ${props.className ?? ""}`} />;
}

/** 方角勾选框：14px 方框，选中墨底白勾；`indeterminate` 用于「本页全选」的半选态。 */
export function Checkbox({ indeterminate, className = "", ...props }: React.ComponentProps<"input"> & { indeterminate?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate);
  }, [indeterminate]);
  return <input ref={ref} type="checkbox" {...props} className={`adm-checkbox ${className}`} />;
}

export function Textarea(props: React.ComponentProps<"textarea">) {
  return <textarea {...props} className={`adm-textarea ${props.className ?? ""}`} />;
}

export function Select({ children, ...props }: React.ComponentProps<"select">) {
  return (
    <select {...props} className={`adm-select ${props.className ?? ""}`}>
      {children}
    </select>
  );
}

/** 页签式筛选：当前项墨色加粗 + 绛红 2px 下划线，和读者面的一致。 */
export function FilterChips({ param, options }: { param: string; options: Array<{ value: string; label: ReactNode; count?: number }> }) {
  const [sp] = useSearchParams();
  const current = sp.get(param) ?? "";
  return (
    <div className="adm-tabs">
      {options.map((o) => {
        const next = new URLSearchParams(sp);
        if (o.value) next.set(param, o.value);
        else next.delete(param);
        next.delete("page");
        const active = current === o.value;
        return (
          <Link key={o.value || "all"} to={`?${next}`} preventScrollReset className={`adm-tab${active ? " adm-tab-on" : ""}`}>
            {o.label}
            {o.count !== undefined && <span className="adm-tab-count">{o.count}</span>}
          </Link>
        );
      })}
    </div>
  );
}

export function Pager({ page, hasMore }: { page: number; hasMore: boolean }) {
  const [sp] = useSearchParams();
  const to = (p: number) => {
    const next = new URLSearchParams(sp);
    if (p > 1) next.set("page", String(p));
    else next.delete("page");
    return `?${next}`;
  };
  if (page <= 1 && !hasMore) return null;
  return (
    <div className="adm-pager">
      {page > 1 && (
        <ButtonLink to={to(page - 1)} size="sm">
          上一页
        </ButtonLink>
      )}
      <span className="adm-num">第 {page} 页</span>
      {hasMore && (
        <ButtonLink to={to(page + 1)} size="sm">
          下一页
        </ButtonLink>
      )}
    </div>
  );
}

export function Json({ value, collapsed = true, label = "原始数据" }: { value: unknown; collapsed?: boolean; label?: string }) {
  const [open, setOpen] = useState(!collapsed);
  return (
    <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} className="adm-json">
      <summary>{label}</summary>
      {open && <pre>{JSON.stringify(value, null, 2)}</pre>}
    </details>
  );
}

/**
 * 人工改动前先写原因（写进审计记录）。确认失败时不关闭。
 */
export function ReasonDialog({
  open,
  title,
  description,
  confirmLabel = "确认",
  danger,
  requireReason = true,
  children,
  onClose,
  onSubmit,
  busy,
}: {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  requireReason?: boolean;
  children?: ReactNode;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<boolean | void> | boolean | void;
  busy?: boolean;
}) {
  const [reason, setReason] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!open) return;
    setReason("");
    const t = setTimeout(() => ref.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="adm-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
          <button type="button" className="adm-overlay-bg" aria-label="关闭" onClick={onClose} />
          <motion.form
            role="dialog"
            aria-modal="true"
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 6, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
            className="adm-dialog"
            onSubmit={async (e) => {
              e.preventDefault();
              if (requireReason && !reason.trim()) return;
              const closed = await onSubmit(reason.trim());
              if (closed !== false) onClose();
            }}
          >
            <h2 className="adm-dialog-title">{title}</h2>
            {description && <div className="adm-dialog-desc">{description}</div>}
            {children && <div className="adm-dialog-body">{children}</div>}
            <div className="adm-dialog-body">
              <Field label={requireReason ? "原因（写进审计记录）" : "备注（可选）"}>
                <Textarea ref={ref} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={requireReason ? "为什么做这个改动" : ""} rows={2} />
              </Field>
            </div>
            <div className="adm-dialog-foot">
              <Button tone="ghost" onClick={onClose}>
                取消
              </Button>
              <Button type="submit" tone={danger ? "danger" : "primary"} busy={busy} disabled={requireReason && !reason.trim()}>
                {confirmLabel}
              </Button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function KV({ items }: { items: Array<[ReactNode, ReactNode]> }) {
  return (
    <dl className="adm-kv">
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt>{k}</dt>
          <dd>{v ?? <span className="adm-link-muted">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}
