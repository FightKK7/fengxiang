import type { ReactNode } from "react";

type Tone = "selected" | "accent" | "amber" | "hot" | "ok" | "neutral";

const TONES: Record<Tone, string> = {
  // 精选是编辑判断，保留红字；其余状态一律墨色细线，不做彩色底。
  selected: "border-accent/40 text-accent",
  accent: "border-accent/40 text-accent",
  amber: "border-line-strong text-ink-3",
  hot: "border-line-strong text-ink-3",
  ok: "border-line-strong text-ink-3",
  neutral: "border-line-soft text-ink-4",
};

/** Small label next to a source or title: 精选, statuses and counts. */
export function Badge({ tone = "neutral", dot = false, children, className = "", title }: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={`inline-flex h-[18px] shrink-0 items-center gap-1 border-[0.5px] px-1.5 text-[11px] font-medium leading-none ${TONES[tone]} ${className}`}>
      {dot && <span className="size-[3px] bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}

/** The "精选" mark on a report. */
export function SelectedBadge() {
  return (
    <Badge tone="selected" dot>
      精选
    </Badge>
  );
}

/** A selected report whose fact is shown by another report (the one holding its selected seat). */
export function SameEventBadge() {
  return <Badge title="这件事已有另一篇入选精选">同事件</Badge>;
}
