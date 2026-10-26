// 飞书「功能变化路径」抓取模板。
//
// 这个帮助中心页面是纯前端渲染：正文只存在于内嵌 JSON（window._templateValue）的转义 HTML/纯文本里，
// 页面 DOM 没有可抽取的列表节点，普通 web_list 采集器抓不到。Tier 0 自己拉页面 → 解码内嵌 JSON →
// 按「2026.10 更新」这类月份章节切分，产出要推进 ingest 的条目。
//
// 解析函数从 scripts/feishu-collect.ts 搬过来（脚本本身保留，供一次性/调试用）；区别是这里不写数据库，
// 只负责「拿到条目」，推送由 runner.ts 走框架的 ingest。页面地址和「抓最近几个月」是模板参数，
// 由后台的抓取器实例传入（见 templates.ts）。
import type { Adapter } from "../lib/chain.ts";
import type { AdapterTemplate } from "../templates.ts";

const DEFAULT_URL = "https://www.feishu.cn/hc/zh-CN/articles/360043073734";
const AUTHOR = "飞书";
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const MAX_ITEMS = 50;
const MIN_TEXT_LENGTH = 500;
/** 默认只推最近 3 个月；由抓取器实例的 months 参数覆盖。 */
const DEFAULT_MONTHS = 3;

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
  /** 章节正文纯文本；本轮 MVP 只把它放在适配器结果里，ingest 协议不接收正文。 */
  body: string;
  /** 章节里最新一条「发布于 YYYY/MM/DD」；源只给日期，没有时刻，按日期精度入库。 */
  latestPublishedDate: string;
}

/** 适配器产出的一条：与 ingest 的 items[] 同形，另带 body 供以后补正文。 */
export interface FeishuItem {
  title: string;
  url: string;
  /** 源页面只写了日期（YYYY-MM-DD）：ingest 按日期精度保存，不把零点伪造成发布时刻。 */
  publishedAt: string;
  author: string;
  body: string;
  raw: Record<string, unknown>;
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

function toItem(section: Section, pageUrl: string): FeishuItem {
  const [year, month] = section.month.split("-") as [string, string];
  const first = section.entries[0];
  const headline = first ? `${first.version ? `${first.version} ` : ""}${cleanHeadline(first.headline)}` : "功能更新";
  const title = `飞书 ${year}.${month} 功能更新：${headline}`.slice(0, 120);
  return {
    title,
    // 框架按去掉 hash 的 URL 判重，纯 #锚点会让所有月份撞成同一条；用查询参数保证每条唯一，
    // 同时保留 #update-YYYY-MM 方便人直接定位。页面本身忽略这个参数，不会 404。
    url: `${pageUrl}?update=${section.month}#update-${section.month}`,
    publishedAt: section.latestPublishedDate,
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

async function fetchPage(pageUrl: string): Promise<string> {
  const response = await fetch(pageUrl, {
    headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`拉取页面失败：HTTP ${response.status}`);
  const html = await response.text();
  if (html.length < 100_000) throw new Error(`页面只有 ${html.length} 字节，可能被反爬或改版`);
  return html;
}

/** Tier 0：拉页面 + 解析内嵌 JSON + 切月份章节。 */
async function embeddedJson(pageUrl: string, months: number): Promise<FeishuItem[]> {
  const page = await fetchPage(pageUrl);
  const text = extractArticleText(page);
  const sections = parseSections(text).slice(0, months);
  if (sections.length === 0) throw new Error("没有解析出任何「YYYY.MM 更新」章节");
  const items = sections.map((section) => toItem(section, pageUrl));
  if (items.length > MAX_ITEMS) throw new Error(`一次最多推 ${MAX_ITEMS} 条，解析出 ${items.length} 条`);
  return items;
}

const ABOUT = "飞书帮助中心「功能变化路径」：正文只在页面内嵌 JSON 里，按「YYYY.MM 更新」章节切分后推送。";

export const feishuChangelog: AdapterTemplate = {
  id: "feishu-changelog",
  name: "飞书功能变化",
  about: ABOUT,
  url: DEFAULT_URL,
  sourceId: "feishu-changelog",
  unit: "条",
  tiers: [
    { name: "Tier 0 · 内嵌 JSON", available: true, note: "自己拉页面，解码 window._templateValue，按「YYYY.MM 更新」章节切分" },
    { name: "Tier 1 · 内部导出 API / 浏览器", available: false, note: "内部导出接口或浏览器渲染；尚未实现" },
  ],
  fields: [{ key: "months", label: "抓最近几个月", kind: "number", value: String(DEFAULT_MONTHS), min: 1, max: 12 }],
  config(input) {
    const raw = (input ?? {}) as Record<string, unknown>;
    const months = Number(raw.months ?? DEFAULT_MONTHS);
    if (!Number.isInteger(months) || months < 1 || months > 12) {
      throw Object.assign(new Error("「抓最近几个月」必须是 1–12 的整数。"), { statusCode: 400 });
    }
    return { months };
  },
  build(row) {
    const months = Number(row.config.months ?? DEFAULT_MONTHS);
    const adapter: Adapter<FeishuItem[]> = {
      id: row.id,
      name: row.name,
      description: ABOUT,
      sourceId: row.source_id,
      sourceName: row.source_name ?? row.name,
      unit: "条",
      tiers: [
        {
          name: "Tier 0 · 内嵌 JSON",
          available: true,
          note: "自己拉页面，解码 window._templateValue，按「YYYY.MM 更新」章节切分",
          run: () => embeddedJson(row.url, months),
        },
        {
          name: "Tier 1 · 内部导出 API / 浏览器",
          available: false,
          note: "内部导出接口或浏览器渲染；尚未实现，命中这一层的条目会标「降级未启用」",
          run: async () => {
            throw new Error("Tier 1 未实现（内部导出 API / 浏览器）");
          },
        },
      ],
      toCrawlResult: (items) => ({ items, observed: items.length, unit: "条" }),
    };
    return adapter as Adapter<unknown>;
  },
};
