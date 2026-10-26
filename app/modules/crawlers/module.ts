// 抓取器模块的地址声明：一个后台页 + 它自己的 api 路径。
// 只在 site/modules/index.ts 里登记；模块自己的后端/网页分别在 server.ts / web.tsx。
import { defineModule } from "@aihot/contracts/modules";

export const crawlersModule = defineModule({
  name: "crawlers",
  adminPages: [{ path: "admin/crawlers", file: "web/admin-crawlers.tsx" }],
  // 让 web 进程把这些请求转给 api 进程（框架的 /api/* 已覆盖，这里写明模块自己的地址）。
  apiPaths: [/^\/api\/admin\/crawlers(?:\/|$)/],
});
