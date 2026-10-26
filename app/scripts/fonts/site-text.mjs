/**
 * 风向 · 字体层共享定义（构建脚本与校验脚本共用，避免两处各写一份）
 *
 * 这里只有「抓哪些页、抓什么字符、四个子集各要哪些字符」四件事。
 * 真正生成/校验字体的逻辑分别在 build-fonts.mjs 与 check-fonts.mjs。
 *
 * 站点用字是构建期快照：编辑改了文案，重跑 `node scripts/fonts/build-fonts.mjs`
 * 即可按当期用字重新子集化（字体文件本身进 git，源字体不进）。
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** 开发期站点地址；构建/校验都从这里抓页面（vite dev :3000，代理到 api :3001）。 */
export const SITE_URL = process.env.FX_SITE_URL ?? "http://127.0.0.1:3000";

/**
 * 公开页清单（读者面全部静态/列表页）。
 * 条目详情页不在清单里：构建时用 /api/site/timeline 的卡片 id 动态补上。
 * 事件页（/story/:id）也不在清单里：站内没有公开的事件列表接口，构建时从库里取 public_id 补上。
 */
export const PAGES = [
  "/",
  "/all",
  "/daily",
  "/daily/archive",
  "/topics",
  "/topics/feishu",
  "/about",
  "/changelog",
  "/feedback",
  "/more",
  "/starred",
  "/agent",
  "/hot",
];

/** 最多抓多少条 /items/* 详情页（当前 timeline 只有 8 条，全抓）。 */
export const ITEM_PAGE_LIMIT = 16;

/**
 * 子集保留的空白：普通空格 / 不换行空格 / 全角空格。
 * 标题里有「AI 功能」这种中英之间的空格——子集缺空格字形时浏览器会掉到系统宋体，
 * 平台字体证据里就会出现两种字体混排。其余空白（换行、制表）不进子集。
 */
export const SUBSET_WHITESPACE = new Set([" ", "\u00a0", "\u3000"]);
export const isSubsetChar = (ch) => !/\s/.test(ch) || SUBSET_WHITESPACE.has(ch);

/** ASCII 可打印字符（U+0020–U+007E）：标题里的拉丁词、数字、半角标点都要有真字形。 */
export const ASCII_PRINTABLE = Array.from({ length: 0x7e - 0x20 + 1 }, (_, i) => String.fromCodePoint(0x20 + i)).join("");

/**
 * 中文标点补齐：站点当前用到的 + 常用全角标点。
 * 不补这些，换一条新闻标题就可能掉到系统宋体（子集缺字会 fallback）。
 */
export const CN_PUNCT =
  "，。、；：？！“”‘’（）《》〈〉【】〔〕「」『』…—–～·％‰￥＄＋－＝＜＞＆＃＠／＼｜　";

/**
 * FX Serif 600 的用字：站点全部可见字符 + ASCII 可打印 + 中文标点。
 * 标题（宋 600）覆盖全站；子集缺字的兜底是字体栈里的 Songti SC / STSong / SimSun。
 */
export const SERIF_600_EXTRA = ASCII_PRINTABLE + CN_PUNCT + "\u00a0";

/**
 * FX Serif 700：只给榜单序号（.fx-rank-n 的宋体 700 + tabular）与数字标点。
 * 报头已在 2026-10-22 改用京華老宋体（--font-wordmark / fx-wordmark.woff2），不再走这里。
 * @font-face 上用 unicode-range 锁死这些字，其他汉字 700 时回落到同族的 600 字面。
 * 这一段必须和 fx-fonts.css 里 FX Serif 700 的 unicode-range 完全一致。
 */
export const SERIF_700_TEXT = "0123456789.,:%/+-×·";

/**
 * FX Number（Inter）用字：只含数字与数字标点。
 * 拉丁字母刻意不在内——它们走 -apple-system（SF Pro）；汉字回落苹方。
 * 这一段必须和 fx-fonts.css 里 FX Number 的 unicode-range 一致。
 */
export const NUMBER_TEXT = "0123456789.,:%/+-×~()$¥";

/**
 * 站点字体体积预算（六个 woff2 合计）；超了构建/校验都失败。
 * 2026-10-21 加 fx-serif-400（判断正文/所以呢 的宋 400）后由 300KB 放宽到 320KB。
 * 2026-10-22 内容扩到 22 页 / 1008 个可见字（about 长文 + 条款页），两个全站宋体各涨到 ~167KB，
 *   加上报头字标 1.4KB 合计 ~345KB；放宽到 360KB（仍小于一张首图）。再加页面前先看构建输出的合计。
 * 2026-10-22 信源扩到 40+（DeepSeek / DSH / 飞书生态 / 中文媒体）、时间线日增 300+ 条后，
 *   标题用字面扩大到合计 ~380KB；放宽到 400KB。（正文仍按站点可见字符全覆盖，不按频率裁剪。）
 * 2026-10-22 事件页（/story/:id）进入采集、且当天采集线在持续加新内容（每次构建可见字都在涨），
 *   两个全站宋体各 ~220KB，合计约 450KB；放宽到 480KB（仍远小于一张首图）。
 *   再加页面前先看构建输出的合计；预算只是防失控，不是目标。
 */
