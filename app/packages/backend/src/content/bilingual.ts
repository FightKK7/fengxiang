// 原文／译文逐块对照的 HTML。读取层只在已有译文时拼装它，读者打开页面不翻译、不调模型；
// 译文是 worker 提前写好存进 translations 的成品，这里只做配对与去重。
//
// 译文的结构由 translate.ts 保证与原文一致（逐块替换同一份正文后重新清洗），所以按顶层块逐一配对：
// 每块原文后面紧跟同一块的译文。译文块里的图片/视频已经在原文块出现过，去掉，避免同图出现两次；
// 没有文字差异的块（代码、纯图片、漏译保留下来的原文）不再重复出一次译文。
// 顶层结构对不上（数量或标签不同）时返回 null，让读取层退回原来的单语输出，不硬拼。
import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import type { OutlineEntry } from "@aihot/contracts/site";

export interface BilingualBody {
  html: string;
  outline: OutlineEntry[];
}

const HEADING = /^h([2-4])$/;
const MEDIA = "img, picture, video, source";

/** 正文的顶层块（sanitizeBody 之后正文是扁平的块序列，块之间只有空白文本节点）。 */
function blocks($: cheerio.CheerioAPI): Element[] {
  return $.root().children().toArray().filter((node): node is Element => node.type === "tag");
}

function collapsed(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * 逐块对照。`translationHtml` 的顶层块结构必须与 `originalHtml` 一致，否则返回 null。
 * 标题块（h2–h4）的 id 放在配对容器上，目录锚点跳到的是一整对原文＋译文。
 */
export function bilingualBody(originalHtml: string, translationHtml: string): BilingualBody | null {
  const original = cheerio.load(originalHtml, null, false);
  const translation = cheerio.load(translationHtml, null, false);
  const originals = blocks(original);
  const translations = blocks(translation);
  if (!originals.length || originals.length !== translations.length) return null;
  if (originals.some((el, i) => el.name !== translations[i]!.name)) return null;

  const parts: string[] = [];
  const outline: OutlineEntry[] = [];
  for (const [i, source] of originals.entries()) {
    const translated = translations[i]!;
    const level = HEADING.exec(source.name)?.[1];
    const id = level ? `sec-${outline.length + 1}` : null;
    const originalText = collapsed(original(source).text());
    parts.push(`<div class="fx-pair"${id ? ` id="${id}"` : ""}>${original.html(source)}`);

    // 克隆译文块再删媒体：媒体已经在上面那块原文里展示过一次。
    const zh = cheerio.load(translation.html(translated)!, null, false);
    zh(MEDIA).remove();
    const translatedText = collapsed(zh.root().text());
    const html = zh.html();
    const paired = html.trim() !== "" && translatedText !== "" && translatedText !== originalText;
    if (paired) parts.push(`<div class="fx-tr" lang="zh">${html}</div>`);
    parts.push("</div>");

    if (level) {
      const text = translatedText || originalText;
      if (text) outline.push({ id: id!, text: text.slice(0, 80), level: Number(level) });
    }
  }
  return { html: parts.join(""), outline };
}
