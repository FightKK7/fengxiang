#!/usr/bin/env node
/**
 * 风向 · 字体校验：字体文件 ↔ fx-fonts.css ↔ 当期站点用字，三方必须对得上
 *
 * 用法（在 app/ 下）：
 *   node scripts/fonts/check-fonts.mjs
 *
 * 检查项：
 *   1) 当期子集 5 个 woff2 + GB2312 基线分片 + OFL/报头许可存在；两套预算分别卡住
 *   2) 字体经 dev server 能取到（/fonts/*.woff2 200 + 字节数与磁盘一致）
 *   3) fx-serif-400/600 覆盖当期全站可见字，并且「页面字 + 库内全量内容字」都落在
 *      「当期子集 ∪ GB2312 基线」里（缺字逐页列出，非零退出）——这是防缺字的门禁
 *   4) fx-serif-700 覆盖榜单序号用字；fx-wordmark 只含报头用字（风向 + 副题）
 *   5) fx-number-400/600 覆盖数字与数字标点，且带 tnum 特性（tabular）
 *   6) CSS 与文件一致：fx-fonts.css 的 @font-face 指到真实文件、字体栈分层正确；
 *      fx-fonts-base.css 由构建生成、覆盖 GB2312；回落字面带度量对齐；
 *      root.tsx 依次 import fx-fonts.css → fx-fonts-base.css；fengxiang.css 报头两处用 --font-wordmark（桌面刊头 / 手机栏与行内小字标）
 *
 * 非零退出：缺文件、缺字、超预算、CSS 与文件不一致。
 */

import { execFileSync as runFile } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BASE_BUDGET_BYTES,
  BASE_SLICES,
  collectSiteChars,
  FONT_BUDGET_BYTES,
  isSubsetChar,
  loadContentText,
  NUMBER_TEXT,
  readGb2312Text,
  SERIF_600_EXTRA,
  SERIF_700_TEXT,
  SITE_URL,
} from "./site-text.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(HERE, "../..");
const FONT_DIR = join(APP_ROOT, "apps/web/public/fonts");
const CSS_PATH = join(APP_ROOT, "apps/web/app/fx-fonts.css");
const CSS_BASE_PATH = join(APP_ROOT, "apps/web/app/fx-fonts-base.css");
const FENGXIANG_PATH = join(APP_ROOT, "apps/web/app/fengxiang.css");
const ROOT_PATH = join(APP_ROOT, "apps/web/app/root.tsx");
const PYTHON = process.env.FX_PYTHON3 ?? "python3";

/** 报头字标子集：只有「风向」两个字，和标题的思源宋体分开管。 */
const WORDMARK_FILE = "fx-wordmark.woff2";
const WORDMARK_TEXT = "风向全球企业服务资讯";
const WORDMARK_NOTICE = "KingHwa-OldSong-NOTICE.md";
const EXPECTED_FILES = ["fx-serif-400.woff2", "fx-serif-600.woff2", "fx-serif-700.woff2", "fx-number-400.woff2", "fx-number-600.woff2", WORDMARK_FILE];
/** 实例化后的源字体：用来区分「子集漏了字」和「源字体本身就没有这个字形」（emoji/韩文/控制符）。 */
const SERIF_SOURCE = join(APP_ROOT, ".font-src/build/serif-600.ttf");
/** 覆盖全站字符的宋体字面（400 判断正文/所以呢，600 标题/判决）。 */
const SERIF_FULL_FILES = ["fx-serif-400.woff2", "fx-serif-600.woff2"];
/** 允许不设 unicode-range 的全站宋体字面：缺字回落系统宋体，而不是锁死数字。 */
const FULL_SERIF_FACES = new Set(SERIF_FULL_FILES);
const COLORS = process.stdout.isTTY
  ? { dim: "\u001b[2m", bold: "\u001b[1m", green: "\u001b[32m", red: "\u001b[31m", yellow: "\u001b[33m", reset: "\u001b[0m" }
  : { dim: "", bold: "", green: "", red: "", yellow: "", reset: "" };

