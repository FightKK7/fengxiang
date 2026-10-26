// 时间线来源行的公司标。与 modules/topic-marks/marks.ts 是同一份图片（apps/web/public/brand/topics/），
// 那边是给主题页用的后端插口，这里在 web 端按 sources.owner_entity_id 直接查。
// 新增或替换图标时两处一起改。
import type { Brand } from "@aihot/contracts/site";

const MARKS: Record<string, Brand> = {
  feishu: { src: "/brand/topics/feishu.svg", monogram: "飞", raster: false },
  wecom: { src: "/brand/topics/wecom.png", monogram: "企", raster: true },
  dingtalk: { src: "/brand/topics/dingtalk.svg", monogram: "钉", raster: false },
  wps: { src: "/brand/topics/wps.png", monogram: "金", raster: true },
  yonyou: { src: "/brand/topics/yonyou.png", monogram: "用", raster: true },
  kingdee: { src: "/brand/topics/kingdee.png", monogram: "金", raster: true },
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
  openai: { src: "/brand/topics/openai.svg", monogram: "O", raster: false, invertOnDark: true },
  anthropic: { src: "/brand/topics/anthropic.svg", monogram: "A", raster: false, invertOnDark: true },
  cursor: { src: "/brand/topics/cursor.svg", monogram: "C", raster: false, invertOnDark: true },
  replit: { src: "/brand/topics/replit.svg", monogram: "R", raster: false },
  vercel: { src: "/brand/topics/vercel.png", monogram: "V", raster: true },
  zapier: { src: "/brand/topics/zapier.svg", monogram: "Z", raster: false },
  "google-ai": { src: "/brand/topics/google-ai.svg", monogram: "G", raster: false },
  dsh: { src: "/brand/topics/dsh.png", monogram: "D", raster: true },
  deepseek: { src: "/brand/topics/deepseek.svg", monogram: "D", raster: false },
};

/** 按 sources.owner_entity_id 取公司标；没有对应标的来源只显示来源名。 */
export function brandMark(entityId: string | null | undefined): Brand | null {
  return entityId ? MARKS[entityId] ?? null : null;
}
