import type { ReactNode } from "react";
import { Link } from "react-router";
import { IntentLink } from "./IntentLink";

/**
 * The white thumb inside the chosen option. It is rendered in place and jumps with the choice:
 * the interaction budget allows no moving or resizing animation, only opacity and colour.
 */
function Thumb({ id }: { id: string }) {
  return <span data-pill-thumb={id} className="absolute inset-0 bg-surface ring-[0.5px] ring-line dark:bg-raised" />;
}

export interface TabItem {
  key: string;
  label: ReactNode;
  /** Link target; tabs without one call onSelect. */
  to?: string;
  /** Prefetch the page when the reader presses the tab (IntentLink). */
  prefetchOnPress?: boolean;
  replace?: boolean;
  /** Start the page it opens at the top (another page rather than another view of this one). */
  resetScroll?: boolean;
  count?: number | null;
}

const SIZES = {
  md: "h-11 px-4 text-[14px] lg:h-9",
  sm: "h-11 px-3.5 text-[13px] lg:h-8",
  xs: "h-11 px-3 text-[12.5px] lg:h-7",
} as const;

/**
 * The site's one switch control: a grey pill track with a white thumb that glides to the chosen
 * option. Boards, categories, sources, report kinds, page sections and language all use it, so every
 * switch looks and moves the same. Scrolls sideways when it runs out of room; `fill` spreads the
 * options evenly across the available width.
 */
export function PillTabs({
  items, active, onSelect, layoutId, size = "md", label, fill = false, className = "",
}: {
  items: TabItem[];
  active: string;
  onSelect?: (key: string) => void;
  /** Unique per control on a page, for the gliding thumb. */
  layoutId: string;
  size?: keyof typeof SIZES;
  label?: string;
  fill?: boolean;
  className?: string;
}) {
  const links = items.some((t) => t.to);
  const Track = links ? "nav" : "div";
  return (
    <div className={`scrollbar-none max-w-full overflow-x-auto ${fill ? "w-full" : ""} ${className}`}>
      <Track
        data-pill-track=""
        aria-label={label}
        role={links ? undefined : "tablist"}
        className={`${fill ? "grid w-full" : "inline-flex w-max"} gap-0.5 bg-well p-0.5 lg:p-[3px] ring-[0.5px] ring-inset ring-line-soft`}
        style={fill ? { gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` } : undefined}
      >
        {items.map((t) => {
          const on = t.key === active;
          const inner = (
            <>
              {on && <Thumb id={layoutId} />}
              <span className="relative inline-flex items-center gap-1">
                {t.label}
                {t.count !== undefined && t.count !== null && <span className={`num text-[0.86em] font-normal ${on ? "text-ink-3" : "text-ink-4"}`}>{t.count}</span>}
              </span>
            </>
          );
          const cls = `relative inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium outline-offset-1 transition-colors duration-[250ms] ease-out ${SIZES[size]} ${on ? "text-ink" : "text-ink-3 hover:text-ink"}`;
          const TabLink = t.prefetchOnPress ? IntentLink : Link;
          return t.to ? (
            <TabLink key={t.key} to={t.to} replace={t.replace} preventScrollReset={!t.resetScroll} aria-current={on ? "page" : undefined} className={cls}>
              {inner}
            </TabLink>
          ) : (
            <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => onSelect?.(t.key)} className={cls}>
              {inner}
            </button>
          );
        })}
      </Track>
    </div>
  );
}
