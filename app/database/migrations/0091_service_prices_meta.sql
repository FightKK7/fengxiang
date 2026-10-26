-- Unit prices are entered by an operator from the provider's price page, and the estimates derived from
-- them are shown apart from bills: keep when the price took effect, where it was read and when it was last
-- checked. Costs already recorded on receipts are not changed.
ALTER TABLE service_prices ADD COLUMN IF NOT EXISTS price_meta jsonb;
