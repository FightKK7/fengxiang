#!/usr/bin/env node
/**
 * 风向 · 报头字标字体子集（京華老宋体 → fx-wordmark.woff2）
 *
 * 报头「风向」与副题（全球企业服务资讯）共用一个独立的显示字面，和标题的思源宋体分开：
 * 标题要继续当正文用（全站字符 + 600 字重），报头要的是「一眼认得出的报纸刊头」。
 *
 * 用法（在 app/ 下，需要 python3 + fonttools + brotli）：
 *   node scripts/fonts/build-wordmark.mjs
 *
 * 做的事：
 *   1) 下载源字体到 app/.font-src/（已存在则校验 sha256 后复用）
 *   2) pyftsubset 只保留报头用字（字标 + 副题），输出 woff2
 *   3) 校验输出：cmap 必须正好是这批字，内部名称保留原样
 *
 * 源字体不进 git；许可与来源见 apps/web/public/fonts/KingHwa-OldSong-NOTICE.md。
 * 报头样式在 app/fengxiang.css 的 .fx-wordmark / .fx-mobile-wordmark / .fx-wordmark-mini。
 */

import { execFileSync as run } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(HERE, "../..");
const CACHE_DIR = join(APP_ROOT, ".font-src");
const OUT_FILE = join(APP_ROOT, "apps/web/public/fonts/fx-wordmark.woff2");
const PYTHON = process.env.FX_PYTHON3 ?? "python3";
const PYFTSUBSET = process.env.FX_PYFTSUBSET ?? "pyftsubset";

/** 报头字标 + 副题共用这个显示字面。改文案时同步改这里、fx-fonts.css 的 unicode-range 和 docs/fonts.md。 */
const WORDMARK_TEXT = "风向全球企业服务资讯";
const EXPECTED_CODEPOINTS = [...WORDMARK_TEXT].map((ch) => ch.codePointAt(0)).sort((a, b) => a - b);

const SOURCE = {
  label: "京華老宋体 v2.002（特里王）",
  file: "KingHwa-OldSong-v2.002.ttf",
  url: "https://raw.githubusercontent.com/KonghaYao/chinese-free-web-font-storage/branch/packages/jhlst/fonts/%E4%BA%AC%E8%8F%AF%E8%80%81%E5%AE%8B%E4%BD%93v2.002.ttf",
  sha256: "35d92af5ac4e9485e8e7749098e67211da5885d2697d95aea979fe4acd19ee2a",
  bytes: 36_587_506,
};

const COLORS = process.stdout.isTTY
  ? { dim: "\u001b[2m", bold: "\u001b[1m", green: "\u001b[32m", red: "\u001b[31m", reset: "\u001b[0m" }
  : { dim: "", bold: "", green: "", red: "", reset: "" };
const human = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

function fail(message) {
  console.error(`${COLORS.red}✗ ${message}${COLORS.reset}`);
  process.exit(1);
}

async function downloadSource() {
  const target = join(CACHE_DIR, SOURCE.file);
  if (existsSync(target) && statSync(target).size === SOURCE.bytes && sha256(target) === SOURCE.sha256) {
    console.log(`  ${COLORS.dim}复用源字体缓存 ${target}${COLORS.reset}`);
    return target;
  }
  mkdirSync(CACHE_DIR, { recursive: true });
  console.log(`  下载 ${SOURCE.label} → ${target}`);
  const res = await fetch(SOURCE.url, { signal: AbortSignal.timeout(300_000) });
  if (!res.ok) fail(`下载源字体失败：HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.byteLength !== SOURCE.bytes) fail(`源字体大小不符：${bytes.byteLength} ≠ ${SOURCE.bytes}`);
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== SOURCE.sha256) fail(`源字体 sha256 不符：${digest} ≠ ${SOURCE.sha256}`);
  const { writeFileSync } = await import("node:fs");
  writeFileSync(target, bytes);
  return target;
}

/** 用 fonttools 读子集：cmap 必须正好是「风向」，名称必须保留原样。 */
function inspectSubset(file) {
  const program = [
    "import json, sys",
    "from fontTools.ttLib import TTFont",
    "font = TTFont(sys.argv[1])",
    "print(json.dumps({",
    "  'codepoints': sorted(font.getBestCmap() or {}),",
    "  'glyphs': len(font.getGlyphOrder()),",
    "  'family': font['name'].getDebugName(1),",
    "  'subfamily': font['name'].getDebugName(2),",
    "}))",
  ].join("\n");
  return JSON.parse(run(PYTHON, ["-c", program, file], { encoding: "utf8" }));
}

async function main() {
  console.log(`${COLORS.bold}风向 · 报头字标子集${COLORS.reset}  ${COLORS.dim}${SOURCE.label}${COLORS.reset}`);
  const source = await downloadSource();

  run(PYFTSUBSET, [
    source,
    `--text=${WORDMARK_TEXT}`,
    "--flavor=woff2",
    `--output-file=${OUT_FILE}`,
    "--layout-features=",
    "--no-hinting",
  ], { stdio: "pipe" });

  const info = inspectSubset(OUT_FILE);
  if (JSON.stringify(info.codepoints) !== JSON.stringify(EXPECTED_CODEPOINTS)) {
    fail(`子集码点不对：${info.codepoints.map((cp) => `U+${cp.toString(16).toUpperCase()}`).join(" ")}；应为 ${EXPECTED_CODEPOINTS.map((cp) => `U+${cp.toString(16).toUpperCase()}`).join(" ")}`);
  }
  if (!String(info.family ?? "").startsWith("KingHwa_OldSong")) fail(`子集内部 family 变了：「${info.family}」——保留原名，不要把 CSS 别名写进字体`);
  const bytes = statSync(OUT_FILE).size;
  console.log(`  ${COLORS.green}✓${COLORS.reset} ${OUT_FILE.replace(APP_ROOT + "/", "")}  ${info.glyphs} 字形  ${human(bytes)}  ${COLORS.dim}sha256 ${sha256(OUT_FILE).slice(0, 12)}${COLORS.reset}`);
  console.log(`  ${COLORS.dim}许可：作者声明免费商用，见 apps/web/public/fonts/KingHwa-OldSong-NOTICE.md${COLORS.reset}`);
  console.log(`  ${COLORS.dim}自测：node scripts/fonts/check-fonts.mjs（需要 dev server 在 ${process.env.FX_SITE_URL ?? "http://127.0.0.1:3000"}）${COLORS.reset}`);
}

try {
  await main();
} catch (error) {
  fail(`生成失败：${error.stderr?.toString().trim() || error.message}`);
}
