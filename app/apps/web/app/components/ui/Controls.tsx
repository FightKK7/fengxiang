import type { ReactNode, SelectHTMLAttributes } from "react";
import { IconCheck, IconChevronDown } from "../icons";

type Variant = "primary" | "secondary";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink text-bg hover:bg-ink-3 disabled:opacity-45",
  secondary: "border border-line-strong bg-surface text-ink-2 hover:border-ink-4 hover:text-ink disabled:opacity-50",
};

type Size = "md" | "lg";
// 7 级字阶：按钮正文 12.5 / 大按钮 14（旧的 13.5 / 14.5 不在阶上）
const SIZES: Record<Size, string> = { md: "h-11 px-4 text-[12.5px] lg:h-9", lg: "h-11 px-5 text-[14px]" };

/** The square button's classes, for links that look like buttons (zero radius, one hairline). */
export function buttonClass(variant: Variant = "secondary", size: Size = "md"): string {
  return `inline-flex items-center justify-center gap-1.5 font-medium transition-colors duration-[250ms] ease-out ${SIZES[size]} ${VARIANTS[variant]}`;
}

/** Native select as a square control, like the site's other controls. */
export function Select({ className = "", children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={`relative inline-flex ${className}`}>
      <select
        className="h-11 w-full cursor-pointer appearance-none border border-line-strong bg-surface py-0 pl-3.5 pr-8 text-[16px] text-ink-2 lg:h-8 lg:text-[12.5px] transition-colors hover:border-ink-4 focus:border-ink"
        {...rest}
      >
        {children}
      </select>
      <IconChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-4" />
    </span>
  );
}

/**
 * A filter that combines with others: a square chip with its own small check mark, so a row of them reads
 * as "pick any" rather than the one-of-many `PillTabs` switch.
 */
export function ToggleChip({ on, onToggle, children }: { on: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className={`inline-flex h-11 shrink-0 lg:h-8 select-none items-center gap-1.5 whitespace-nowrap border pl-2 pr-3.5 text-[12.5px] font-medium transition-colors duration-[250ms] ease-out ${on ? "border-ink bg-bg-sunk text-ink" : "border-line-strong bg-surface text-ink-2 hover:border-ink-4 hover:text-ink"}`}
    >
      <span aria-hidden="true" className={`inline-flex size-4 items-center justify-center border transition-colors duration-[250ms] ease-out ${on ? "border-ink bg-ink text-bg" : "border-line-strong"}`}>
        {on && <IconCheck size={11} strokeWidth={3} />}
      </span>
      {children}
    </button>
  );
}