let failures = 0;
let warnings = 0;
const human = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

function ok(message) {
  console.log(`  ${COLORS.green}✓${COLORS.reset} ${message}`);
}
function fail(message) {
  failures += 1;
  console.log(`  ${COLORS.red}✗ ${message}${COLORS.reset}`);
}
function warn(message) {
  warnings += 1;
  console.log(`  ${COLORS.yellow}!${COLORS.reset} ${message}`);
}
function section(title) {
  console.log(`\n${COLORS.bold}${title}${COLORS.reset}`);
}

/** 用 fonttools 读字体：cmap 覆盖的码点、字形数、GSUB 特性、名称。 */
function readFont(file) {
  const program = [
    "import json, sys",
    "from fontTools.ttLib import TTFont",
    "font = TTFont(sys.argv[1])",
    "cmap = font.getBestCmap() or {}",
    "gsub = font['GSUB'].table if 'GSUB' in font else None",
    "features = sorted({record.FeatureTag for record in gsub.FeatureList.FeatureRecord}) if gsub else []",
    "print(json.dumps({",
    "  'codepoints': sorted(cmap),",
    "  'glyphs': len(font.getGlyphOrder()),",
    "  'features': features,",
    "  'family': font['name'].getDebugName(1),",
    "  'subfamily': font['name'].getDebugName(2),",
    "}))",
  ].join("\n");
  try {
    const stdout = runFile(PYTHON, ["-c", program, file], { encoding: "utf8" });
    return { ...JSON.parse(stdout), bytes: statSync(file).size };
  } catch (error) {
    fail(`读不了 ${file}（${error.stderr?.toString().trim() || error.message}）`);
    return null;
  }
}

/** 展开 unicode-range（U+0025, U+002B-003A, …）为码点 Set。 */
function parseUnicodeRange(text) {
  const codepoints = new Set();
  for (const token of text.split(",")) {
    const value = token.trim().replace(/^U\+/i, "");
    const [startText, endText] = value.split("-");
    if (!/^[0-9a-f]+$/i.test(startText)) continue;
    const start = Number.parseInt(startText, 16);
    const end = endText === undefined ? start : Number.parseInt(endText, 16);
    for (let cp = start; cp <= end && cp <= 0x10ffff; cp += 1) codepoints.add(cp);
  }
  return codepoints;
}

/** 从 fx-fonts.css 里拆 @font-face 块。 */
function parseFontFaces(css) {
  return [...css.matchAll(/@font-face\s*\{([\s\S]*?)\n\}/g)].map((match) => {
    const body = match[1];
    const pick = (regex) => body.match(regex)?.[1]?.trim() ?? null;
    return {
      family: pick(/font-family:\s*"([^"]+)"/),
      weight: pick(/font-weight:\s*(\d+)/),
      src: pick(/url\("([^"]+)"\)/),
      unicodeRange: pick(/unicode-range:\s*([^;]+);/),
    };
  });
}

const missingChar = (cp) => `U+${cp.toString(16).toUpperCase().padStart(4, "0")} ${String.fromCodePoint(cp)}`;

function reportMissing(label, missing, texts) {
  if (missing.length === 0) return false;
  fail(`${label} 缺 ${missing.length} 字：${missing.slice(0, 40).map(missingChar).join(" ")}${missing.length > 40 ? " …" : ""}`);
  if (texts) {
    const pages = [...texts.entries()]
      .map(([path, text]) => [path, missing.filter((cp) => text.includes(String.fromCodePoint(cp))).length])
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    if (pages.length > 0) console.log(`    ${COLORS.dim}出现在：${pages.map(([path, count]) => `${path}(${count})`).join(" ")}${COLORS.reset}`);
  }
  return true;
}

