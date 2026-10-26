// 飞书「功能变化路径」外部采集器（task-21）。
//
// 这个帮助中心页面是纯前端渲染：正文只存在于内嵌 JSON（window._templateValue）的转义 HTML/纯文本里，
// 页面 DOM 没有可抽取的列表节点，所以普通 web_list 采集器抓不到。这里改成：自己拉页面 → 解码内嵌 JSON
// → 按「2026.10 更新」这类月份章节切分 → 走框架的外部推送接口（POST /api/ingest/items）。
//
// ingest 协议只收 title / url / publishedAt / author，不带正文；而这个页面后续也抓不出正文，
// 所以推完再用框架自己的 upsertMaterial 把章节纯文本补进同一条材料（body_status=ok），
// 否则分析步骤会因为「只有标题、没有正文」一直等待、不会进精选。两步都用框架既有入口，不改核心代码。
//
// 页面每条只写「发布于 YYYY/MM/DD」，没有时刻：这里只发日期（publication_time=YYYY-MM-DD），
// 不再把北京零点当成精确发布时间（2026-10-22 修）。
//
// 用法（在 app/ 目录）：
//   node --env-file=.env scripts/feishu-collect.ts                 # 推最近 3 个月章节
//   node --env-file=.env scripts/feishu-collect.ts --months=2     # 只推最近 2 个月
//   node --env-file=.env scripts/feishu-collect.ts --dry-run      # 只解析、不推送（不发网络写请求）
//   node --env-file=.env scripts/feishu-collect.ts --no-body      # 只走 ingest，不补正文
//
// 环境变量：INGEST_TOKEN（必填，.env）、INGEST_API_BASE（默认 http://127.0.0.1:3001）。
import { closeDb, sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { queueProcessing } from "@aihot/backend/jobs/content";
import { stopBoss } from "@aihot/backend/jobs/queue";

const PAGE_URL = "https://www.feishu.cn/hc/zh-CN/articles/360043073734";
const SOURCE_ID = "feishu-changelog";
const SOURCE_NAME = "飞书功能变化";
const AUTHOR = "飞书";
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const MAX_ITEMS = 50;
const MIN_TEXT_LENGTH = 500;

interface Entry {
  version: string | null;
  headline: string;
  product: string | null;
  description: string;
  publishedAt: string | null;
}

interface Section {
  /** "2026.10" */
  month: string;
  heading: string;
  entries: Entry[];
  /** 章节正文纯文本，作为这条材料的 bodyText。 */
  body: string;
  /** 章节里最新一条「发布于 YYYY/MM/DD」；源只给日期，没有时刻。 */
  latestPublishedDate: string;
}

interface Item {
  title: string;
  url: string;
  /** 源页面只写了日期（YYYY-MM-DD）：按日期精度保存，不把北京时间零点伪造成发布时刻。 */
  publishedDate: string;
  /** 日期在库里的锚点（该日 UTC 零点）：ingest 与 enrich 都用它，避免两次解析成不同 instant。 */
  publishedAnchor: string;
  author: string;
  /** 章节正文，只用于补 body，不发给 ingest。 */
  body: string;
  raw: Record<string, unknown>;
}

function args() {
  const argv = process.argv.slice(2);
  const value = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const months = Number(value("months") ?? 3);
  return {
    months: Number.isFinite(months) && months > 0 ? Math.min(months, 12) : 3,
    dryRun: argv.includes("--dry-run"),
    withBody: !argv.includes("--no-body"),
    apiBase: value("api") ?? process.env.INGEST_API_BASE ?? "http://127.0.0.1:3001",
  };
}

/** 从 `start` 之后的第一个 `{` 起，按 JSON 字符串规则做括号配对，返回解析后的对象。 */
function parseObjectAt(text: string, start: number): unknown {
  const begin = text.indexOf("{", start);
  if (begin < 0) throw new Error("内嵌 JSON 没有找到起始 {");
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = begin; i < text.length; i += 1) {
    const ch = text[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return JSON.parse(text.slice(begin, i + 1));
    }
  }
  throw new Error("内嵌 JSON 括号不配对");
}

/** 递归找带 html + text 的文章对象（text 里必须有「YYYY.MM 更新」章节）。 */
function findArticle(node: unknown): { text: string; html: string } | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findArticle(child);
      if (hit) return hit;
    }
    return null;
  }
  const record = node as Record<string, unknown>;
  const text = record.text;
  const html = record.html;
  if (typeof text === "string" && typeof html === "string" && text.length > MIN_TEXT_LENGTH && /^\d{4}\.\d{2} 更新$/m.test(text)) {
    return { text, html };
  }
  for (const child of Object.values(record)) {
    const hit = findArticle(child);
    if (hit) return hit;
  }
  return null;
}

