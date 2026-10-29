// Reader state kept only in this browser, and the site's one guarded way to browser storage. Keep the
// keys and formats once readers have data under them: existing readers' data must stay readable as-is.
// Storage failures degrade silently.
import { useEffect, useSyncExternalStore } from "react";
import { beijingDate } from "@aihot/contracts/time";

export const KEYS = {
  starred: "aihot-starred-items",
  read: "aihot-read-items",
  theme: "aihot-theme",
  font: "aihot-font",
  readingScale: "aihot-reading-scale",
  changelogSeen: "aihot-changelog-seen-version",
  feedbackDraft: "aihot-feedback-draft-v1",
  recentSearches: "aihot-recent-searches",
  translation: "aihot-translation",
  brandOrder: "aihot-brand-order",
} as const;

const STARRED_LIMIT = 500;
const READ_LIMIT = 5000;
const RECENT_SEARCH_LIMIT = 10;
const RECENT_SEARCH_MAX_CHARS = 200;
const IMPORT_MAX_CHARS = 2_000_000;
const ID_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/;

export interface LocalStarredItem {
  id: string;
  title: string;
  summary: string | null;
  sourceName: string;
  savedAt: string;
  publishedAt: string | null;
  /** 收藏时原文时间的精度：date 时收藏页只写日期（旧记录没有这个字段，按 unknown 处理）。 */
  publishedAtPrecision?: "date" | "exact" | "unknown" | null;
  score: number | null;
  aiSelected: boolean;
}

type StorageKind = "local" | "session";

