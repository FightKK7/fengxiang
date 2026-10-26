// 抓取器模块的网页插口：在后台「内容」组的「信源」后加一个「抓取器」入口，红点数是最近一次运行
// 失败的适配器数（server.ts 的 admin.counts）。页面本体在 web/admin-crawlers.tsx，由 module.ts 登记。
import { defineWebModule } from "@aihot/web/modules";

export const crawlersWeb = defineWebModule({
  name: "crawlers",
  admin: {
    content: [{ to: "/admin/crawlers", label: "专用抓取", count: "crawlers", tone: "bad" }],
  },
});
