#!/usr/bin/env node
/**
 * 风向 · 字体构建：按当期站点用字生成 5 个 woff2 子集（报头字标另见 build-wordmark.mjs）
 *
 * 用法（在 app/ 下）：
 *   node scripts/fonts/build-fonts.mjs
 *
 * 依赖：python3 + fonttools（含 pyftsubset）+ brotli；站点 dev server 跑在 :3000
 *   （可用 FX_SITE_URL 覆盖；FX_PYTHON3 / FX_PYFTSUBSET 覆盖解释器与命令）
 *
 * 产物（进 git；五个文件合计约 450KB / 预算 480KB；报头字标 fx-wordmark.woff2 由 build-wordmark.mjs 生成）：
 *   apps/web/public/fonts/fx-serif-400.woff2   思源宋体 400，覆盖全站可见字符（判断正文/所以呢 16px）
 *   apps/web/public/fonts/fx-serif-600.woff2   思源宋体 600，覆盖全站可见字符（标题/判决）
 *   apps/web/public/fonts/fx-serif-700.woff2   思源宋体 700，只给榜单序号与数字标点
 *   apps/web/public/fonts/fx-number-400.woff2  Inter 400，只含数字与数字标点（tabular）
 *   apps/web/public/fonts/fx-number-600.woff2  Inter 600，同上
 *
 * 中间物（不进 git）：
 *   .font-src/  源可变字体 + 实例化后的 ttf + 字符清单；源字体 25MB 不进仓库
 *
 * 重建场景：编辑改了文案、加了新字 → 重跑本脚本；脚本会抓当期页面重新算用字。
 * 上游字体更新：删掉 .font-src/NotoSerifSC-VF.ttf（或 Inter-VF.ttf）再跑。
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
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
const SRC_DIR = join(APP_ROOT, ".font-src");
const BUILD_DIR = join(SRC_DIR, "build");
const OUT_DIR = join(APP_ROOT, "apps/web/public/fonts");
const PYTHON = process.env.FX_PYTHON3 ?? "python3";
const PYFTSUBSET = process.env.FX_PYFTSUBSET ?? "pyftsubset";

const SOURCES = {
  serif: {
    file: "NotoSerifSC-VF.ttf",
    label: "Noto Serif SC (variable, wght 200–900)",
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifsc/NotoSerifSC%5Bwght%5D.ttf",
    minBytes: 10 * 1024 * 1024,
    license: "SIL Open Font License 1.1 — Copyright 2012 Google Inc.",
  },
  inter: {
    file: "Inter-VF.ttf",
    label: "Inter (variable, opsz 14–32 / wght 100–900)",
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/inter/Inter%5Bopsz,wght%5D.ttf",
    minBytes: 400 * 1024,
    license: "SIL Open Font License 1.1 — Copyright 2020 The Inter Project Authors",
  },
};

const COLORS = process.stdout.isTTY
  ? { dim: "\u001b[2m", bold: "\u001b[1m", green: "\u001b[32m", red: "\u001b[31m", yellow: "\u001b[33m", reset: "\u001b[0m" }
  : { dim: "", bold: "", green: "", red: "", yellow: "", reset: "" };

const fail = (message) => {
  console.error(`${COLORS.red}✗ ${message}${COLORS.reset}`);
  process.exit(1);
};
const step = (title) => console.log(`\n${COLORS.bold}${title}${COLORS.reset}`);
const human = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function checkToolchain() {
  try {
    execFileSync(PYTHON, ["-c", "import fontTools, brotli"], { stdio: "ignore" });
  } catch {
    fail(`找不到带 fonttools + brotli 的 python3（${PYTHON}）。装法：pip3 install fonttools brotli`);
  }
  try {
    // pyftsubset 没有 --version（会以 2 退出），--help 才是 0。
    execFileSync(PYFTSUBSET, ["--help"], { stdio: "ignore" });
  } catch {
    fail(`找不到 pyftsubset（${PYFTSUBSET}）。它随 fonttools 一起装：pip3 install fonttools brotli`);
  }
}

/** 源字体缓存：缺失才下载（25MB，不进 git）。 */
async function ensureSources() {
  mkdirSync(SRC_DIR, { recursive: true });
  const manifestPath = join(SRC_DIR, "sources.json");
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};
  for (const [key, source] of Object.entries(SOURCES)) {
    const dest = join(SRC_DIR, source.file);
    if (!existsSync(dest) || statSync(dest).size < source.minBytes) {
      console.log(`  ↓ 下载 ${source.label} …`);
      const res = await fetch(source.url, { signal: AbortSignal.timeout(300_000) });
      if (!res.ok) fail(`下载失败 ${source.url} → HTTP ${res.status}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length < source.minBytes) fail(`${source.file} 只有 ${bytes.length} 字节，不像完整字体`);
      writeFileSync(dest, bytes);
    }
    const stat = statSync(dest);
    manifest[key] = {
      ...manifest[key],
      label: source.label,
      url: source.url,
      license: source.license,
      bytes: stat.size,
      sha256: sha256(dest),
      checkedAt: new Date().toISOString(),
    };
    console.log(`  ${source.file}  ${human(stat.size)}  sha256 ${manifest[key].sha256.slice(0, 12)}…`);
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}

function run(command, args, what) {
  try {
    execFileSync(command, args, { stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    const stderr = error.stderr?.toString().trim();
    fail(`${what}失败：${error.message}${stderr ? `\n${stderr}` : ""}`);
  }
}

/**
 * 实例化后改字体内部名：可变字体实例化会保留源文件的 name ID 1（比如
 * 「Noto Serif SC ExtraLight」），浏览器 DevTools 里会误报字重。改成
 * 「Noto Serif SC SemiBold」这类准确名字，只动元数据，不动字形。
 */
function renameInstance(ttfPath, family, subfamily) {
  const program = [
    "import sys",
    "from fontTools.ttLib import TTFont",
    "path, family, subfamily = sys.argv[1], sys.argv[2], sys.argv[3]",
    "font = TTFont(path)",
    "names = font['name']",
    "full = f'{family} {subfamily}'",
    "postscript = (family + '-' + subfamily).replace(' ', '')",
    "records = {1: family, 2: subfamily, 3: f'{full} (FX subset)', 4: full, 6: postscript, 16: family, 17: subfamily}",
    "for name_id, value in records.items():",
    "    for platform, encoding, language in ((3, 1, 0x409), (1, 0, 0)):",
    "        names.setName(value, name_id, platform, encoding, language)",
    "font.save(path)",
  ].join("\n");
  run(PYTHON, ["-c", program, ttfPath, family, subfamily], `改字体名 ${ttfPath} `);
}

/**
 * 从可变字体实例化静态字重。
 * 缓存：源字体 sha256 + 轴值 + 内部命名相同时直接复用 .font-src/build/*.ttf
 * （思源宋体实例化一次约 15s）。
 */
function instanceVariation(sourceFile, outFile, axisValues, { family, subfamily }) {
  mkdirSync(BUILD_DIR, { recursive: true });
  const sourcePath = join(SRC_DIR, sourceFile);
  const outPath = join(BUILD_DIR, outFile);
  const cachePath = join(BUILD_DIR, "instances.json");
  const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, "utf8")) : {};
  const key = `v2:${sourceFile}@${axisValues.map(([axis, value]) => `${axis}=${value}`).join(",")}:${family}/${subfamily}`;
  const sourceDigest = sha256(sourcePath);
  if (cache[key]?.sourceSha256 === sourceDigest && existsSync(outPath)) {
    console.log(`  ${outFile}  ${COLORS.dim}复用缓存（${family} ${subfamily}）${COLORS.reset}`);
    return outPath;
  }
  const args = ["-m", "fontTools.varLib.instancer", sourcePath, ...axisValues.map(([axis, value]) => `${axis}=${value}`), "-o", outPath];
  console.log(`  实例化 ${sourceFile} → ${outFile}（${axisValues.map(([a, v]) => `${a}=${v}`).join(" ")}，${family} ${subfamily}）`);
  run(PYTHON, args, `实例化 ${outFile} `);
  renameInstance(outPath, family, subfamily);
  cache[key] = { sourceSha256: sourceDigest, bytes: statSync(outPath).size, createdAt: new Date().toISOString() };
  writeFileSync(cachePath, JSON.stringify(cache, null, 2) + "\n");
  return outPath;
}

/**
 * 子集化 + woff2。
 * layoutFeatures：
 *   宋体 — kern/ccmp/locl（拉丁标题字距与组合；CJK 不做压缩，保持全角标点）
 *   Inter — 必须带 tnum：设计决定数字等宽（tabular）；lnum 保证现代数字形态。
 */
function subsetWoff2(inputPath, textPath, outPath, { layoutFeatures, label }) {
  const args = [
    inputPath,
    `--text-file=${textPath}`,
    "--flavor=woff2",
    "--output-file=" + outPath,
    "--name-IDs=1,2,3,4,5,6,13,14,16,17",
    `--layout-features=${layoutFeatures}`,
    "--drop-tables+=DSIG",
  ];
  run(PYFTSUBSET, args, `子集化 ${label} `);
}

const writeTextFile = (name, text, description) => {
  const path = join(BUILD_DIR, name);
  writeFileSync(path, text);
  console.log(`  ${description}  ${uniqueCount(text)} 字 → ${name}`);
  return path;
};

const uniqueCount = (text) => new Set(text).size;

/** 把一组字符压成 CSS unicode-range（合并连续码点）。 */
function unicodeRangeOf(chars) {
  const cps = [...new Set(chars)].map((ch) => ch.codePointAt(0)).sort((a, b) => a - b);
  const parts = [];
  let start = cps[0];
  let prev = cps[0];
  const hex = (cp) => `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
  for (const cp of cps.slice(1)) {
    if (cp === prev + 1) {
      prev = cp;
      continue;
    }
    parts.push(start === prev ? hex(start) : `${hex(start)}-${hex(prev).slice(2)}`);
    start = cp;
    prev = cp;
  }
  if (start !== undefined) parts.push(start === prev ? hex(start) : `${hex(start)}-${hex(prev).slice(2)}`);
  return parts.join(", ");
}

/**
 * 生成 apps/web/app/fx-fonts-base.css：第二层「GB2312 基线」的 @font-face。
 * 同一 family 按 unicode-range 分片；只在当期子集缺字时浏览器才会去取对应片。
 */
function writeBaseCss(baseRows) {
  const lines = [
    "/*",
    " * 风向 · 字体基线分片（fx-fonts-base.css）",
    " * ----------------------------------------------------------------------------",
    " * 由 node scripts/fonts/build-fonts.mjs 生成，不要手改。",
    " * 作用：当期子集（fx-serif-*.woff2）缺字时，浏览器按 unicode-range 去取 GB2312 常用字基线片。",
    " * 这一层是静态资源、几乎不随内容变；不预加载，只在缺字时按需请求。",
    " * 字体家族顺序见 fx-fonts.css：FX Serif → FX Serif Base → FX Serif Fallback → 系统宋体。",
    " */",
    "",
  ];
  for (const row of baseRows) {
    lines.push(
      "@font-face {",
      '  font-family: "FX Serif Base";',
      "  font-style: normal;",
      `  font-weight: ${row.weight};`,
      "  font-display: swap;",
      `  src: url("/fonts/${row.name}") format("woff2");`,
      `  unicode-range: ${row.unicodeRange};`,
      "}",
      "",
    );
  }
  const path = join(APP_ROOT, "apps/web/app/fx-fonts-base.css");
  writeFileSync(path, lines.join("\n"));
  console.log(`  生成 fx-fonts-base.css（${baseRows.length} 个 @font-face）`);
}

async function main() {
  console.log(`${COLORS.bold}风向 · 字体构建${COLORS.reset}  ${COLORS.dim}${SITE_URL}${COLORS.reset}`);
  checkToolchain();
  mkdirSync(BUILD_DIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  step("1/5 源字体缓存（.font-src/，不进 git）");
  await ensureSources();

  step("2/5 抓当期站点用字");
  const site = await collectSiteChars();
  const siteChars = [...site.chars];
  if (site.failed.length > 0) {
    const detail = site.failed.slice(0, 6).map((page) => `${page.path}（${page.message}）`).join(" ");
    if (process.env.FX_ALLOW_PARTIAL === "1") {
      console.warn(`! ${site.failed.length}/${site.attempted.length} 个页面抓取失败：${detail}${site.failed.length > 6 ? " …" : ""}`);
      console.warn("  FX_ALLOW_PARTIAL=1：按已抓到的页面生成，缺页字符不在子集里");
    } else {
      fail(`${site.failed.length}/${site.attempted.length} 个页面抓取失败：${detail}${site.failed.length > 6 ? " …" : ""}\n  字体子集必须覆盖全部公开页；站点修好后重跑（或 FX_ALLOW_PARTIAL=1 强行按部分页面生成）`);
    }
  }
  if (siteChars.length < 300) fail(`只抓到 ${siteChars.length} 个站点字符，站点可能没在跑或渲染异常，拒绝生成残废子集`);
  console.log(`  ${COLORS.green}${site.pages.length}/${site.attempted.length} 个页面，站点可见字 ${siteChars.length} 个${COLORS.reset}`);

  // 全量公开内容（库里可能出现的字）：GB2312 之外的字必须进当期子集，否则它没有基线可回落。
  const content = await loadContentText();
  const gbChars = new Set(readGb2312Text());
  let contentOnly = [];
  if (content.error) {
    console.warn(`! 全量内容源不可用（${content.error}）：当期子集只含页面用字；内容里的 GB2312 外生僻字会回落系统字体`);
  } else {
    const contentChars = [...new Set(content.text)].filter(isSubsetChar);
    contentOnly = contentChars.filter((ch) => !gbChars.has(ch));
    console.log(`  全量内容源 ${contentChars.length} 字，其中 GB2312 之外 ${contentOnly.length} 字（并入当期子集）`);
  }
  const serif600Text = [...new Set([...siteChars, ...contentOnly, ...SERIF_600_EXTRA].filter(isSubsetChar))].join("");
  const serif600Path = writeTextFile("chars-serif-600.txt", serif600Text, "FX Serif 600 用字");
  const serif700Path = writeTextFile("chars-serif-700.txt", SERIF_700_TEXT, "FX Serif 700 用字");
  const numberPath = writeTextFile("chars-number.txt", NUMBER_TEXT, "FX Number 用字");
  writeFileSync(
    join(BUILD_DIR, "site-chars.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        siteUrl: SITE_URL,
        pages: site.pages,
        siteChars: siteChars.length,
        serif600Chars: uniqueCount(serif600Text),
        serif700Chars: uniqueCount(SERIF_700_TEXT),
        numberChars: uniqueCount(NUMBER_TEXT),
      },
      null,
      2,
    ) + "\n",
  );

  step("3/5 实例化字重（缓存于 .font-src/build/）");
  const serif400Ttf = instanceVariation(SOURCES.serif.file, "serif-400.ttf", [["wght", 400]], { family: "Noto Serif SC", subfamily: "Regular" });
  const serif600Ttf = instanceVariation(SOURCES.serif.file, "serif-600.ttf", [["wght", 600]], { family: "Noto Serif SC", subfamily: "SemiBold" });
  const serif700Ttf = instanceVariation(SOURCES.serif.file, "serif-700.ttf", [["wght", 700]], { family: "Noto Serif SC", subfamily: "Bold" });
  const inter400Ttf = instanceVariation(SOURCES.inter.file, "number-400.ttf", [["wght", 400], ["opsz", 14]], { family: "Inter", subfamily: "Regular" });
  const inter600Ttf = instanceVariation(SOURCES.inter.file, "number-600.ttf", [["wght", 600], ["opsz", 14]], { family: "Inter", subfamily: "SemiBold" });

  step("4/5 当期子集化 → woff2");
  const outputs = [
    ["fx-serif-400.woff2", serif400Ttf, serif600Path, "kern,ccmp,locl", "宋 400"],
    ["fx-serif-600.woff2", serif600Ttf, serif600Path, "kern,ccmp,locl", "宋 600"],
    ["fx-serif-700.woff2", serif700Ttf, serif700Path, "kern,ccmp,locl", "宋 700"],
    ["fx-number-400.woff2", inter400Ttf, numberPath, "tnum,lnum,ccmp", "Inter 400"],
    ["fx-number-600.woff2", inter600Ttf, numberPath, "tnum,lnum,ccmp", "Inter 600"],
  ];
  const rows = [];
  for (const [name, input, textPath, features, label] of outputs) {
    const outPath = join(OUT_DIR, name);
    subsetWoff2(input, textPath, outPath, { layoutFeatures: features, label });
    const bytes = statSync(outPath).size;
    rows.push({ name, label, bytes, textChars: uniqueCount(readFileSync(textPath, "utf8")) });
  }

  const total = rows.reduce((sum, row) => sum + row.bytes, 0);
  console.log("");
  console.log(`${COLORS.bold}  文件                              字符    体积${COLORS.reset}`);
  for (const row of rows) {
    console.log(`  ${row.name.padEnd(28)} ${String(row.textChars).padStart(5)}  ${human(row.bytes).padStart(9)}`);
  }
  console.log(`  ${"".padEnd(28)} ${"".padStart(5)}  ${human(total).padStart(9)}  ${COLORS.dim}预算 ${human(FONT_BUDGET_BYTES)}${COLORS.reset}`);
  if (total > FONT_BUDGET_BYTES) fail(`五个 woff2（不含报头字标）合计 ${human(total)}，超过预算 ${human(FONT_BUDGET_BYTES)}`);

  /* ---------- 5/5 GB2312 基线分片（第二层，按需加载） ---------- */
  step("5/5 GB2312 基线分片（按 unicode-range 切，按需加载）");
  const gbList = [...gbChars].sort((a, b) => a.codePointAt(0) - b.codePointAt(0));
  const perSlice = Math.ceil(gbList.length / BASE_SLICES);
  const baseRows = [];
  for (const [weight, ttf] of [[400, serif400Ttf], [600, serif600Ttf]]) {
    for (let index = 0; index < BASE_SLICES; index += 1) {
      const slice = gbList.slice(index * perSlice, (index + 1) * perSlice);
      if (slice.length === 0) continue;
      const name = `fx-serif-${weight}-base-${String(index + 1).padStart(2, "0")}.woff2`;
      const textPath = join(BUILD_DIR, `base-${weight}-${String(index + 1).padStart(2, "0")}.txt`);
      writeFileSync(textPath, slice.join(""));
      const outPath = join(OUT_DIR, name);
      subsetWoff2(ttf, textPath, outPath, { layoutFeatures: "kern,ccmp,locl", label: name });
      baseRows.push({ name, weight, textChars: slice.length, bytes: statSync(outPath).size, unicodeRange: unicodeRangeOf(slice) });
    }
  }
  const baseTotal = baseRows.reduce((sum, row) => sum + row.bytes, 0);
  console.log(`  ${baseRows.length} 片  ${human(baseTotal)}  ${COLORS.dim}预算 ${human(BASE_BUDGET_BYTES)}（按需加载，不计入首屏）${COLORS.reset}`);
  if (baseTotal > BASE_BUDGET_BYTES) fail(`GB2312 基线分片合计 ${human(baseTotal)}，超过预算 ${human(BASE_BUDGET_BYTES)}`);
  writeBaseCss(baseRows);

  writeFileSync(
    join(BUILD_DIR, "build-report.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        siteUrl: SITE_URL,
        totalBytes: total,
        budgetBytes: FONT_BUDGET_BYTES,
        baseTotalBytes: baseTotal,
        baseBudgetBytes: BASE_BUDGET_BYTES,
        baseFiles: baseRows.map((row) => ({ ...row, sha256: sha256(join(OUT_DIR, row.name)) })),
        files: rows.map((row) => ({ ...row, sha256: sha256(join(OUT_DIR, row.name)) })),
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`\n${COLORS.green}✓ 字体已生成：apps/web/public/fonts/（${human(total)} / 预算 ${human(FONT_BUDGET_BYTES)}）${COLORS.reset}`);
  console.log(`${COLORS.dim}  自测：node scripts/fonts/check-fonts.mjs`);
  console.log(`  浏览器自测见 docs/fonts.md${COLORS.reset}`);
}

try {
  await main();
} catch (error) {
  fail(error.stack ?? String(error));
}
