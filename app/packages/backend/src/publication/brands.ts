// 首页厂商筛选的名册与条数：一次读完，给 /api/site/brands。
// 条数按标签口径算（与 ?tag=entity:<id> 的筛选完全一致）：一条报告同时谈到两家公司，会同时计入两家。
// 名册 = 主题页的公司名单（industry/topics.json 的 company 组）∪ 公开列表里出现过的其它主体：
// 加一个公司主题，筛选行必定多一项，哪怕它暂时 0 条（点进去是空态，不是死链接）；没有主题但真的
// 有内容的主体（例如 Writer）也保留，排在主题名单之后。0 条的主题排在最后，不占收起态的位置。
import type { BrandFacet, BrandsResponse } from "@aihot/contracts/site";
import { ENTITIES } from "@aihot/industry/taxonomy";
import { BRAND_ORDER } from "@aihot/site";
import { sql } from "../db.ts";
import { cached } from "../lib/cache.ts";
import { listedFeedCondition } from "./scope.ts";
import { TOPICS } from "./topics.ts";

const ENTITY_PREFIX = "entity:";

/**
 * 显示名：行业词表里有就用它的名字（Microsoft 365、Anthropic……）；词表里没有的（例如只作为筛选
 * 主体的 Writer、或者以后新接的源）用 id 本身，按连字符分词、首字母大写。id 是稳定身份，名字随时可换。
 */
export function brandName(id: string): string {
  const entity = (ENTITIES as Record<string, { name?: string } | undefined>)[id];
  if (entity?.name) return entity.name;
  return id
    .split("-")
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}

/** 主题页（topics.json 的厂商组）的顺序：默认排序就跟随它，筛选行与主题目录看到的是同一个次序。 */
const TOPIC_ORDER: string[] = TOPICS.filter((topic) => topic.group === "company" && topic.entityId).map((topic) => topic.entityId as string);

/** 主题页的公司名单，顺序与主题目录一致：筛选行存在的依据（0 条也在名单里）。 */
const TOPIC_IDS: string[] = TOPIC_ORDER;

/**
 * 名册顺序：site.ts 的 BRAND_ORDER 置顶（列出来的按它的顺序）→ 主题页厂商顺序 →
 * 其余（主题页没有收录的主体，例如 Writer）按名称排在最后。
 */
function orderOf(id: string): [number, number, string] {
  const custom = BRAND_ORDER.indexOf(id);
  if (custom >= 0) return [0, custom, ""];
  const topic = TOPIC_ORDER.indexOf(id);
  if (topic >= 0) return [1, topic, ""];
  return [2, 0, id];
}

function compareBrands(a: BrandFacet, b: BrandFacet): number {
  // 有内容的在前（收起态只显示前几家，不能被 0 条的主题挤掉）；同为空的按主题顺序。
  const emptyA = a.count === 0 ? 1 : 0;
  const emptyB = b.count === 0 ? 1 : 0;
  const [groupA, indexA, nameA] = orderOf(a.id);
  const [groupB, indexB, nameB] = orderOf(b.id);
  return emptyA - emptyB || groupA - groupB || indexA - indexB || nameA.localeCompare(nameB);
}

async function readBrands(now: Date): Promise<BrandsResponse> {
  const [rows, totals] = await Promise.all([
    sql<{ id: string; n: number }[]>`
      SELECT substr(tag, ${ENTITY_PREFIX.length + 1}) AS id, count(*)::int AS n
      FROM publications p, unnest(p.tags) AS tag
      WHERE ${listedFeedCondition(now)} AND tag LIKE ${`${ENTITY_PREFIX}%`}
      GROUP BY 1
      ORDER BY n DESC, id`,
    sql<{ n: number }[]>`SELECT count(*)::int AS n FROM publications p WHERE ${listedFeedCondition(now)}`,
  ]);
  const brands: BrandFacet[] = rows.map((row) => ({ id: row.id, name: brandName(row.id), count: row.n }));
  // 主题里有、公开列表里还没有条目的公司也进名册：0 条，排最后，点进去是空态。
  const seen = new Set(brands.map((brand) => brand.id));
  for (const id of TOPIC_IDS) if (!seen.has(id)) brands.push({ id, name: brandName(id), count: 0 });
  brands.sort(compareBrands);
  return { brands, total: totals[0]?.n ?? 0 };
}

/** 名册每分钟最多重读一次：首页与筛选控件共用同一份，不按请求打库。 */
const cachedBrands = cached(async () => readBrands(new Date()), { freshMs: 60_000, maxStaleMs: 60_000 });

export function loadBrands(): Promise<BrandsResponse> {
  return cachedBrands.get();
}
