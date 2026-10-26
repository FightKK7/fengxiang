// Seeds the operator's unit prices that cost estimates rest on (service_prices), so the 出刊台 can show
// what an issue cost. Estimates only: a bill the provider reports stays a bill, and receipts already
// recorded are never rewritten. Idempotent: prices are upserted by (service, model).
//
//   node --env-file-if-exists=.env scripts/seed-service-prices.ts
//
// The numbers below are DeepSeek's public list prices, USD per million tokens (input cache miss, input
// cache hit, output), read from its pricing page on the effective date. The operator must check them
// against the provider's current page: the desk marks the money as 估算 until a bill replaces it.
import { closeDb, sql } from "@aihot/backend/db";

/** USD per million tokens: input (cache miss), input (cache hit), output. */
const DEEPSEEK = { input: 0.28, cached: 0.028, output: 0.42 } as const;
const SOURCE_URL = "https://api-docs.deepseek.com/quick_start/pricing";
const EFFECTIVE_ON = "2025-09-29";

interface SeedPrice {
  service: string;
  model: string;
  currency: "USD" | "CNY";
  input: number | null;
  cached: number | null;
  output: number | null;
  sourceUrl: string;
  effectiveOn: string;
}

/** The configured default model (`llm` service) and its named preset (`deepseek` service) are the same model. */
const PRICES: SeedPrice[] = [
  { service: "llm", model: "deepseek-flash", currency: "USD", ...DEEPSEEK, sourceUrl: SOURCE_URL, effectiveOn: EFFECTIVE_ON },
  { service: "deepseek", model: "deepseek-flash", currency: "USD", ...DEEPSEEK, sourceUrl: SOURCE_URL, effectiveOn: EFFECTIVE_ON },
];

const checkedAt = new Date().toISOString();
for (const price of PRICES) {
  const meta = { effectiveOn: price.effectiveOn, sourceUrl: price.sourceUrl, checkedAt };
  await sql`
    INSERT INTO service_prices (service, model, currency, input_per_mtok, cached_per_mtok, output_per_mtok, price_meta, updated_at)
    VALUES (${price.service}, ${price.model}, ${price.currency}, ${price.input}, ${price.cached}, ${price.output},
            ${sql.json(meta as never)}, now())
    ON CONFLICT (service, model) DO UPDATE SET
      currency = EXCLUDED.currency, input_per_mtok = EXCLUDED.input_per_mtok, cached_per_mtok = EXCLUDED.cached_per_mtok,
      output_per_mtok = EXCLUDED.output_per_mtok, price_meta = EXCLUDED.price_meta, updated_at = now()`;
  console.log(`已写入 ${price.service}/${price.model}：${price.currency} 输入 ${price.input}/M，缓存 ${price.cached}/M，输出 ${price.output}/M（生效 ${price.effectiveOn}）`);
}

// A model that has actually been called but has no price row cannot show money; name it instead of guessing.
const unpriced = await sql<{ service: string; model: string | null; calls: number }[]>`
  SELECT a.service, a.model, count(*)::int AS calls FROM receipt_attempts a
  WHERE a.model IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM service_prices p WHERE p.service = a.service AND (p.model = a.model OR p.model = ''))
  GROUP BY a.service, a.model ORDER BY count(*) DESC`;
if (unpriced.length) {
  console.log("以下已调用过的模型还没有单价，费用只会计 token、不显示金额（按实际单价补录后生效）：");
  for (const row of unpriced) console.log(`  - ${row.service}/${row.model}：${row.calls} 次调用`);
} else {
  console.log("已调用过的模型都有单价。");
}
console.log("提示：单价用于估算（页面会标「估算」）；供应商回执自带金额时以账单为准，历史回执不会被改写。");
await closeDb();
