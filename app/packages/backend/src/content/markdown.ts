import * as cheerio from "cheerio";
import { marked } from "marked";
import TurndownService from "turndown";
import { stripTags } from "../lib/text.ts";
import { sanitizeBody, trimTrailingChrome } from "./sanitize.ts";

const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-" });
// Markdown has no equivalent for these structures; the HTML has already been sanitised.
turndown.keep(["sup", "sub", "u", "mark", "dl", "video"]);
turndown.addRule("strikethrough", { filter: ["del", "s"], replacement: (content) => `~~${content}~~` });
turndown.addRule("table", {
  filter: "table",
  replacement: (_content, node) => {
    const html = (node as unknown as { outerHTML: string }).outerHTML;
    const $ = cheerio.load(html, null, false);
    const table = $("table").first();
    const rows = table.find("tr").toArray();
    if (!rows.length) return `\n\n${html}\n\n`;
    const width = $(rows[0]!).children("th, td").length;
    // GFM cannot express merged cells, missing headings or blocks inside a cell faithfully.
    const complex = table.find("table, [rowspan], [colspan], pre, ul, ol, dl").length > 0 ||
      !width || $(rows[0]!).children("th").length !== width ||
      rows.some((row) => $(row).children("th, td").length !== width);
    if (complex) return `\n\n${html}\n\n`;
    const cells = (row: (typeof rows)[number]) => $(row).children("th, td").toArray().map((cell) =>
      turndown.turndown($(cell).html() ?? "").trim().replace(/\|/g, "\\|").replace(/\s*\n\s*/g, "<br>"));
    const line = (values: string[]) => `| ${values.join(" | ")} |`;
    const align = $(rows[0]!).children("th").toArray().map((cell) => {
      const value = $(cell).attr("align");
      return value === "right" ? "---:" : value === "center" ? ":---:" : value === "left" ? ":---" : "---";
    });
    const caption = table.children("caption").html();
    return `\n\n${caption ? `${turndown.turndown(caption)}\n\n` : ""}${[line(cells(rows[0]!)), line(align), ...rows.slice(1).map((row) => line(cells(row)))].join("\n")}\n\n`;
  },
});

/** Export the same safe body as the web and RSS without flattening its structure. */
export function bodyToMarkdown(html: string, baseUrl?: string): string {
  return turndown.turndown(sanitizeBody(html, baseUrl)).trim();
}

/** Jina returns page Markdown, which can include the publisher's navigation and recommendations. */
export function markdownBody(markdown: string, url: string): string {
  const page = new URL(url);
  const openaiArticle = page.hostname === "openai.com" && page.pathname.startsWith("/index/");
  if (openaiArticle) {
    // Reader splits an italic caption around its link; the invisible window hint makes its
    // adjacent underscores intraword delimiters. Join the caption without changing the link.
    markdown = markdown.replace(/_\[_([^\]\n]+?)_([\u2060\s]*\(opens in a new window\))\]\((https?:\/\/[^\s)]+)\)_/g, " [$1$2]($3)");
  }
  let html = marked.parse(markdown, { async: false, gfm: true });
  if (openaiArticle) {
    const $ = cheerio.load(html, null, false);
    const title = $("h1").first();
    // OpenAI's rendered pages put desktop/mobile navigation before the article's H1.
    if (title.length) title.prevAll().remove();
    // Both responsive copies of the article TOC consist entirely of links to this page's anchors.
    $("ul").filter((_, list) => {
      const links = $(list).find("a");
      return links.length > 0 && !$(list).clone().find("a").remove().end().text().trim()
        && links.toArray().every((link) => {
          const target = URL.parse($(link).attr("href") ?? "", url);
          if (!target) return false;
          return target.origin === page.origin && target.pathname === page.pathname && !!target.hash;
        });
    }).each((_, list) => {
      const previous = $(list).prev("p");
      if (previous.text().trim() === $(list).find("a").first().text().trim()) previous.remove();
      $(list).remove();
    });
    // Keep author and evaluation notes; the following section is the site's recommendation feed.
    const footer = $("h2, h3").filter((_, h) => /^(?:Keep reading|Continue reading)$/i.test($(h).text().trim())).first();
    if (footer.next().find('a[href="https://openai.com/news/"]').length) {
      footer.nextAll().remove();
      footer.remove();
    }
    html = $.html();
  }
  return trimTrailingChrome(sanitizeBody(html, url));
}

