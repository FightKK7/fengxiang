import { useLoaderData } from "react-router";
import type { Route } from "./+types/item";
import type { SiteItemDetail } from "@aihot/contracts/site";
import { beijingDate } from "@aihot/contracts/time";
import { SITE } from "@aihot/site";
import { pageReuse } from "../lib/page-reuse";
import { articleLd, breadcrumbLd, pageMeta, titled } from "../lib/seo";
import type { Screen } from "../components/shell/screens";
import { ItemArticle } from "../features/item/ItemArticle";
import { loadItemPage } from "../features/item/loadItemPage";

export const handle: Screen = { home: "featured", toolbar: false };
export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

export async function loader({ params, request }: Route.LoaderArgs) {
  return loadItemPage(params.id, request);
}

export function meta({ loaderData }: Route.MetaArgs) {
  const item: SiteItemDetail | undefined = loaderData?.item;
  if (!item) return [{ title: titled("内容不存在") }, { name: "robots", content: "noindex" }];
  // 结构化数据也只声明源给出的精度：只标日期的源输出 YYYY-MM-DD，不补一个假时刻。
  // 精度字段由读取层提供；老 fixture 没有它时按完整时刻展示（与契约默认一致）。
  const precision = (item as { publishedAtPrecision?: "date" | "exact" | "unknown" | null }).publishedAtPrecision;
  const publishedAt = item.publishedAt ? (precision === "date" ? beijingDate(item.publishedAt) : item.publishedAt) : null;
  return pageMeta({
    title: item.title,
    description: item.summary ?? undefined,
    path: `/items/${item.id}`,
    image: `/og/items/${item.id}.png`,
    type: "article",
    noindex: !item.indexable,
    jsonLd: [
      articleLd({
        path: `/items/${item.id}`,
        headline: item.title,
        description: item.summary,
        publishedAt,
        image: `/og/items/${item.id}.png`,
        basedOn: item.links.original,
      }),
      breadcrumbLd([
        { name: SITE.name, path: "/" },
        { name: "全部动态", path: item.selected ? "/" : "/all" },
        { name: item.title, path: `/items/${item.id}` },
      ]),
    ],
  });
}

export default function ItemPage() {
  const { item, newer, older } = useLoaderData<typeof loader>();
  return <ItemArticle item={item} newer={newer} older={older} />;
}
