-- 同源批次折叠已删除（2026-10-23）：抓取结果逐条进入时间线，批次列不再有读写方。
ALTER TABLE publications DROP COLUMN IF EXISTS batch_id;
