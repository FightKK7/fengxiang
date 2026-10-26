// 收藏按钮：书签图标，未收藏是空芯、已收藏是实芯（读者行为，不用红——红只标编辑判断）。
// 标题行右侧一枚，和 Twitter 的书签位置一致；点击只切换收藏，不触发标题链接的跳转。
import { IconBookmark } from "../icons";
import { toggleStar, useIsStarred, type LocalStarredItem } from "../../lib/local-state";

/** 只要求收藏记录里用得到的那几个字段：时间线条目、条目详情都能直接传。 */
export interface StarTarget {
  id: string;
  title: string;
  summary: string | null;
  source: { name: string };
  publishedAt?: string | null;
  publishedAtPrecision?: LocalStarredItem["publishedAtPrecision"];
  score?: number | null;
  selected?: boolean;
}

/**
 * 把一个条目加入 / 移出本机收藏（条目页标题行、右缘阅读工具共用这一处字段映射）。
 */
export function toggleStarTarget(item: StarTarget) {
  toggleStar({
    id: item.id,
    title: item.title,
    summary: item.summary,
    sourceName: item.source.name,
    publishedAt: item.publishedAt ?? null,
    publishedAtPrecision: item.publishedAtPrecision ?? null,
    score: item.score ?? null,
    aiSelected: !!item.selected,
  });
}

export function StarButton({ item, className = "", size = 15 }: { item: StarTarget; className?: string; size?: number }) {
  const on = useIsStarred(item.id);
  return (
    <button
      type="button"
      className={`fx-star${on ? " fx-star-on" : ""}${className ? ` ${className}` : ""}`}
      aria-label={on ? `取消收藏：${item.title}` : `收藏：${item.title}`}
      aria-pressed={on}
      title={on ? "取消收藏" : "收藏"}
      onClick={(event) => {
        // 标题行可能整段在链接里（日报条目）：别让收藏变成一次跳转。
        event.preventDefault();
        event.stopPropagation();
        toggleStarTarget(item);
      }}
    >
      <IconBookmark size={size} filled={on} />
    </button>
  );
}