/** 页面里 window._templateValue 是真正的文章数据；window._defaultTemplateValue 只是模板示例。 */
function extractArticleText(page: string): string {
  const candidates: string[] = [];
  for (const marker of ["window._templateValue", "window._defaultTemplateValue"]) {
    // 只认赋值语句（`window._templateValue = {`），它前面的运行时代码也会出现同一个标识符。
    const assignment = new RegExp(`${marker.replace(/\./g, "\\.")}\\s*=\\s*\\{`).exec(page);
    if (!assignment) continue;
    const article = findArticle(parseObjectAt(page, assignment.index));
    if (article) candidates.push(article.text);
  }
  const longest = candidates.sort((a, b) => b.length - a.length)[0];
  if (!longest) throw new Error("页面里没有找到内嵌的文章正文（window._templateValue）");
  return longest;
}

const MONTH_HEADING = /^(\d{4})\.(\d{2}) 更新$/;
const ENTRY_HEADING = /^\*\*\s*(?:(V\d[\w.]*)\s+)?(.+)$/;
const PUBLISHED = /^发布于\s*(\d{4})\/(\d{2})\/(\d{2})$/;

function parseSections(text: string): Section[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const starts: Array<{ index: number; year: string; month: string }> = [];
  lines.forEach((line, index) => {
    const m = MONTH_HEADING.exec(line);
    if (m) starts.push({ index, year: m[1]!, month: m[2]! });
  });
  const sections: Section[] = [];
  for (const [i, start] of starts.entries()) {
    const end = starts[i + 1]?.index ?? lines.length;
    const bodyLines = lines.slice(start.index + 1, end).filter((line) => line.length > 0);
    const entries: Entry[] = [];
    let current: Entry | null = null;
    let description: string[] = [];
    let date: string | null = null;
    let latest: string | null = null;
    const flush = () => {
      if (!current) return;
      current.description = description.join("\n").trim();
      current.publishedAt = date;
      entries.push(current);
      current = null;
      description = [];
      date = null;
    };
    for (const line of bodyLines) {
      const heading = ENTRY_HEADING.exec(line);
      if (heading) {
        flush();
        current = { version: heading[1] ?? null, headline: heading[2]!.trim(), product: null, description: "", publishedAt: null };
        continue;
      }
      const published = PUBLISHED.exec(line);
      if (published) {
        const iso = `${published[1]!}-${published[2]!}-${published[3]!}`;
        date = iso;
        if (!latest || iso > latest) latest = iso;
        continue;
      }
      if (!current) continue;
      if (current.product === null && !/^[。，,.;；]/.test(line)) {
        current.product = line;
        continue;
      }
      description.push(line);
    }
    flush();
    const month = `${start.year}.${start.month}`;
    sections.push({
      month: `${start.year}-${start.month}`,
      heading: lines[start.index]!,
      entries,
      // 保留每条的「Vx.y 标题」行，只去掉 Markdown 粗体星号。
      body: bodyLines.map((line) => line.replace(/^\*+\s*/, "")).join("\n").trim(),
      latestPublishedDate: latest ?? `${start.year}-${start.month}-01`,
    });
  }
  return sections;
}

function cleanHeadline(headline: string): string {
  return headline.replace(/[！!。]+$/u, "").replace(/\s+/g, " ").trim();
}

function toItem(section: Section): Item {
  const [year, month] = section.month.split("-") as [string, string];
  const first = section.entries[0];
  const headline = first ? `${first.version ? `${first.version} ` : ""}${cleanHeadline(first.headline)}` : "功能更新";
  const title = `飞书 ${year}.${month} 功能更新：${headline}`.slice(0, 120);
  return {
    title,
    // 框架按去掉 hash 的 URL 判重，纯 #锚点会让所有月份撞成同一条；用查询参数保证每条唯一，
    // 同时保留 #update-YYYY-MM 方便人直接定位。页面本身忽略这个参数，不会 404。
    url: `${PAGE_URL}?update=${section.month}#update-${section.month}`,
    publishedDate: section.latestPublishedDate,
    publishedAnchor: new Date(`${section.latestPublishedDate}T00:00:00.000Z`).toISOString(),
    author: AUTHOR,
    body: section.body,
    raw: {
      _aihot: {},
      section: section.month,
      entries: section.entries.map((entry) => ({
        version: entry.version,
        headline: entry.headline,
        product: entry.product,
        publishedAt: entry.publishedAt,
      })),
    },
  };
}