export const FONT_BUDGET_BYTES = 480 * 1024;

/**
 * 「当期子集」之外的第二层：GB2312 常用字基线分片（静态资源，几乎不随内容变）。
 * 同一字体家族名 "FX Serif Base"、按 unicode-range 切片；浏览器只在当期子集缺字时才去取对应的片。
 * 预算单独算：这是按需资源，不预加载，不进首屏。
 */
export const BASE_BUDGET_BYTES = 3_200 * 1024;
/** 基线分片数（每个字重）。16 片 × 约 465 字，单片 ~85–95KB（两字重合计约 2.9MB）。 */
export const BASE_SLICES = 16;

/* ------------------------------------------------------------------ */
/* 抓页面 → 可见字符                                                    */
/* ------------------------------------------------------------------ */

const NAMED_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };

/** React SSR 只转义 & < > " '，其余实体理论上不会出现；顺手解掉数字实体。 */
export function decodeEntities(input) {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body) => {
    if (body.startsWith("#")) {
      const hex = body[1] === "x" || body[1] === "X";
      const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body] ?? match;
  });
}

/** 去掉脚本/样式/模板，剥标签，得到「读者眼里的文字」。 */
export function visibleText(html) {
  return decodeEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, " ")
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " "),
  ).replace(/\s+/g, " ");
}

