// 主题标的后端插口（site/modules/server.ts 安装）：只提供公司主题的标，
// 引擎把标叠在主题名首字的单色牌上（packages/backend/src/publication/topics.ts）。
// 图片在 apps/web/public/brand/topics/，由 web 进程当普通静态文件发。
import type { ServerModule } from "@aihot/backend/modules";
import { topicMarks } from "./marks.ts";

export const topicMarksServer: ServerModule = {
  name: "topic-marks",
  topics: {
    marks: async () => topicMarks(),
  },
};
