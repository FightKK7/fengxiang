import type { Brand } from "@aihot/contracts/site";
import { webModules } from "../site-modules";

/**
 * A company's, vendor's or evaluator's mark; falls back to a monogram. Marks identify, never endorse.
 * `plate`: the bordered tile around the mark. Off where the logo sits directly on the paper (主题目录的格子).
 */
export function BrandMark({ brand, size = 28, className = "", plate = true }: { brand: Brand | null; size?: number; className?: string; plate?: boolean }) {
  if (brand?.src && !plate) {
    // 深色单色标（OpenAI / Anthropic / Vercel / Cursor / Notion）在暗色下反白，否则近黑纸上是一团黑。
    return (
      <img
        src={brand.src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        className={`shrink-0 object-contain ${brand.invertOnDark ? "dark:invert" : ""} ${className}`}
        aria-hidden="true"
      />
    );
  }
  if (brand?.src) {
    // Logos drawn in white (for a dark tile) sit on their own dark plate.
    const dark = webModules().flatMap((m) => m.darkMarks ?? []).includes(brand.src);
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center overflow-hidden border ${dark ? "border-transparent bg-[#111]" : `border-line bg-white ${brand.raster ? "" : "dark:bg-white/95"}`} ${className}`}
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <img src={brand.src} alt="" width={size} height={size} loading="lazy" decoding="async" className={`object-contain ${dark ? "h-[66%] w-[66%]" : "h-[64%] w-[64%]"}`} />
      </span>
    );
  }
  // 没有品牌图时是字母占位块：设计系统零圆角，占位块不做圆角（有 logo 的 tile 才沿用品牌图自己的形状）。
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center border-[0.5px] border-line bg-bg-sunk font-semibold text-ink-3 ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      aria-hidden="true"
    >
      {brand?.monogram ?? "?"}
    </span>
  );
}
