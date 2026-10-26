import { Link } from "react-router";
import type { HotStripEntry } from "@aihot/contracts/site";
import { IconArrowRight, IconMinus, IconTrendDown, IconTrendUp } from "../../components/icons";
import { Faces } from "../hot/Faces";

// As on the original list: the top three in the ranking colours at the heaviest weight.
const RANK_COLOR = ["text-[15px] font-black text-rank-1", "text-[15px] font-black text-rank-2", "text-[15px] font-black text-rank-3"];

function hrefOf(e: HotStripEntry): string {
  return e.storyPublicId ? `/story/${e.storyPublicId}` : e.itemId ? `/items/${e.itemId}` : "/hot";
}

/** Where the heat is heading, as a small arrow (a "新" mark for a story new to the ranking). */
function TrendMark({ trend }: { trend: HotStripEntry["trend"] }) {
  if (trend === "up") return <IconTrendUp size={14} strokeWidth={2.2} className="text-ink" aria-label="热度上升" />;
  if (trend === "down") return <IconTrendDown size={14} strokeWidth={2.2} className="text-ink-4" aria-label="热度回落" />;
  if (trend === "new") return <span className="border-[0.5px] border-line-strong px-1 text-[11px] font-medium leading-4 text-ink-3">新</span>;
  if (trend === "unknown") return null; // sources behind on collection: no comparison to show
  return <IconMinus size={14} strokeWidth={2.2} className="text-ink-4" aria-label="热度持平" />;
}

/**
 * The top of the hot ranking on the home page, kept quiet: a live dot, coloured ranks and titles, then
 * columns of fixed width so every row lines up — who is talking (精选组 faces, from sm), "N 热度" and an arrow for
 * where it is heading. The whole row lights up on hover. Phones show the top three in one line each, so
 * the feed starts on the first screen.
 */
export function HotTopics({ entries }: { entries: HotStripEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <section
      aria-labelledby="hot-topics"
      className="card relative mb-4 px-3.5 pb-1 pt-2.5 lg:mb-6 lg:px-5 lg:pb-2 lg:pt-3.5"
    >
      <div className="flex items-center justify-between lg:mb-1">
        <h2 id="hot-topics" className="flex items-center gap-2 text-[14px] font-semibold text-ink">
          <span className="inline-flex size-1.5 bg-ink" aria-hidden="true" />
          当前热点
        </h2>
        <Link to="/hot" className="group -my-2 -mr-1.5 inline-flex h-10 items-center gap-1 px-1.5 text-[12.5px] text-ink-3 hover:text-ink hover:underline lg:my-0 lg:mr-0 lg:h-auto lg:px-0">
          完整榜单 <IconArrowRight size={13} />
        </Link>
      </div>
      <ol>
        {entries.slice(0, 5).map((e, i) => (
          <li key={e.rank} className={i >= 3 ? "max-sm:hidden" : undefined}>
            <Link viewTransition
              to={hrefOf(e)}
              className="group -mx-2 grid min-h-10 sm:min-h-0 grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-x-3 px-2 py-1.5 hover:bg-bg-sunk/70 active:bg-bg-sunk sm:grid-cols-[20px_minmax(0,1fr)_120px_64px_20px] sm:gap-x-4 sm:py-2 dark:hover:bg-bg-muted/40"
            >
              <span className={`num text-center leading-none ${RANK_COLOR[i] ?? "text-[14px] font-bold text-rank-rest"}`}>{e.rank}</span>
              <span className="line-clamp-1 min-w-0 text-[14.5px] font-semibold leading-[1.5] text-ink group-hover:underline lg:text-[14px]">{e.title}</span>
              <span className="hidden justify-end sm:flex">
                <Faces participants={e.participants} total={e.participantCount} size={20} interactive={false} />
              </span>
              <span className="flex items-center justify-end gap-2.5 sm:contents">
                <span className="whitespace-nowrap text-right text-[12.5px] text-ink-4" title="热度指数">
                  <span className="num text-[13.5px] font-semibold text-ink-2">{Math.round(e.heat)}</span> 热度
                </span>
                <span className="flex w-5 justify-center">
                  <TrendMark trend={e.trend} />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
