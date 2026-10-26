// 主题的公司标：按主题 slug 给图，画在引擎的单色牌（主题名首字）之上。
// 图片在 apps/web/public/brand/topics/，随网页发；这里只给路径和画的参数。
// 标只用来识别，不构成背书；没有标的主题仍用引擎的单色牌。
import type { Brand } from "@aihot/contracts/site";

const MARKS: Record<string, Brand> = {
  // 国内厂商：官方标（飞书用字节自家 Semi 图标库的单色蓝标，透明底）。
  feishu: { src: "/brand/topics/feishu.svg", monogram: "飞", raster: false },
  wecom: { src: "/brand/topics/wecom.png", monogram: "企", raster: true },
  dingtalk: { src: "/brand/topics/dingtalk.svg", monogram: "钉", raster: false },
  wps: { src: "/brand/topics/wps.png", monogram: "金", raster: true },
  yonyou: { src: "/brand/topics/yonyou.png", monogram: "用", raster: true },
  kingdee: { src: "/brand/topics/kingdee.png", monogram: "金", raster: true },
  // 海外厂商：矢量标（透明的方形图标）。
  slack: { src: "/brand/topics/slack.svg", monogram: "S", raster: false },
  notion: { src: "/brand/topics/notion.svg", monogram: "N", raster: false, invertOnDark: true },
  salesforce: { src: "/brand/topics/salesforce.png", monogram: "S", raster: true },
  "microsoft-365": { src: "/brand/topics/microsoft-365.svg", monogram: "M", raster: false },
  "google-workspace": { src: "/brand/topics/google-workspace.svg", monogram: "G", raster: false },
  monday: { src: "/brand/topics/monday.png", monogram: "M", raster: false },
  asana: { src: "/brand/topics/asana.svg", monogram: "A", raster: false },
  atlassian: { src: "/brand/topics/atlassian.svg", monogram: "A", raster: false },
  zoom: { src: "/brand/topics/zoom.svg", monogram: "Z", raster: false },
  hubspot: { src: "/brand/topics/hubspot.svg", monogram: "H", raster: false },
  // AI 公司：矢量标。Google AI 用 Gemini 的星标（主题定义就是 Gemini / DeepMind），
  // 与 Google Workspace 的四色 G 区分开。
  openai: { src: "/brand/topics/openai.svg", monogram: "O", raster: false, invertOnDark: true },
  anthropic: { src: "/brand/topics/anthropic.svg", monogram: "A", raster: false, invertOnDark: true },
  cursor: { src: "/brand/topics/cursor.svg", monogram: "C", raster: false, invertOnDark: true },
  replit: { src: "/brand/topics/replit.svg", monogram: "R", raster: false },
  vercel: { src: "/brand/topics/vercel.png", monogram: "V", raster: true },
  zapier: { src: "/brand/topics/zapier.svg", monogram: "Z", raster: false },
  "google-ai": { src: "/brand/topics/google-ai.svg", monogram: "G", raster: false },
  // DSH 是 DeepSeek Harness 的应用图标（位图，需要浅色底衬）；DeepSeek 用 Simple Icons 的鲸鱼标。
  dsh: { src: "/brand/topics/dsh.png", monogram: "D", raster: true },
  deepseek: { src: "/brand/topics/deepseek.svg", monogram: "D", raster: false },
};

/** 按主题 slug 取标；目录里没有的主题由引擎的单色牌兜底。 */
export function topicMarks(): Record<string, Brand> {
  return MARKS;
}