async function fetchOk(url, what) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${what} → HTTP ${res.status}（${url}）`);
  return res;
}

/** 用 /api/site/timeline 取当期条目 id；拿不到就退回主页上抓到的 /items 链接。 */
async function itemIds() {
  try {
    const res = await fetchOk(`${SITE_URL}/api/site/timeline`, "timeline");
    const data = await res.json();
    const ids = (data.cards ?? []).map((card) => card?.item?.id).filter((id) => typeof id === "string" && id.length > 0);
    if (ids.length > 0) return [...new Set(ids)].slice(0, ITEM_PAGE_LIMIT).map((id) => `/items/${encodeURIComponent(id)}`);
  } catch (error) {
    console.warn(`! timeline 不可用（${error.message}），改为从首页链接补条目页`);
  }
  try {
    const home = await fetchOk(`${SITE_URL}/`, "首页").then((res) => res.text());
    const ids = [...home.matchAll(/\/items\/([A-Za-z0-9_-]+)/g)].map((m) => m[1]);
    return [...new Set(ids)].slice(0, ITEM_PAGE_LIMIT).map((id) => `/items/${id}`);
  } catch {
    return [];
  }
}

/** 读 DATABASE_URL：优先环境变量，其次 app/.env（字体构建是本机工具，和 dev server 同一套库）。 */
function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envFile = join(APP_ROOT, ".env");
  if (!existsSync(envFile)) return null;
  const found = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/m.exec(readFileSync(envFile, "utf8"));
  return found?.[1]?.replace(/^["']|["']$/g, "") || null;
}

/**
 * 事件页：「同一件事的多篇报道」页，标题/摘要/时间线会带入不在首页与条目页样例里的字，
 * 所以也要进子集。站内没有公开的事件列表接口（/hot 只给当期上榜的一两个），
 * 构建时从库里取所有公开事件的 public_id；数据库不可用时只覆盖 /hot 里的事件，并打警告。
 */
async function storyIds() {
  const ids = new Set();
  try {
    const hot = await fetchOk(`${SITE_URL}/api/site/hot`, "hot").then((res) => res.json());
    for (const entry of hot.entries ?? []) {
      const publicId = entry?.story?.publicId;
      if (typeof publicId === "string" && publicId.length > 0) ids.add(publicId);
    }
  } catch (error) {
    console.warn(`! 榜单事件页不可用（${error.message}）`);
  }
  const url = databaseUrl();
  if (!url) {
    console.warn("! 没有 DATABASE_URL：事件页只覆盖榜单里的；字体可能缺字，设置 DATABASE_URL 后重跑");
    return [...ids].map((id) => `/story/${encodeURIComponent(id)}`);
  }
  try {
    const { default: postgres } = await import("postgres");
    const sql = postgres(url, { max: 1, idle_timeout: 5, connect_timeout: 8, onnotice: () => {} });
    try {
      const rows = await sql`
        SELECT s.public_id::text AS id
        FROM stories s
        WHERE s.merged_into IS NULL
          AND EXISTS (SELECT 1 FROM publications p WHERE p.story_id = s.id AND p.visibility = 'public')
      `;
      for (const row of rows) if (typeof row.id === "string") ids.add(row.id);
    } finally {
      await sql.end({ timeout: 5 });
    }
  } catch (error) {
    console.warn(`! 数据库不可用（${error.message}）：事件页只覆盖榜单里的`);
  }
  return [...ids].map((id) => `/story/${encodeURIComponent(id)}`);
}

/** GB2312 常用字表（7445 字，含符号/全角标点）：基线分片的固定字集。 */
export function readGb2312Text() {
  return readFileSync(join(APP_ROOT, "scripts/fonts/gb2312.txt"), "utf8").replace(/\s/g, "");
}

/**
 * 全量公开内容的文字（数据库）：条目 title/summary/reason、正文、事件 title/digest/summary/latest、
 * 信源名、主题名。用来保证「库里能出现的字」要么在当期子集里，要么在 GB2312 基线里。
 * 返回 { text, error }；拿不到库时 error 有值，调用方决定是警告还是失败。
 */
export async function loadContentText() {
  const url = databaseUrl();
  if (!url) return { text: "", error: "没有 DATABASE_URL（也读不到 app/.env）" };
  let sql;
  try {
    const { default: postgres } = await import("postgres");
    sql = postgres(url, { max: 1, idle_timeout: 5, connect_timeout: 8, onnotice: () => {} });
    const rows = await sql`
      SELECT coalesce(p.title, '') || ' ' || coalesce(p.summary, '') || ' ' || coalesce(p.reason, '') AS text
      FROM publications p WHERE p.visibility = 'public'
      UNION ALL
      SELECT coalesce(a.body_text, '')
      FROM articles a JOIN publications p ON p.article_id = a.id WHERE p.visibility = 'public'
      UNION ALL
      SELECT coalesce(s.title, '') || ' ' || coalesce(s.digest, '') || ' ' || coalesce(s.summary, '') || ' ' || coalesce(s.latest, '')
      FROM stories s WHERE s.merged_into IS NULL
      UNION ALL
      SELECT coalesce(name, '') FROM sources
    `;
    const parts = rows.map((row) => row.text ?? "");
    try {
      const topics = JSON.parse(readFileSync(join(APP_ROOT, "industry/topics.json"), "utf8"));
      for (const group of topics.groups ?? []) if (typeof group?.name === "string") parts.push(group.name);
      for (const topic of topics.topics ?? []) if (typeof topic?.name === "string") parts.push(topic.name);
    } catch {
      // 主题文件读不到时不影响：页面抓取已经覆盖了当期渲染出来的主题名。
    }
    return { text: parts.join(" "), error: null };
  } catch (error) {
    return { text: "", error: error.message };
  } finally {
    await sql?.end({ timeout: 5 }).catch(() => {});
  }
}

/**
 * 抓全站公开页，返回 { attempted, pages, failed, texts, text, chars }。
 * chars 是「站点可见字符」的 Set，已去掉空白（空格由 ASCII_PRINTABLE 负责）。
 * texts 是 Map<path, 可见文字>，供 check-fonts.mjs 报「缺字出现在哪些页」。
 * pages 只含抓成功的页面；failed 记 HTTP/网络失败的页面（构建/校验据此 fail-closed）。
 */
export async function collectSiteChars({ quiet = false } = {}) {
  const attempted = [...PAGES, ...(await itemIds()), ...(await storyIds())];
  const texts = new Map();
  const failed = [];
  const chars = new Set();
  for (const path of attempted) {
    const url = `${SITE_URL}${path}`;
    try {
      const html = await fetchOk(url, path).then((res) => res.text());
      const text = visibleText(html);
      texts.set(path, text);
      let added = 0;
      for (const ch of text) {
        if (/\s/.test(ch)) continue;
        if (!chars.has(ch)) {
          chars.add(ch);
          added += 1;
        }
      }
      if (!quiet) console.log(`  ${path}  ${String(text.length).padStart(6)} 字  +${added}`);
    } catch (error) {
      failed.push({ path, message: error.message });
      console.warn(`! 跳过 ${path}：${error.message}`);
    }
  }
  return { attempted, pages: [...texts.keys()], failed, texts, text: [...texts.values()].join(" "), chars };
}

/** 子集用字符集合（保持首次出现顺序，便于 diff/日志）。 */
export function uniqueChars(input) {
  return [...new Set(input)];
}
