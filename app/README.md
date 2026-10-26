# 风向 · 全球企业服务资讯

> 状态：当前有效 · 最后核对：2026-10-26

**给全球企业服务从业者的 AI 时代资讯平台：把官方一手的变化整理成中文信息流与每日精选。**

风向把全球企业服务领域的官方一手发布收进来，整理成中文标题、摘要与时间线，每天编一期「每日精选」；读者可以按公司、方向与内容类型浏览，也可以把同一份数据接给 Agent（RSS / 公开 API / MCP）。

## 这是什么

- **只收官方一手**：公司博客、官方公告、产品与生态信息；当前版本不收媒体、分析与营销内容。
- **信息流为主入口**：全部动态按时间排列，支持厂商筛选；每日精选是第二层，不替读者下结论。
- **AI 主线**：AI 产品、Agent、Copilot、AI 原生应用与 AI 办公，同时保留传统企业软件的形态变化。
- **判断可选**：少数条目附「风向观察」，没有就不写；不承诺每条都有判断。
- **同一份数据多个出口**：网页、RSS、公开 API、MCP、Agent Markdown、`llms.txt` 都从同一个读取层输出。

## 技术栈

Node.js 24 · TypeScript · React Router（服务端渲染）· Fastify · PostgreSQL · pg-boss · Tailwind CSS · Docker Compose

## 本地运行

需要 Docker、Node.js 24，以及一个 OpenAI 兼容的模型 API Key（DeepSeek、千问、智谱等均可）。

```bash
# 在仓库的 app/ 目录执行
node scripts/init-env.ts --llm-key <你的模型 API Key>
docker compose up -d --build
```

打开 <http://localhost:3000>。后台在 `/admin`，管理员密码在 `.env` 的 `ADMIN_PASSWORD` 里。

- 模型与采集默认需要显式打开：`.env` 里的 `COLLECT_ENABLED`、`MODEL_CALLS_ENABLED` 设为 `true` 才会真实抓取和调用模型。开发调试时保持 `false`。
- 数据库、迁移、域名与 HTTPS、中国大陆部署、成本与备份，见 [部署文档](docs/deploy.md)。
- 只想跑测试时不需要模型 Key；测试库名必须以 `_test` 或 `_ci` 结尾。

## 目录

| 目录 | 内容 |
|---|---|
| `site/` | 站名与全站文案（`site.ts`）、品牌、发布在网站根目录的固定文件、更新日志 |
| `industry/` | 分类与标签（`taxonomy.ts`）、主题（`topics.json`）、示范信源（`sources.json`）、提示词（`prompts/`）、入选门槛（`selection.ts`） |
| `apps/` | `web` 读者面与后台、`api` 公开接口与 MCP、`worker` 采集与模型任务 |
| `packages/` | 后端领域代码、公开读取层、契约与站点配置 |
| `scripts/` | 初始化、采集/发布/出刊运维、字体、审计与自检脚本 |
| `docs/` | 框架文档：架构、部署、信源、精选、归组、后台等 |
| `modules/` | 本仓库启用的可插拔模块 |

## 文档

- **仓库说明与产品截图**：[`../README.md`](../README.md)
- **应用文档索引**：[`docs/`](docs/)（`admin-ui.md`、`sources.md` 由本站维护）
- **框架文档**：[架构](docs/architecture.md)、[部署](docs/deploy.md)、[信源](docs/sources.md)、[精选与校准](docs/selection.md)、[事件归组](docs/grouping.md)、[后台](docs/admin-ui.md)、[定制](docs/customize.md)

## 开发与验收

```bash
npm run typecheck
DATABASE_URL=postgres://127.0.0.1:5432/<名字>_test npm test
npm run build -w @aihot/web && node --test apps/web/tests/*.test.ts
node scripts/smoke.ts --base http://localhost:3000   # 站点跑起来后
```

改分类、标签、提示词或公开输出时，先读 `docs/architecture.md` 与相关文档；改动完成后同步更新对应的 `docs/` 文档。不要提交 `.env`、密钥或 `.data/`。

## 反馈与来源方请求

功能建议、内容更正、来源方更正与下架请求，请通过站内「反馈」页提交；安全问题的报告方式见 [SECURITY.md](../SECURITY.md)。

## 许可

本项目原创部分按仓库根 [LICENSE](../LICENSE) 的「学习使用许可（非商业）」授权，仅限个人学习、研究使用；上游 AIHOT 框架代码仍按 [MIT](LICENSE)。原始版权与第三方素材说明见 [NOTICE](NOTICE)；上游名称与 Logo 不在许可范围内，本站使用自己的名称与品牌。
