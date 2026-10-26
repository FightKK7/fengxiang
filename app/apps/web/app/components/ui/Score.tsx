import { ITEM_COPY } from "@aihot/site";

/** The score readers see: none when the site keeps scores from them. */
export function shownScore(score: number | null): number | null {
  return ITEM_COPY.showScore ? score : null;
}

/** "AI 评分 88" on desktop cards; `compact` keeps only the number (phones).
 *  No pill, no tint: one quiet label and a tabular numeral, so it reads as metadata rather than a badge. */
export function ScoreLabel({ score, compact = false }: { score: number | null; compact?: boolean }) {
  const shown = shownScore(score);
  if (shown === null) return null;
  const value = Math.round(shown);
  return (
    <span title={`AI 评分 ${value}/100`} aria-label={`AI 评分 ${value} 分`} className="inline-flex shrink-0 items-baseline gap-1.5 whitespace-nowrap">
      {!compact && <span className="text-[11px] font-medium leading-none text-ink-4">AI 评分</span>}
      <span className="mono text-[12.5px] font-bold leading-none text-ink tabular-nums">{value}</span>
    </span>
  );
}
