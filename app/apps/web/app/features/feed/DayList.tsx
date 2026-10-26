// A page of reports grouped by Beijing day, set as the paper's index: a letterspaced dateline over a
// hairline for each day, then one entry per row — 56px time column, category · vendor, a 19px serif
// headline, the 14px summary, the 所以呢 judgement behind a 2px red rule, and the source line.
// Entries are separated by one hairline only: no cards, no fill, no rounding, no shadows.
// The same list serves 全部动态, search results and topic pages.
import { useMemo, useState } from "react";
import { Link } from "react-router";
import type { FeedItemSummary } from "@aihot/contracts/site";
import { CATEGORY_LABELS } from "@aihot/contracts/taxonomy";
import { ENTITIES } from "@aihot/industry/taxonomy";
import { ITEM_COPY } from "@aihot/site";
import { beijingDate } from "@aihot/contracts/time";
import { byBeijingDay, listTimeLabel, weekdayShort } from "../../lib/format";
import { markRead } from "../../lib/local-state";
import { brandMark } from "../../lib/brand-marks";
import { IntentLink } from "../../components/ui/IntentLink";
import { StarButton } from "../../components/ui/StarButton";
import { IconChevronDown } from "../../components/icons";

function Entry({ item }: { item: FeedItemSummary }) {
  const category = item.category ? CATEGORY_LABELS[item.category] : null;
  const mark = brandMark(item.source.entityId);
  const isX = item.channel === "x" && !!item.x;
  return (
    <article className="fx-item" data-item-id={item.id} data-fx-entry="" tabIndex={-1}>
      <div className="fx-time">{listTimeLabel(item)}</div>
      <div className="fx-item-body">
        <h2 className="fx-h2 fx-h2-row">
          <Link to={`/items/${item.id}`} onClick={() => markRead(item.id)}>
            {item.title}
          </Link>
          <StarButton item={item} />
        </h2>
        {item.summary && item.summary.replace(/\s+/g, " ").trim() !== item.title.trim() && (
          <p className="fx-sum">{item.summary}</p>
        )}
        {item.reason && (
          <div className="fx-so">
            <span className="fx-so-label">{ITEM_COPY.reasonLabel}</span>
            <p className="fx-so-p">{item.reason}</p>
          </div>
        )}
        {item.sameEvent && (
          <p className="fx-same">
            同一件事，精选收录的是
            <Link viewTransition to={`/items/${item.sameEvent.id}`}>
              《{item.sameEvent.title}》
            </Link>
          </p>
        )}
        <div className="fx-src">
          {mark?.src && (
            <img
              className={`fx-src-mark${mark.invertOnDark ? " fx-src-mark-invert" : ""}`}
              src={mark.src}
              alt=""
              width={16}
              height={16}
              loading="lazy"
              decoding="async"
              aria-hidden="true"
            />
          )}
          <span>{isX && item.x ? item.x.authorName : item.source.name}</span>
          {/* 精选是编辑判断的痕迹：右侧行的唯一一枚红标。 */}
          {item.selected && <span className="fx-pick-tag">精选</span>}
          {category && <span className="fx-cat">{category}</span>}
        </div>
      </div>
    </article>
  );
}

/**
 * The index's dateline: "2026.10.21 周三" on the left, the day's count on the right.
 * 可折叠时整行是一个按钮（日期 + 条数 + 箭头），点一下收起/展开这一天的全部条目。
 */
function DayHeading({ day, count, aside, collapsible = false, open = true, onToggle }: {
  day: string;
  count: number | null;
  aside?: React.ReactNode;
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
}) {
  const content = (
    <>
      <span className="fx-day-date">
        {beijingDate(day).replace(/-/g, ".")} {weekdayShort(day)}
      </span>
      <span className="fx-day-right">
        {aside}
        {count !== null && <span>{count} 条</span>}
        {collapsible && <IconChevronDown size={14} className={`fx-day-chevron${open ? "" : " fx-day-chevron-closed"}`} />}
      </span>
    </>
  );
  if (!collapsible) return <div className="fx-day">{content}</div>;
  return (
    <button type="button" className="fx-day fx-day-toggle" aria-expanded={open} onClick={onToggle}>
      {content}
    </button>
  );
}

export function DayList({ items, headerAside, collapsible = false }: {
  items: FeedItemSummary[];
  headerAside?: React.ReactNode;
  /** 日期头可折叠：点一下收起这一天的条目（首页时间线用；分页归档页保持常开）。 */
  collapsible?: boolean;
}) {
  const days = useMemo(() => byBeijingDay(items, (it) => it.discoveredAt), [items]);
  // 折叠状态只活在这个列表里：换筛选会重排日期，下一次打开仍是展开的。
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (day: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  return (
    <div>
      {days.map(({ day, entries: list }, i) => {
        const open = !collapsible || !collapsed.has(day);
        return (
          <section key={day} aria-label={day}>
            <DayHeading
              day={day}
              count={list.length}
              aside={i === 0 ? headerAside : undefined}
              collapsible={collapsible}
              open={open}
              onToggle={() => toggle(day)}
            />
            {open && (
              <ol>
                {list.map((it) => (
                  // data-card-key：流式列表按它记住读者离开时屏幕上的第一条（见 lib/restore）。
                  <li key={it.id} data-card-key={it.id}>
                    <Entry item={it} />
                  </li>
                ))}
              </ol>
            )}
          </section>
        );
      })}
    </div>
  );
}

/**
 * Numbered pages as one line of text between hairlines: previous on the left, the numbers in the middle,
 * next on the right. No buttons, no pills. The timeline now scrolls (StreamDayList); this stays for topic
 * pages, where the list is a defined archive rather than a running feed.
 */
export function Pagination({ page, pageCount, href }: { page: number; pageCount: number; href: (p: number) => string }) {
  if (pageCount <= 1) return null;
  const pages = [...new Set([1, pageCount, page - 2, page - 1, page, page + 1, page + 2].filter((p) => p >= 1 && p <= pageCount))].sort((a, b) => a - b);
  return (
    <nav className="fx-pager" aria-label="分页">
      {page > 1 ? (
        <IntentLink to={href(page - 1)} className="fx-pager-step">
          ← 上一页
        </IntentLink>
      ) : (
        <span className="fx-pager-step fx-pager-off" aria-hidden="true">
          ← 上一页
        </span>
      )}
      <span className="fx-pager-nums">
        {pages.map((p, i) => (
          <span key={p} className="flex items-baseline gap-[13px]">
            {i > 0 && p - pages[i - 1]! > 1 && <span className="fx-pager-gap" aria-hidden="true">…</span>}
            <IntentLink
              to={href(p)}
              aria-current={p === page ? "page" : undefined}
              className={`fx-pager-num${p === page ? " fx-pager-num-on" : ""}`}
            >
              {p}
            </IntentLink>
          </span>
        ))}
      </span>
      {page < pageCount ? (
        <IntentLink to={href(page + 1)} className="fx-pager-step">
          下一页 →
        </IntentLink>
      ) : (
        <span className="fx-pager-step fx-pager-off" aria-hidden="true">
          下一页 →
        </span>
      )}
    </nav>
  );
}