// Reading the storage property itself throws where the browser blocks storage.
function storage(kind: StorageKind): Storage | null {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

/** A stored string; null when it is missing or storage is unavailable. */
export function readRaw(key: string, kind: StorageKind = "local"): string | null {
  try {
    return storage(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** A stored JSON value; null when it is missing, unreadable or not JSON. */
export function readJson(key: string, kind: StorageKind = "local"): unknown {
  const raw = readRaw(key, kind);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Stores a string, or removes the key for null; false when nothing was saved (storage full or unavailable). */
export function writeRaw(key: string, value: string | null, kind: StorageKind = "local"): boolean {
  try {
    const s = storage(kind);
    if (!s) return false;
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** The keys in this browser's storage; none when it is unavailable. */
export function storedKeys(kind: StorageKind): string[] {
  const s = storage(kind);
  return s ? Array.from({ length: s.length }, (_, i) => s.key(i)!) : [];
}

// change notification (same tab via events, other tabs via the storage event)
const listeners = new Map<string, Set<() => void>>();
let subscribers = 0;
function emit(key?: string) {
  for (const [subscribedKey, callbacks] of listeners) {
    if (key === undefined || key === subscribedKey) for (const callback of callbacks) callback();
  }
}
function onStorage(event: StorageEvent) {
  if (event.storageArea && event.storageArea !== storage("local")) return;
  if (event.key === null || event.key === KEYS.font) unsavedFont = undefined;
  if (event.key === null || event.key === KEYS.readingScale) unsavedReadingScale = undefined;
  if (event.key === null || event.key === KEYS.translation) unsavedTranslation = undefined;
  if (event.key === null) cache.clear();
  else cache.delete(event.key);
  // Clear the snapshot once, before notifying all cards. Each key is parsed at most once.
  emit(event.key ?? undefined);
}
function subscribeKey(key: string) {
  return (listener: () => void) => {
    let callbacks = listeners.get(key);
    if (!callbacks) listeners.set(key, callbacks = new Set());
    callbacks.add(listener);
    if (subscribers++ === 0) window.addEventListener("storage", onStorage);
    return () => {
      callbacks.delete(listener);
      if (callbacks.size === 0) listeners.delete(key);
      if (--subscribers === 0) window.removeEventListener("storage", onStorage);
    };
  };
}
const subscribeStarred = subscribeKey(KEYS.starred);
const subscribeRead = subscribeKey(KEYS.read);
const subscribeTheme = subscribeKey(KEYS.theme);
const subscribeFont = subscribeKey(KEYS.font);
const subscribeReadingScale = subscribeKey(KEYS.readingScale);
const subscribeChangelog = subscribeKey(KEYS.changelogSeen);
const subscribeRecentSearches = subscribeKey(KEYS.recentSearches);
const subscribeTranslation = subscribeKey(KEYS.translation);

// Snapshot cache so useSyncExternalStore gets stable references between changes.
const cache = new Map<string, unknown>();
function cached<T>(key: string, compute: () => T): T {
  if (!cache.has(key)) cache.set(key, compute());
  return cache.get(key) as T;
}
function invalidate(key: string) {
  cache.delete(key);
  emit(key);
}

// Another tab may have written since this tab cached its snapshots (its storage event can still be on
// the way): every edit reads fresh values first.
function editLocalData<T>(change: () => T): T {
  cache.clear();
  return change();
}

// starred
function isStarredItem(v: unknown): v is LocalStarredItem {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === "string" && ID_PATTERN.test(o.id) && typeof o.title === "string";
}

// A parseable instant can still overflow when shifted into the page's display timezone.
function isDisplayableDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    beijingDate(value);
    return true;
  } catch {
    return false;
  }
}

function normalizeStarred(v: Record<string, unknown>): LocalStarredItem {
  return {
    id: String(v.id),
    title: String(v.title),
    summary: typeof v.summary === "string" ? v.summary : null,
    sourceName: typeof v.sourceName === "string" ? v.sourceName : "",
    savedAt: isDisplayableDate(v.savedAt) ? v.savedAt : new Date().toISOString(),
    publishedAt: isDisplayableDate(v.publishedAt) ? v.publishedAt : null,
    publishedAtPrecision: v.publishedAtPrecision === "date" || v.publishedAtPrecision === "exact" || v.publishedAtPrecision === "unknown"
      ? v.publishedAtPrecision
      : null,
    score: typeof v.score === "number" ? v.score : null,
    aiSelected: v.aiSelected === true,
  };
}

export function getStarred(): LocalStarredItem[] {
  return cached(KEYS.starred, () => {
    const parsed = readJson(KEYS.starred);
    return Array.isArray(parsed) ? parsed.filter(isStarredItem).map((v) => normalizeStarred(v as unknown as Record<string, unknown>)).slice(0, STARRED_LIMIT) : [];
  });
}

const starredSetCache = { items: null as LocalStarredItem[] | null, ids: new Set<string>() };
function isStarred(id: string): boolean {
  const items = getStarred();
  if (starredSetCache.items !== items) {
    starredSetCache.items = items;
    starredSetCache.ids = new Set(items.map((item) => item.id));
  }
  return starredSetCache.ids.has(id);
}

export function toggleStar(item: Omit<LocalStarredItem, "savedAt">): boolean {
  return editLocalData(() => {
    if (starredUnreadable()) return false;
    const list = getStarred();
    const exists = list.some((s) => s.id === item.id);
    const next = exists ? list.filter((s) => s.id !== item.id) : [{ ...item, savedAt: new Date().toISOString() }, ...list].slice(0, STARRED_LIMIT);
    const saved = writeRaw(KEYS.starred, JSON.stringify(next));
    invalidate(KEYS.starred);
    return saved && !exists;
  });
}

export function removeStar(id: string) {
  editLocalData(() => {
    if (starredUnreadable()) return;
    writeRaw(KEYS.starred, JSON.stringify(getStarred().filter((s) => s.id !== id)));
    invalidate(KEYS.starred);
  });
}

// read items (LRU, newest first)
export function getReadIds(): string[] {
  return cached(KEYS.read, () => {
    const parsed = readJson(KEYS.read);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string" && ID_PATTERN.test(v)).slice(0, READ_LIMIT) : [];
  });
}

const readSetCache = { ids: null as string[] | null, set: new Set<string>() };
function getReadSet(): Set<string> {
  const ids = getReadIds();
  if (readSetCache.ids !== ids) {
    readSetCache.ids = ids;
    readSetCache.set = new Set(ids);
  }
  return readSetCache.set;
}

export function markRead(id: string) {
  editLocalData(() => {
    if (!ID_PATTERN.test(id)) return;
    const ids = getReadIds();
    if (ids[0] === id) return;
    const next = [id, ...ids.filter((v) => v !== id)].slice(0, READ_LIMIT);
    writeRaw(KEYS.read, JSON.stringify(next));
    invalidate(KEYS.read);
  });
}

// appearance
export type FontPreference = "browser" | null;
let unsavedFont: FontPreference | undefined;

export function getFontPreference(): FontPreference {
  return unsavedFont !== undefined ? unsavedFont : readRaw(KEYS.font) === "browser" ? "browser" : null;
}

export function setFontPreference(pref: FontPreference) {
  // A denied write still leaves the choice usable in this tab, like an unsaved preference.
  unsavedFont = writeRaw(KEYS.font, pref) ? undefined : pref;
  emit(KEYS.font);
}

// 条目页正文字号：滑动条 80%–130%（连续 1%），只缩放阅读正文；偏好存本浏览器，换文章、刷新保持。
export const READING_SCALE_MIN = 80;
export const READING_SCALE_MAX = 130;
export const DEFAULT_READING_SCALE = 100;
/** 滑条上的十进位刻度（80 / 90 / … / 130），只做定位，不限制取值。 */
export const READING_SCALE_TICKS = [80, 90, 100, 110, 120, 130] as const;
let unsavedReadingScale: number | undefined;

export function getReadingScale(): number {
  if (unsavedReadingScale !== undefined) return unsavedReadingScale;
  // 存的是百分比；损坏、越界或旧格式（档位序号）都回到标准档。
  const stored = parseInt(readRaw(KEYS.readingScale) ?? "", 10);
  return stored >= READING_SCALE_MIN && stored <= READING_SCALE_MAX ? stored : DEFAULT_READING_SCALE;
}

export function setReadingScale(percent: number) {
  const next = Math.min(READING_SCALE_MAX, Math.max(READING_SCALE_MIN, Math.round(percent)));
  // A denied write still leaves the choice usable in this tab, like an unsaved preference.
  unsavedReadingScale = writeRaw(KEYS.readingScale, String(next)) ? undefined : next;
  emit(KEYS.readingScale);
}

/** Puts the chosen reading scale on the document: item.css sizes the article's text with this multiplier. */
export function applyReadingScale(percent: number) {
  document.documentElement.style.setProperty("--fx-reading-scale", String(percent / 100));
}

export type ThemePreference = "light" | "dark" | null;

export function getThemePreference(): ThemePreference {
  const v = readRaw(KEYS.theme);
  return v === "light" || v === "dark" ? v : null;
}

export function setThemePreference(pref: ThemePreference) {
  writeRaw(KEYS.theme, pref);
  invalidate(KEYS.theme);
}

export function resolvedTheme(pref: ThemePreference = getThemePreference()): "light" | "dark" {
  if (pref) return pref;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

const THEME_COLOR = { light: "#ffffff", dark: "#0d0d0c" } as const;

/** Puts a theme on the page: the document's data-theme and the browser's theme colour. */
export function applyTheme(theme: "light" | "dark", followsSystem: boolean) {
  document.documentElement.setAttribute("data-theme", theme);
  // The two theme-color tags answer the system scheme; a chosen theme sets both to its own colour.
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const scheme = meta.media.includes("dark") ? "dark" : "light";
    meta.content = followsSystem ? THEME_COLOR[scheme] : THEME_COLOR[theme];
  }
}

/** 明暗切换的渐变时长（ms），和 fengxiang.css 里 `.fx-theme-fade` 的 transition-duration 一致。 */
const THEME_FADE_MS = 1000;
let themeFadeTimer: number | undefined;

/**
 * Puts a theme on the page and lets the colour tokens fade there (fengxiang.css registers them as
 * animatable <color> properties): switching light/dark darkens or brightens the whole page over ~1s
 * instead of a hard cut. The class is only switched on for a reader change, so first paint never fades;
 * reduced motion turns the transition off in CSS.
 */
export function applyThemeWithFade(theme: "light" | "dark", followsSystem: boolean) {
  const root = document.documentElement;
  root.classList.add("fx-theme-fade");
  applyTheme(theme, followsSystem);
  window.clearTimeout(themeFadeTimer);
  themeFadeTimer = window.setTimeout(() => root.classList.remove("fx-theme-fade"), THEME_FADE_MS + 60);
}

/**
 * Keeps the page on the reader's theme after the first paint: a choice made in another tab or by an
 * import, and the system switching between light and dark while the page follows it.
 */
export function useAppearanceSync() {
  const pref = useThemePreference();
  const font = useFontPreference();
  useEffect(() => {
    document.documentElement.setAttribute("data-font", getFontPreference() ?? "system");
  }, [font]);
  useEffect(() => {
    // Read the stored choice itself: during hydration the hook still reports the server's "none".
    const current = getThemePreference();
    applyTheme(resolvedTheme(current), current === null);
    if (current !== null) return;
    let query: MediaQueryList;
    try {
      query = window.matchMedia("(prefers-color-scheme: dark)");
    } catch {
      return;
    }
    const onChange = () => applyThemeWithFade(query.matches ? "dark" : "light", true);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [pref]);
}

/**
 * Calls `onChange` once the page shows another appearance, for drawings that read their colours and fonts
 * from it: "theme" when the colours change (the reader's choice, or the system's while the page follows
 * it), "font" when the font preference does. Returns the unsubscribe.
 */
export function watchAppearance(onChange: (change: "theme" | "font") => void): () => void {
  const observer = new MutationObserver((records) => {
    for (const change of new Set(records.map((r) => (r.attributeName === "data-font" ? "font" : "theme")))) onChange(change);
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-font"] });
  return () => observer.disconnect();
}

/** Inline script run before paint so the first frame already has the reader's appearance. */
export const APPEARANCE_BOOT_SCRIPT = `(function(){var f='system';try{f=localStorage.getItem('${KEYS.font}')==='browser'?'browser':'system'}catch(e){}document.documentElement.setAttribute('data-font',f);try{var t=localStorage.getItem('${KEYS.theme}');if(t==='light'||t==='dark'){var c=t==='dark'?'${THEME_COLOR.dark}':'${THEME_COLOR.light}';document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.content=c})}else{t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.setAttribute('data-theme',t)}catch(e){document.documentElement.setAttribute('data-theme','light')}try{var p=parseInt(localStorage.getItem('${KEYS.readingScale}'),10);if(p>=${READING_SCALE_MIN}&&p<=${READING_SCALE_MAX})document.documentElement.style.setProperty('--fx-reading-scale',String(p/100))}catch(e){}})();`;

/**
 * Inline script run before paint: a reader who turned the translation off must not see one frame of it
 * on the item page. The item page keeps its own class for the switch; this attribute is what the very
 * first frame can know before hydration, and the page keeps it in sync afterwards.
 */
export const TRANSLATION_BOOT_SCRIPT = `(function(){try{if(localStorage.getItem('${KEYS.translation}')==='off')document.documentElement.setAttribute('data-fx-translation','off')}catch(e){}})();`;

// translation switch (item pages whose body is a pre-generated original/translation pair)
// 默认开：只有读者明确关掉（存 "off"）才不显示译文。写入被拒时本页仍按读者的选择显示。
let unsavedTranslation: boolean | undefined;

export function getTranslationEnabled(): boolean {
  return unsavedTranslation !== undefined ? unsavedTranslation : readRaw(KEYS.translation) !== "off";
}

export function setTranslationEnabled(on: boolean) {
  unsavedTranslation = writeRaw(KEYS.translation, on ? "on" : "off") ? undefined : on;
  invalidate(KEYS.translation);
}

// changelog red dot
function getChangelogSeen(): string | null {
  const v = readRaw(KEYS.changelogSeen);
  return v && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) ? v : null;
}

export function setChangelogSeen(version: string) {
  writeRaw(KEYS.changelogSeen, version);
  invalidate(KEYS.changelogSeen);
}

// recent searches (newest first, at most RECENT_SEARCH_LIMIT; this browser only)
function getRecentSearches(): string[] {
  return cached(KEYS.recentSearches, () => {
    const parsed = readJson(KEYS.recentSearches);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string" && v.trim() !== "").slice(0, RECENT_SEARCH_LIMIT) : [];
  });
}

/** Puts a search first (the same words in another case replace the older entry). */
export function addRecentSearch(query: string) {
  const q = query.trim().slice(0, RECENT_SEARCH_MAX_CHARS);
  if (!q) return;
  const rest = getRecentSearches().filter((v) => v.toLowerCase() !== q.toLowerCase());
  writeRaw(KEYS.recentSearches, JSON.stringify([q, ...rest].slice(0, RECENT_SEARCH_LIMIT)));
  invalidate(KEYS.recentSearches);
}

export function clearRecentSearches() {
  writeRaw(KEYS.recentSearches, null);
  invalidate(KEYS.recentSearches);
}

// the page the reader was on (feedback records where a problem was seen)
const LAST_PAGE_KEY = "aihot:last-page";
const NOT_A_PLACE = /^\/(feedback|more)(\/|$)|^\/admin(\/|$)/;

/** Called on every in-site navigation: remembers the latest real page, never feedback, "更多" or the admin. */
export function rememberPage(path: string) {
  if (!NOT_A_PLACE.test(path)) writeRaw(LAST_PAGE_KEY, path, "session");
}

export function lastPage(): string | null {
  const v = readRaw(LAST_PAGE_KEY, "session");
  return v && v.startsWith("/") && !v.startsWith("//") ? v : null;
}

// export / import (version 1)
export interface ExportBundle {
  version: 1;
  starred: LocalStarredItem[];
  read: string[];
  theme: "light" | "dark" | "auto" | null;
  font?: "system" | "browser";
}

export function exportBundle(): ExportBundle {
  const pref = getThemePreference();
  return { version: 1, starred: getStarred(), read: getReadIds(), theme: pref ?? "auto", font: getFontPreference() ?? "system" };
}

export interface ImportReport {
  starredAdded: number;
  starredSkipped: number;
  readAdded: number;
  readSkipped: number;
  themeApplied: boolean;
  fontApplied: boolean;
  /** The stars were saved but the read marks could not be (storage full or unavailable). */
  readFailed: boolean;
}

/** Merge: existing stars are not overwritten, read ids are unioned, appearance only if unset. */
export function importBundle(text: string): ImportReport {
  if (text.length > IMPORT_MAX_CHARS) throw new Error("文件过大（上限 2,000,000 字符）");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("不是有效的 JSON 文件");
  }
  const d = data as Partial<ExportBundle>;
  if (!d || typeof d !== "object" || d.version !== 1) throw new Error("文件格式不对（需要 version: 1）");
  return mergeLocalData({
    starred: Array.isArray(d.starred) ? d.starred : [],
    read: Array.isArray(d.read) ? d.read : [],
    theme: d.theme ?? null,
    font: d.font ?? null,
  });
}

/** Stored stars that cannot be read (not JSON, not a list): an import must not write over them. */
function starredUnreadable(): boolean {
  const raw = readRaw(KEYS.starred);
  if (!raw) return false;
  try {
    return !Array.isArray(JSON.parse(raw));
  } catch {
    return true;
  }
}

function mergeLocalData(incoming: { starred: unknown[]; read: unknown[]; theme: unknown; font?: unknown }): ImportReport {
  return editLocalData(() => {
    // The reader's own data stays recoverable (export it, or fix it) rather than replaced by the import.
    if (starredUnreadable()) throw new Error("这台设备上已有的收藏数据无法读取，为避免覆盖，这次没有导入。");
    const current = getStarred();
    const have = new Set(current.map((s) => s.id));
    const additions: LocalStarredItem[] = [];
    let starredSkipped = 0;
    for (const s of incoming.starred) {
      if (!isStarredItem(s)) { starredSkipped++; continue; }
      if (have.has(s.id)) continue;
      have.add(s.id);
      additions.push(normalizeStarred(s as unknown as Record<string, unknown>));
    }
    const room = Math.max(0, STARRED_LIMIT - current.length);
    const accepted = additions.slice(0, room);
    starredSkipped += additions.length - accepted.length;
    const mergedStarred = [...current, ...accepted].sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt));
    // An import is reported only after it was written; a failure here leaves the browser as it was.
    if (!writeRaw(KEYS.starred, JSON.stringify(mergedStarred))) throw new Error("浏览器存储已满或不可用，这次没有导入任何内容。");

    const readIds = getReadIds();
    const readHave = new Set(readIds);
    const readAdditions: string[] = [];
    let readSkipped = 0;
    for (const id of incoming.read) {
      if (typeof id !== "string" || !ID_PATTERN.test(id)) { readSkipped++; continue; }
      if (readHave.has(id)) continue;
      readHave.add(id);
      readAdditions.push(id);
    }
    const readRoom = Math.max(0, READ_LIMIT - readIds.length);
    readSkipped += Math.max(0, readAdditions.length - readRoom);
    const readFailed = !writeRaw(KEYS.read, JSON.stringify([...readIds, ...readAdditions.slice(0, readRoom)]));

    let themeApplied = false;
    if (!getThemePreference() && (incoming.theme === "light" || incoming.theme === "dark")) {
      themeApplied = writeRaw(KEYS.theme, incoming.theme);
    }
    const fontApplied = !getFontPreference() && incoming.font === "browser" && writeRaw(KEYS.font, "browser");
    cache.clear();
    emit();
    return { starredAdded: accepted.length, starredSkipped, readAdded: readFailed ? 0 : Math.min(readAdditions.length, readRoom), readSkipped, themeApplied, fontApplied, readFailed };
  });
}

/** Imports from elsewhere (the site's modules') merge through the same path. */
export { mergeLocalData };

// React hooks
const EMPTY_STARRED: LocalStarredItem[] = [];
const EMPTY_SET = new Set<string>();

export function useStarred(): LocalStarredItem[] {
  return useSyncExternalStore(subscribeStarred, getStarred, () => EMPTY_STARRED);
}

export function useIsStarred(id: string): boolean {
  return useSyncExternalStore(subscribeStarred, () => isStarred(id), () => false);
}

export function useReadSet(): Set<string> {
  return useSyncExternalStore(subscribeRead, getReadSet, () => EMPTY_SET);
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribeTheme, getThemePreference, () => null);
}

export function useFontPreference(): FontPreference {
  return useSyncExternalStore(subscribeFont, getFontPreference, () => null);
}

export function useReadingScale(): number {
  return useSyncExternalStore(subscribeReadingScale, getReadingScale, () => DEFAULT_READING_SCALE);
}

/** 译文默认开：服务端首帧与没有 localStorage 时都按开启渲染。 */
export function useTranslationEnabled(): boolean {
  return useSyncExternalStore(subscribeTranslation, getTranslationEnabled, () => true);
}

export function useChangelogSeen(): string | null {
  return useSyncExternalStore(subscribeChangelog, getChangelogSeen, () => null);
}

const NO_SEARCHES: string[] = [];
export function useRecentSearches(): string[] {
  return useSyncExternalStore(subscribeRecentSearches, getRecentSearches, () => NO_SEARCHES);
}


// ── 首页厂商筛选的自定义顺序 ─────────────────────────────────────────────

const BRAND_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const BRAND_ORDER_LIMIT = 80;

/** 读者自己排列的厂商顺序（entity id）；没有、坏了、或形状不对就返回空数组 = 按服务端的默认顺序。 */
export function getBrandOrder(): string[] {
  const parsed = readJson(KEYS.brandOrder);
  if (!Array.isArray(parsed)) return [];
  return [...new Set(parsed.filter((id): id is string => typeof id === "string" && BRAND_ID.test(id)))].slice(0, BRAND_ORDER_LIMIT);
}

/** 保存读者排好的顺序；storage 写不进去就静默降级（同本文件其余写入）。 */
export function saveBrandOrder(ids: string[]): void {
  const clean = [...new Set(ids.filter((id) => typeof id === "string" && BRAND_ID.test(id)))].slice(0, BRAND_ORDER_LIMIT);
  writeRaw(KEYS.brandOrder, clean.length ? JSON.stringify(clean) : null);
}

/** 清掉自定义顺序，回到默认（主题页顺序）。 */
export function clearBrandOrder(): void {
  writeRaw(KEYS.brandOrder, null);
}