/**
 * A publisher's own Markdown export of one item (`<item url>/markdown`，例如 AIHOT 站点的
 * `/items/<id>/markdown`）：标题、几行元信息，然后 `## 摘要` / `## 推荐理由` /
 * `## 正文 · 中文译文` / `## 正文 · 原文`。取正文那两节，优先用来源已经翻好的中文正文
 * （站内直接显示，不再花模型调用翻译）；没有中文才用原文。
 * Returns null when the export has no usable body section.
 */
export function markdownExportBody(markdown: string, url: string): { html: string; text: string } | null {
  const sections = new Map<string, string>();
  let heading: string | null = null;
  let lines: string[] = [];
  const flush = () => {
    if (heading) sections.set(heading, lines.join("\n").trim());
    lines = [];
  };
  for (const line of markdown.split(/\r?\n/)) {
    const match = /^##\s+(.+?)\s*$/.exec(line);
    if (match) {
      flush();
      heading = match[1]!.trim();
    } else if (heading) {
      lines.push(line);
    }
  }
  flush();
  const pick = (...names: string[]) => {
    for (const name of names) {
      const value = sections.get(name);
      if (value && value.length >= 50) return value;
    }
    return null;
  };
  const zh = pick("正文 · 中文译文", "正文", "中文译文");
  const original = pick("正文 · 原文", "原文");
  const body = zh ?? original;
  if (!body) return null;
  // CommonMark 的强调定界规则按西文标点写：`**…。**据` 这种「句末标点 + 中文」收尾不会被解析成
  // 加粗，`**` 会原样留在正文里（来源的 Markdown 导出常见）。这里去掉残留的星号，宁可少一处粗体。
  const parsed = String(marked.parse(body, { async: false, gfm: true })).replace(/\*\*/g, "");
  const html = trimPublisherChrome(trimTrailingChrome(sanitizeBody(parsed, url)));
  const text = stripTags(html);
  return text.length >= 200 ? { html, text } : null;
}

/**
 * 来源把发布页的页头与推广框也翻进了正文（作者头像、日期、「没有炒作的 AI 新闻…订阅」、来源行）。
 * 只去掉两类最明显的：开头的「只有图片」「只有日期」「跳转到内容」块，以及结尾的推广/来源块。
 * 判定保守：结尾块必须很短且命中明显的推广词，避免误删真正的正文段落。
 */
export function trimPublisherChrome(html: string): string {
  const $ = cheerio.load(html, null, false);
  const root = $.root();
  const blocks = () => root.children().toArray();
  for (;;) {
    const first = blocks()[0];
    if (!first) break;
    const $first = $(first);
    const text = $first.text().trim();
    const imageOnly = $first.find("img").length > 0 && text === "";
    const dateOnly = /^\d{4}年\d{1,2}月\d{1,2}日$/.test(text);
    const skipLink = text === "跳转到内容";
    if (!imageOnly && !dateOnly && !skipLink) break;
    $first.remove();
  }
  const PROMO = /(THE DECODER|没有炒作的 AI 新闻|AI Radar|原文版权归|^来源[：:]|来源[：:]\s*$)/;
  for (;;) {
    const all = blocks();
    const last = all[all.length - 1];
    if (!last) break;
    const $last = $(last);
    const text = $last.text().trim();
    if (!text || text.length > 300 || !PROMO.test(text)) break;
    $last.remove();
  }
  return root.html() ?? html;
}

