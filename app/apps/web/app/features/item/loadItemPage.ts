// 详情页 loader 的共用数据获取（只被 route 的 loader 引用，不进客户端）。
import type { SiteItemDetail, TimelineResponse } from "@aihot/contracts/site";
import { apiGet, cachedPage, loadOr404 } from "../../lib/api.server";

/**
 * 正文 + 同一时间轴上的前一篇/后一篇。
 * 前后篇来自时间轴（最多 40 条，够一屏每日精选）；条目不在轴里时不给上下篇，不猜。
 */
export async function loadItemPage(id: string, request: Request, variant: "zh" | "original" = "zh") {
  const [item, cards] = await Promise.all([
    loadOr404<SiteItemDetail>(`/api/site/items/${encodeURIComponent(id)}${variant === "original" ? "/original" : ""}`, {
      signal: request.signal,
    }),
    apiGet<TimelineResponse>("/api/site/timeline?limit=40", { signal: request.signal })
      .then((timeline) => timeline.cards)
      .catch(() => []),
  ]);
  const index = cards.findIndex((card) => card.item.id === id);
  return cachedPage(600, {
    item,
    newer: index > 0 ? cards[index - 1].item : null,
    older: index >= 0 && index + 1 < cards.length ? cards[index + 1].item : null,
  });
}
