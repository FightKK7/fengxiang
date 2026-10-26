import { beijingDate, beijingTime, beijingWeekday, monthDay } from "@aihot/contracts/time";
import type { TimePrecision } from "@aihot/contracts/site";

/** A list cut into runs of the same Beijing day, in the list's own order. */
export function byBeijingDay<T>(list: readonly T[], at: (entry: T) => string): Array<{ day: string; entries: T[] }> {
  const days: Array<{ day: string; entries: T[] }> = [];
  for (const entry of list) {
    const day = beijingDate(at(entry));
    const last = days.at(-1);
    if (last?.day === day) last.entries.push(entry);
    else days.push({ day, entries: [entry] });
  }
  return days;
}

/** "周六" of a calendar date (YYYY-MM-DD). */
export function weekdayShort(date: string): string {
  return beijingWeekday(date).replace("星期", "周");
}

export function relativeTime(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "刚刚";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} 分钟前`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} 天前`;
  return beijingDate(iso);
}

export function fullDateTime(iso: string): string {
  return `${beijingDate(iso)} ${beijingTime(iso)}`;
}

/**
 * 事件时间只有日期精度时（源只标了日期），页面只能给出这一天，不能把 00:00 当成发布时刻。
 * 列表统一用「全天」占时间列，详情统一只写日期。
 */
export function isDateOnlyEventTime(item: { timelineAtPrecision?: TimePrecision }): boolean {
  return item.timelineAtPrecision === "date";
}

/** 详情页「事件时间」：日期精度的事件时间只写日期，不补 00:00。 */
export function eventTimeLabel(item: { timelineAt: string; timelineAtPrecision?: TimePrecision }): string {
  return isDateOnlyEventTime(item) ? beijingDate(item.timelineAt) : fullDateTime(item.timelineAt);
}

/** 详情页「原文发布时间」：源只标日期时只写日期；没有原文时间时为 null。 */
export function publishedTimeLabel(item: { publishedAt: string | null; publishedAtPrecision?: TimePrecision | null }): string | null {
  if (!item.publishedAt) return null;
  return item.publishedAtPrecision === "date" ? beijingDate(item.publishedAt) : fullDateTime(item.publishedAt);
}

/** 列表的时间列：本站第一次收到这条材料的时刻（收录时间），与事件时间不是同一个时钟。 */
export function listTimeLabel(item: { discoveredAt: string }): string {
  return beijingTime(item.discoveredAt);
}

/** 源站时区的中文名；没有映射就原样显示 IANA 名称。 */
const SOURCE_ZONE_LABELS: Record<string, string> = {
  "Asia/Shanghai": "北京时间",
  "America/New_York": "美东时间",
  "America/Chicago": "中部时间",
  "America/Denver": "山地时间",
  "America/Los_Angeles": "太平洋时间",
  "Europe/London": "英国时间",
  "Asia/Tokyo": "日本时间",
  "Asia/Singapore": "新加坡时间",
};

export function sourceZoneLabel(timeZone: string): string {
  return SOURCE_ZONE_LABELS[timeZone] ?? timeZone;
}

/** 把 instant 按指定 IANA 时区写成 "2026-10-20 08:00"；显式时区，服务端与浏览器渲染一致。 */
export function timeInZone(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;
}

/** "9月24日 10:51" (Beijing), for lists that span days. */
export function monthDayTime(iso: string): string {
  return `${monthDay(beijingDate(iso))} ${beijingTime(iso)}`;
}

/** 跨天列表里的时间：日期精度只写日期，不补一个没被源给出的时刻。 */
export function monthDayTimeOf(item: { timelineAt: string; timelineAtPrecision?: TimePrecision }): string {
  return isDateOnlyEventTime(item) ? monthDay(beijingDate(item.timelineAt)) : monthDayTime(item.timelineAt);
}

export function sourceInitial(name: string): string {
  const s = name.replace(/^[^\p{L}\p{N}]+/u, "");
  return (s[0] ?? "A").toUpperCase();
}
