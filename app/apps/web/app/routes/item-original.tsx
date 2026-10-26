import type { Route } from "./+types/item-original";
import { pageReuse } from "../lib/page-reuse";
import { loadItemPage } from "../features/item/loadItemPage";

// 同一张阅读页，正文取原文（/items/:id/original）。这个地址只留作原文视图；读者面的译文开关在 /items/:id。
export { default, handle, headers, meta } from "./item";

export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

export async function loader({ params, request }: Route.LoaderArgs) {
  return loadItemPage(params.id, request, "original");
}