async function main() {
  console.log(`${COLORS.bold}风向 · 字体校验${COLORS.reset}  ${COLORS.dim}${SITE_URL}${COLORS.reset}`);

  /* ---------- 1. 文件与预算 ---------- */
  section("1/6 文件与体积预算");
  const fonts = new Map();
  for (const name of EXPECTED_FILES) {
    const path = join(FONT_DIR, name);
    if (!existsSync(path)) {
      fail(`缺字体文件 ${name}（先跑 node scripts/fonts/build-fonts.mjs）`);
      continue;
    }
    const info = readFont(path);
    if (info) fonts.set(name, info);
    console.log(
      `  ${name.padEnd(24)} ${String(info?.glyphs ?? "?").padStart(5)} 字形  ${String(info?.codepoints.length ?? "?").padStart(5)} 字符  ${human(info?.bytes ?? 0).padStart(9)}  ${COLORS.dim}${info?.features.join(",") ?? ""}${COLORS.reset}`,
    );
  }
  // GB2312 基线分片：从生成的 fx-fonts-base.css 里读文件清单，确认都在磁盘上、合计不超预算。
  let baseNames = [];
  if (existsSync(CSS_BASE_PATH)) {
    baseNames = [...readFileSync(CSS_BASE_PATH, "utf8").matchAll(/url\("\/fonts\/([^"]+)"\)/g)].map((m) => m[1]);
  } else {
    fail("缺 apps/web/app/fx-fonts-base.css（先跑 node scripts/fonts/build-fonts.mjs）");
  }
  if (baseNames.length !== BASE_SLICES * 2) fail(`fx-fonts-base.css 引用了 ${baseNames.length} 个分片，应为 ${BASE_SLICES * 2} 个（${BASE_SLICES} 片 × 2 字重）`);
  let baseBytes = 0;
  for (const name of baseNames) {
    const path = join(FONT_DIR, name);
    if (!existsSync(path)) {
      fail(`缺基线分片 ${name}（先跑 node scripts/fonts/build-fonts.mjs）`);
      continue;
    }
    baseBytes += statSync(path).size;
  }
  if (baseBytes > BASE_BUDGET_BYTES) fail(`GB2312 基线分片合计 ${human(baseBytes)}，超预算 ${human(BASE_BUDGET_BYTES)}`);
  else ok(`GB2312 基线分片 ${baseNames.length} 个，合计 ${human(baseBytes)} / 预算 ${human(BASE_BUDGET_BYTES)}（按需加载，不计首屏）`);

  const expectedName = { "fx-serif-400.woff2": "Noto Serif SC", "fx-serif-600.woff2": "Noto Serif SC", "fx-serif-700.woff2": "Noto Serif SC", "fx-number-400.woff2": "Inter", "fx-number-600.woff2": "Inter", [WORDMARK_FILE]: "KingHwa_OldSong" };
  for (const [name, family] of Object.entries(expectedName)) {
    const info = fonts.get(name);
    if (info && !String(info.family ?? "").startsWith(family)) fail(`${name} 内部 family 是「${info.family}」，应为「${family}…」——子集后元数据不对`);
  }
  const ofl = join(FONT_DIR, "OFL.txt");
  if (existsSync(ofl)) ok(`OFL.txt ${human(statSync(ofl).size)}`);
  else fail("缺 apps/web/public/fonts/OFL.txt（字体许可）");
  const notice = join(FONT_DIR, WORDMARK_NOTICE);
  if (existsSync(notice)) ok(`${WORDMARK_NOTICE} ${human(statSync(notice).size)}`);
  else fail(`缺 apps/web/public/fonts/${WORDMARK_NOTICE}（报头字标的作者声明与来源）`);
  const totalBytes = [...fonts.values()].reduce((sum, info) => sum + info.bytes, 0);
  if (totalBytes > FONT_BUDGET_BYTES) fail(`${fonts.size} 个 woff2 合计 ${human(totalBytes)}，超预算 ${human(FONT_BUDGET_BYTES)}`);
  else ok(`${fonts.size} 个 woff2 合计 ${human(totalBytes)} / 预算 ${human(FONT_BUDGET_BYTES)}`);

  /* ---------- 2. HTTP 可取 ---------- */
  section("2/6 dev server 能取到字体");
  for (const name of EXPECTED_FILES) {
    try {
      const res = await fetch(`${SITE_URL}/fonts/${name}`, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) {
        fail(`/fonts/${name} → HTTP ${res.status}`);
        continue;
      }
      const bytes = (await res.arrayBuffer()).byteLength;
      const local = fonts.get(name)?.bytes;
      if (local !== undefined && bytes !== local) fail(`/fonts/${name} 返回 ${bytes} 字节，磁盘上是 ${local} 字节`);
      else ok(`/fonts/${name}  200  ${res.headers.get("content-type")}  ${human(bytes)}`);
    } catch (error) {
      fail(`取不到 /fonts/${name}（${error.message}）——dev server 没在跑？`);
    }
  }
  // 基线分片也走同一套 HTTP 检查（任一 404 都会让缺字回落变慢甚至失败）。
  for (const name of baseNames) {
    try {
      const res = await fetch(`${SITE_URL}/fonts/${name}`, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) fail(`/fonts/${name} → HTTP ${res.status}`);
    } catch (error) {
      fail(`取不到基线分片 /fonts/${name}（${error.message}）`);
    }
  }
  if (baseNames.length > 0) ok(`${baseNames.length} 个基线分片全部可取`);

  /* ---------- 3. 当期站点用字覆盖 ---------- */
  section("3/6 思源宋体 400/600 覆盖当期站点用字");
  const site = await collectSiteChars({ quiet: true });
  if (site.pages.length === 0) fail(`抓不到任何页面（${SITE_URL}）——站点没在跑？`);
  if (site.failed.length > 0) {
    const detail = site.failed.slice(0, 6).map((page) => `${page.path}（${page.message}）`).join(" ");
    if (process.env.FX_ALLOW_PARTIAL === "1") {
      warn(`${site.failed.length}/${site.attempted.length} 个页面抓取失败，覆盖结论不完整：${detail}${site.failed.length > 6 ? " …" : ""}`);
    } else {
      fail(`${site.failed.length}/${site.attempted.length} 个页面抓取失败，无法确认覆盖：${detail}${site.failed.length > 6 ? " …" : ""}`);
    }
  }
  const siteChars = [...site.chars];
  // 全量公开内容（数据库）里的字：页面没采样到的内容也要能落到「当期子集 ∪ GB2312 基线」。
  const content = await loadContentText();
  const gbChars = new Set(readGb2312Text());
  let contentOnly = [];
  if (content.error) {
    warn(`全量内容源不可用（${content.error}）：覆盖结论只含页面用字`);
  } else {
    const contentChars = [...new Set(content.text)].filter(isSubsetChar);
    contentOnly = contentChars.filter((ch) => !gbChars.has(ch));
  }
  // 源字体本身没有的字形（emoji、韩文、零宽字符等）只能回落系统字体，不算缺字。
  const sourceCodepoints = existsSync(SERIF_SOURCE) ? new Set(readFont(SERIF_SOURCE)?.codepoints ?? []) : null;
  for (const name of SERIF_FULL_FILES) {
    const info = fonts.get(name);
    if (!info) continue;
    const covered = new Set([...info.codepoints, ...[...gbChars].map((ch) => ch.codePointAt(0))]);
    const required = [...siteChars, ...SERIF_600_EXTRA, ...contentOnly]
      .filter(isSubsetChar)
      .map((ch) => ch.codePointAt(0))
      .filter((cp, index, all) => all.indexOf(cp) === index);
    const missing = required.filter((cp) => !covered.has(cp));
    const hard = missing.filter((cp) => !sourceCodepoints || sourceCodepoints.has(cp));
    const soft = missing.length - hard.length;
    if (hard.length === 0) {
      ok(`${name} 覆盖 ${site.pages.length}/${site.attempted.length} 页 / ${siteChars.length} 个站点可见字 + 全量内容源的 GB2312 外字 + ASCII + 中文标点，无缺字${soft > 0 ? `（另有 ${soft} 个源字体没有的字形，按设计回落系统字体）` : ""}`);
    } else {
      reportMissing(name, hard, site.texts);
      if (contentOnly.length > 0) {
        const contentMissing = hard.filter((cp) => content.text.includes(String.fromCodePoint(cp)));
        if (contentMissing.length > 0) console.log(`    ${COLORS.dim}其中 ${contentMissing.length} 字来自库内全量内容（页面未采样）${COLORS.reset}`);
      }
      if (soft > 0) console.log(`    ${COLORS.dim}另有 ${soft} 个源字体没有的字形（emoji/韩文/控制符），只能回落系统字体${COLORS.reset}`);
      console.log(`    ${COLORS.dim}修复：重跑 node scripts/fonts/build-fonts.mjs（按当期用字重新子集化）${COLORS.reset}`);
    }
  }

  /* ---------- 4. 700 与数字子集 ---------- */
  section("4/6 FX Serif 700 / FX Number / 报头字标子集用字");
  const checkCoverage = (name, text) => {
    const info = fonts.get(name);
    if (!info) return;
    const covered = new Set(info.codepoints);
    const missing = [...new Set(text)]
      .map((ch) => ch.codePointAt(0))
      .filter((cp) => !covered.has(cp));
    if (missing.length === 0) ok(`${name} 覆盖 ${new Set(text).size} 字`);
    else fail(`${name} 缺 ${missing.length} 字：${missing.map(missingChar).join(" ")}`);
  };
  checkCoverage("fx-serif-700.woff2", SERIF_700_TEXT);
  checkCoverage(WORDMARK_FILE, WORDMARK_TEXT);
  const wordmarkInfo = fonts.get(WORDMARK_FILE);
  if (wordmarkInfo) {
    const expected = [...new Set(WORDMARK_TEXT)].map((ch) => ch.codePointAt(0)).sort((a, b) => a - b);
    if (wordmarkInfo.codepoints.length !== expected.length) fail(`${WORDMARK_FILE} 含 ${wordmarkInfo.codepoints.length} 个码点，应只有「${WORDMARK_TEXT}」这些字`);
    else ok(`${WORDMARK_FILE} 只含「${WORDMARK_TEXT}」（${wordmarkInfo.glyphs} 字形）`);
  }
  for (const name of ["fx-number-400.woff2", "fx-number-600.woff2"]) {
    checkCoverage(name, NUMBER_TEXT);
    if (fonts.get(name) && !fonts.get(name).features.includes("tnum")) {
      fail(`${name} 缺 tnum 特性——数字不会等宽（子集化时要 --layout-features=tnum,…）`);
    } else if (fonts.get(name)) {
      ok(`${name} 带 tnum（tabular）`);
    }
  }

  /* ---------- 5. CSS 与文件一致 ---------- */
  section("5/6 fx-fonts.css 与字体文件一致");
  if (!existsSync(CSS_PATH)) {
    fail("缺 apps/web/app/fx-fonts.css");
  } else {
    const css = readFileSync(CSS_PATH, "utf8");
    const faces = parseFontFaces(css);
    for (const name of EXPECTED_FILES) {
      const face = faces.find((candidate) => candidate.src === `/fonts/${name}`);
      if (!face) {
        fail(`fx-fonts.css 里没有指向 /fonts/${name} 的 @font-face`);
        continue;
      }
      const expectedWeight = name.includes("700") ? "700" : name.includes("600") ? "600" : "400";
      if (face.weight !== expectedWeight) fail(`${name} 的 @font-face font-weight 是 ${face.weight}，应为 ${expectedWeight}`);
      if (face.unicodeRange) {
        const range = parseUnicodeRange(face.unicodeRange);
        const text = name === WORDMARK_FILE ? WORDMARK_TEXT : name.startsWith("fx-number") ? NUMBER_TEXT : name.startsWith("fx-serif-700") ? SERIF_700_TEXT : "";
        const missing = [...new Set(text)]
          .map((ch) => ch.codePointAt(0))
          .filter((cp) => !range.has(cp));
        if (missing.length > 0) fail(`${name} 的 unicode-range 没盖住子集字符：${missing.map(missingChar).join(" ")}`);
        else ok(`${name} unicode-range 覆盖子集字符（${range.size} 个码点）`);
      } else if (!FULL_SERIF_FACES.has(name)) {
        fail(`${name} 缺 unicode-range——会把拉丁字母也拉进该字面`);
      } else {
        ok(`${name} 不设 unicode-range（全站字符优先宋体）`);
      }
    }
    for (const [token, expected, label] of [
      ["--font-serif", /--font-serif:\s*"FX Serif"\s*,/, "FX Serif"],
      ["--font-wordmark", /--font-wordmark:\s*"FX Wordmark"\s*,\s*"FX Serif"\s*,/, "FX Wordmark → FX Serif"],
      ["--font-sans", /--font-sans:\s*"FX Number"\s*,\s*-apple-system\s*,/, "FX Number + -apple-system"],
    ]) {
      if (expected.test(css)) ok(`${token} 以 ${label} 开头`);
      else fail(`fx-fonts.css 的 ${token} 没按决定写（应以 ${label} 开头）`);
    }
    if (/font-variant-numeric:\s*tabular-nums/.test(css)) ok("html 上开启 tabular-nums（数字等宽）");
    else warn("fx-fonts.css 没开 tabular-nums，数字会按 Inter 比例宽度显示");

    // 三层字体栈：当期子集 → GB2312 基线 → 度量对齐的系统宋体 → 系统宋体。
    const serifStack = css.match(/--font-serif:\s*([^;]+);/)?.[1] ?? "";
    const order = ["FX Serif", "FX Serif Base", "FX Serif Fallback", "Songti SC"];
    const positions = order.map((family) => serifStack.indexOf(`"${family}"`));
    if (positions.every((index, i) => index >= 0 && (i === 0 || index > positions[i - 1]))) {
      ok(`--font-serif 分层正确：FX Serif → FX Serif Base → FX Serif Fallback → Songti SC`);
    } else {
      fail(`--font-serif 的分层不对（应为 ${order.join(" → ")}）：${serifStack.trim()}`);
    }
    // 回落字面：必须有度量对齐（size-adjust / ascent-override / descent-override）。
    const fallbackFaces = faces.filter((face) => face.family === "FX Serif Fallback");
    if (fallbackFaces.length !== 2) fail(`fx-fonts.css 里 FX Serif Fallback 有 ${fallbackFaces.length} 个 @font-face，应为 2 个（400/600）`);
    else if (!/ascent-override:/.test(css) || !/descent-override:/.test(css) || !/size-adjust:/.test(css)) fail("FX Serif Fallback 缺度量对齐（size-adjust / ascent-override / descent-override）");
    else ok("FX Serif Fallback 带度量对齐（size-adjust / ascent / descent / line-gap）");
  }
  // 生成的基线 CSS：数量、family、权重、unicode-range。
  if (existsSync(CSS_BASE_PATH)) {
    const baseCss = readFileSync(CSS_BASE_PATH, "utf8");
    const baseFaces = parseFontFaces(baseCss);
    if (baseFaces.length !== BASE_SLICES * 2) fail(`fx-fonts-base.css 里有 ${baseFaces.length} 个 @font-face，应为 ${BASE_SLICES * 2} 个`);
    const badFamily = baseFaces.filter((face) => face.family !== "FX Serif Base");
    const badRange = baseFaces.filter((face) => !face.unicodeRange);
    const weights = new Set(baseFaces.map((face) => face.weight));
    if (badFamily.length > 0) fail(`fx-fonts-base.css 有 ${badFamily.length} 个 @font-face 的 family 不是 "FX Serif Base"`);
    if (badRange.length > 0) fail(`fx-fonts-base.css 有 ${badRange.length} 个 @font-face 缺 unicode-range（浏览器会整片下载）`);
    if (!weights.has("400") || !weights.has("600")) fail("fx-fonts-base.css 缺 400 或 600 字面");
    if (badFamily.length === 0 && badRange.length === 0 && weights.has("400") && weights.has("600")) {
      ok(`fx-fonts-base.css：${baseFaces.length} 个 @font-face、family 正确、都带 unicode-range`);
    }
  }

  const root = existsSync(ROOT_PATH) ? readFileSync(ROOT_PATH, "utf8") : "";
  if (root.length > 0 && !/import\s+"\.\/fx-fonts-base\.css"/.test(root)) {
    fail("root.tsx 还没 import \"./fx-fonts-base.css\"（GB2312 基线分片不会加载）");
  } else if (root.length > 0 && root.indexOf("fx-fonts.css") > root.indexOf("fx-fonts-base.css")) {
    fail("root.tsx 里 fx-fonts-base.css 必须在 fx-fonts.css 之后 import（顺序反了 @font-face 优先级不对）");
  } else if (root.length > 0 && /import\s+"\.\/fx-fonts-base\.css"/.test(root) && /import\s+"\.\/fx-fonts\.css"/.test(root)) {
    ok("root.tsx 已按顺序 import fx-fonts.css → fx-fonts-base.css");
  }
  if (root.length > 0 && !/import\s+"\.\/fx-fonts\.css"/.test(root)) {
    warn("root.tsx 还没 import \"./fx-fonts.css\"（Lead 接线；接上后浏览器才会真正加载字体）");
  } else if (root.length > 0) {
    const order = [...root.matchAll(/import\s+"\.\/(app\.css|fengxiang\.css|fx-fonts\.css)"/g)].map((match) => match[1]);
    if (order.indexOf("fx-fonts.css") < order.indexOf("fengxiang.css")) warn(`root.tsx import 顺序是 ${order.join(" → ")}，fx-fonts.css 应在 fengxiang.css 之后`);
    else ok("root.tsx 已接线，且 fx-fonts.css 在 fengxiang.css 之后");
    if (/rel:\s*"preload",\s*href:\s*"\/fonts\/fx-wordmark\.woff2"/.test(root)) ok("root.tsx preload 了报头字标（避免字体 swap 抽动刊头）");
    else warn("root.tsx 没 preload /fonts/fx-wordmark.woff2——首屏报头会先闪一次思源宋体");
  }

  /* ---------- 6. 报头两处都用同一条字体栈 ---------- */
  section("6/6 fengxiang.css 的报头两处字体");
  if (!existsSync(FENGXIANG_PATH)) {
    fail("缺 apps/web/app/fengxiang.css");
  } else {
    const pageCss = readFileSync(FENGXIANG_PATH, "utf8");
    // 每日精选页改回全站壳刊头后，手机那套自绘刊头（.fx-mobile-wordmark）已删除：只剩桌面刊头与手机栏/行内小字标。
    for (const selector of [".fx-wordmark", ".fx-wordmark-mini"]) {
      const block = pageCss.match(new RegExp(`${selector.replace(".", "\\.")}\\s*\\{([\\s\\S]*?)\\n\\}`));
      if (!block) fail(`fengxiang.css 里找不到 ${selector} 规则`);
      else if (!/font-family:\s*var\(--font-wordmark\)/.test(block[1])) fail(`${selector} 没用 --font-wordmark（报头会退回正文宋体）`);
      else ok(`${selector} 用 --font-wordmark`);
    }
  }

  console.log("");
  if (failures > 0) {
    console.log(`${COLORS.red}✗ 字体校验失败：${failures} 项${COLORS.reset}${warnings ? `，${warnings} 个警告` : ""}`);
    process.exit(1);
  }
  console.log(`${COLORS.green}✓ 字体校验通过${COLORS.reset}${warnings ? `（${warnings} 个警告）` : ""}`);
}

try {
  await main();
} catch (error) {
  console.error(`${COLORS.red}✗ 校验脚本异常：${error.stack ?? error}${COLORS.reset}`);
  process.exit(1);
}
