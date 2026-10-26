// 首页时间线之上的厂商筛选：一行常驻、单选、带条数。
// 名册是「所有在公开列表里真的有条目的主体」（/api/site/brands，默认按主题页的厂商顺序）：
// 默认只显示前 COLLAPSED_BRANDS 家，超过时行尾给「展开全部 N 家」；展开后换行显示全部，再点收起。
// 选中的厂商一定可见：它落在折叠区时（例如直接打开分享链接）这一行自动展开，且不给「收起」。
// 顺序仍读本浏览器里已有的自定义排列；不再在行尾提供「排序」入口，减少一个要判断的动作。
// 样式复用 /all 的筛选行（.fx-afilter 系列），不引入新的字号、颜色、圆角。
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import type { BrandFacet } from "@aihot/contracts/site";
import { BRAND_SHORT_NAMES } from "@aihot/site";
import { IntentLink } from "../../components/ui/IntentLink";
import { getBrandOrder } from "../../lib/local-state";

/** 收起时显示的主体数（不含「全部企业」）：按 1024 视口、最长的名字算过，再多会把行挤到换行。 */
export const COLLAPSED_BRANDS = 7;

/** 同一页换掉一个参数（分页状态丢掉）：与 /all 的筛选行同一套地址规则。 */
function hrefWith(base: string, params: URLSearchParams, patch: Record<string, string | null>) {
  const sp = new URLSearchParams(params);
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === "") sp.delete(key);
    else sp.set(key, value);
  }
  sp.delete("page");
  sp.delete("cursor");
  // 厂商筛选与 tag 筛选是同一个口径，切换厂商时不要留下旧的 tag。
  if ("brand" in patch) sp.delete("tag");
  const s = sp.toString();
  return s ? `${base}?${s}` : base;
}

/** 读屏和悬停时的全名：短名只用于版面，身份仍按数据里的 name。 */
function displayName(brand: BrandFacet): { label: string; title: string | undefined } {
  const short = BRAND_SHORT_NAMES[brand.id];
  return short ? { label: short, title: brand.name } : { label: brand.name, title: undefined };
}

/** 把读者排好的顺序套到当前名册上：排过的在前（按读者顺序），没排过的新厂商按服务端顺序接在后面。 */
function applyBrandOrder(brands: BrandFacet[], order: string[] | null): BrandFacet[] {
  if (!order || order.length === 0) return brands;
  const byId = new Map(brands.map((brand) => [brand.id, brand]));
  const picked: BrandFacet[] = [];
  for (const id of order) {
    const brand = byId.get(id);
    if (brand) {
      picked.push(brand);
      byId.delete(id);
    }
  }
  for (const brand of brands) if (byId.has(brand.id)) picked.push(brand);
  return picked;
}

export function BrandBar({ active = null, brands = [], total = 0 }: { active?: string | null; brands?: BrandFacet[]; total?: number }) {
  const [params] = useSearchParams();
  const [expanded, setExpanded] = useState(false);
  // null = 还没读读者自己的顺序（服务端渲染用默认顺序）；数组 = 读者排过的顺序。
  const [order, setOrder] = useState<string[] | null>(null);

  // 顺序只存在本浏览器：水合后读一次，别在服务端猜。
  useEffect(() => setOrder(getBrandOrder()), []);

  const ordered = useMemo(() => applyBrandOrder(brands, order), [brands, order]);
  if (brands.length === 0) return null;

  const overflow = ordered.length > COLLAPSED_BRANDS;
  const activeIndex = active === null ? -1 : ordered.findIndex((brand) => brand.id === active);
  const mustShowActive = activeIndex >= COLLAPSED_BRANDS;
  const showAll = expanded || mustShowActive;
  const visible = showAll ? ordered : ordered.slice(0, COLLAPSED_BRANDS);
  const canToggle = overflow && !mustShowActive;

  return (
    <div className="fx-brandbar">
      <nav id="fx-brand-filter" className={`fx-brands${showAll ? " fx-brands-expanded" : ""}`} aria-label="按厂商筛选">
        <IntentLink
          to={hrefWith("/", params, { brand: null })}
          aria-current={active === null ? "page" : undefined}
          className={`fx-afilter${active === null ? " fx-afilter-on" : ""}`}
        >
          全部企业
          <span className="fx-afilter-count">{total}</span>
        </IntentLink>
        {visible.map((brand) => {
          const on = brand.id === active;
          const { label, title } = displayName(brand);
          return (
            <IntentLink
              key={brand.id}
              to={hrefWith("/", params, { brand: on ? null : brand.id })}
              aria-current={on ? "page" : undefined}
              title={title}
              className={`fx-afilter${on ? " fx-afilter-on" : ""}`}
            >
              {label}
              <span className="fx-afilter-count">{brand.count}</span>
            </IntentLink>
          );
        })}
      </nav>
      <div className="fx-brands-actions">
        {/* 展开/收起固定在行尾：收起与展开时位置不变，读者不用重新找。 */}
        {canToggle && (
          <button type="button" className="fx-brands-more" aria-expanded={showAll} aria-controls="fx-brand-filter" onClick={() => setExpanded((value) => !value)}>
            {showAll ? "收起" : `展开全部 ${ordered.length} 家`}
          </button>
        )}
      </div>
    </div>
  );
}
