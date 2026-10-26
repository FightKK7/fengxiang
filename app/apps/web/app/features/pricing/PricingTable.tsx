// G2 定价对照表的表格本体（标签 / 旧价 / 箭头 / 新价），首页定价条与详情页共用同一套格子样式
// （features/pricing.css）。定稿的 .prow 规格：旧价灰色删除线右对齐、
// 新价绛红 tabular 左对齐、每行 1px 暖灰下线。
import type { Pricing } from "@aihot/contracts/site";

export function PricingTable({ pricing, label = "定价变化" }: { pricing: Pricing; label?: string }) {
  return (
    <div className="fx-pricing-table" role="table" aria-label={label}>
      {pricing.rows.map((row, index) => (
        <div className="fx-pricing-row" role="row" key={`${row.label}-${index}`}>
          <span className="fx-pricing-lab" role="rowheader">
            {row.label}
          </span>
          <span className="fx-pricing-old" role="cell">
            {row.before}
          </span>
          <span className="fx-pricing-arrow" aria-hidden="true">
            →
          </span>
          <span className="fx-pricing-new" role="cell">
            {row.after}
          </span>
        </div>
      ))}
    </div>
  );
}