async function fetchPage(): Promise<string> {
  const response = await fetch(PAGE_URL, {
    headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`拉取页面失败：HTTP ${response.status}`);
  const html = await response.text();
  if (html.length < 100_000) throw new Error(`页面只有 ${html.length} 字节，可能被反爬或改版`);
  return html;
}

async function push(items: Item[], apiBase: string): Promise<{ ok: true; created: number }> {
  const token = process.env.INGEST_TOKEN?.trim();
  if (!token) throw new Error("缺少 INGEST_TOKEN（.env）");
  const response = await fetch(`${apiBase.replace(/\/$/, "")}/api/ingest/items`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    // ingest 只认这四个字段，正文不发给它，随后用 upsertMaterial 补。
    // 页面的「发布于 YYYY/MM/DD」只给日期：发日期字符串，框架会按日期精度入库（不编造时刻）。
    body: JSON.stringify({
      sourceId: SOURCE_ID,
      sourceName: SOURCE_NAME,
      items: items.map(({ title, url, publishedDate, author }) => ({ title, url, publishedAt: publishedDate, author })),
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = (await response.json().catch(() => null)) as { ok?: boolean; created?: number; message?: string } | null;
  if (!response.ok || !body?.ok) throw new Error(`ingest 失败：HTTP ${response.status} ${body?.message ?? ""}`);
  return { ok: true, created: body.created ?? 0 };
}

/** ingest 协议不带正文，这里把章节纯文本补进同一条材料，让后续分析有内容可读。 */
async function enrich(items: Item[]) {
  let revised = 0;
  let unchanged = 0;
  for (const item of items) {
    const result = await upsertMaterial({
      sourceId: SOURCE_ID,
      url: item.url,
      title: item.title,
      author: item.author,
      publishedAt: new Date(item.publishedAnchor),
      publicationTime: item.publishedDate,
      bodyText: item.body,
      bodyStatus: "ok",
      via: "ingest",
      raw: item.raw,
    });
    if (result.created || result.revised || result.processingNeeded) {
      revised += 1;
      await queueProcessing(result.articleId);
    } else unchanged += 1;
  }
  return { revised, unchanged };
}

/**
 * 修旧数据（2026-10-22 前）：本脚本曾把「发布于 YYYY/MM/DD」转成北京零点并记成精确时刻。
 * 只改本脚本自己的源：URL 对得上、当前记的是精确 ISO、published_at 恰好是北京零点——三点同时成立时，
 * 那个时刻只能来自日期转换，改回日期精度；真正带时刻的行不动。
 */
async function repairDatePrecision(items: Item[]) {
  let repaired = 0;
  for (const item of items) {
    const rows = await sql`
      UPDATE articles SET publication_time = ${item.publishedDate}
      WHERE source_id = ${SOURCE_ID} AND url = ${item.url}
        AND publication_time ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
        AND published_at = ${`${item.publishedDate} 00:00:00+08`}::timestamptz
      RETURNING id`;
    repaired += rows.length;
  }
  return repaired;
}

const options = args();
const page = await fetchPage();
const text = extractArticleText(page);
const all = parseSections(text);
const sections = all.slice(0, options.months);
if (sections.length === 0) throw new Error("没有解析出任何「YYYY.MM 更新」章节");
const items = sections.map(toItem);
if (items.length > MAX_ITEMS) throw new Error(`一次最多推 ${MAX_ITEMS} 条，解析出 ${items.length} 条`);

console.log(JSON.stringify({
  parsedSections: all.map((s) => s.month),
  pushing: items.map((i) => ({ month: i.raw.section, title: i.title, publishedDate: i.publishedDate, bodyChars: i.body.length, bodyHead: i.body.slice(0, 60) })),
  dryRun: options.dryRun,
}, null, 2));
if (options.dryRun) process.exit(0);

const pushed = await push(items, options.apiBase);
console.log(JSON.stringify({ ingest: pushed, sourceId: SOURCE_ID }));
const repaired = await repairDatePrecision(items);
if (repaired) console.log(JSON.stringify({ repairedDatePrecision: repaired }));
if (options.withBody) {
  console.log(JSON.stringify({ body: await enrich(items) }));
  // 第一次推送时外部源是 isolated，材料会被标成 skipped；运营改成 editorial 后需要重新排队分析。
  const skipped = await sql<{ id: string }[]>`
    SELECT id FROM articles WHERE source_id = ${SOURCE_ID} AND processing_state = 'skipped' AND body_status = 'ok'
    ORDER BY published_at DESC NULLS LAST LIMIT 100`;
  for (const row of skipped) await queueProcessing(row.id);
  console.log(JSON.stringify({ requeued: skipped.length }));
}

// 新源默认 isolated：只有改成 editorial 才进公开页面与精选。配置由运营一次性决定，脚本不替它改。
const [source] = await sql<{ participation_mode: string; tier: string }[]>`
  SELECT participation_mode, tier FROM sources WHERE id = ${SOURCE_ID}`;
console.log(JSON.stringify(source?.participation_mode === "editorial"
  ? { source: `${SOURCE_ID}: ${source.tier}/${source.participation_mode}`, ready: true }
  : {
      source: `${SOURCE_ID}: ${source?.tier ?? "?"}/${source?.participation_mode ?? "missing"}`,
      next: `首次推送后执行：psql -h 127.0.0.1 -U <数据库用户名> -d aihot -c "UPDATE sources SET participation_mode='editorial' WHERE id='${SOURCE_ID}'"`,
    }));

await stopBoss();
await closeDb();
