# 风向应用

简体中文 | [English](README.en.md)

> 状态：当前有效 · 最后核对：2026-10-29

本目录包含风向的网页、后台、API，以及内容采集、模型处理和定时出刊任务。产品介绍与界面截图见[仓库首页](../README.md)。

当前行业配置关注全球企业服务与 AI 产品，将信源内容整理为中文标题、摘要、动态时间线和每日精选。网页、RSS、公开 API、MCP 与 Agent Markdown 共用发布数据；读者浏览页面不会触发模型调用。

## 部署运行

需要 Node.js 24.11 或更新的 24.x 版本，以及带 Compose 的 Docker。自动生成内容还需要兼容 OpenAI API 的模型服务。

以下命令均在仓库的 `app/` 目录执行：

```bash
node scripts/init-env.ts
```

脚本会生成 `.env`，填入随机密钥和管理员密码。随后编辑 `.env`：

- 填写 `LLM_API_KEY`，核对 `LLM_BASE_URL` 和 `LLM_MODEL`；示例使用 DeepSeek。
- 本机访问保留 `SITE_URL=http://localhost:3000`；部署到服务器时改为实际访问地址。
- 示例中的 `COLLECT_ENABLED` 和 `MODEL_CALLS_ENABLED` 均为 `true`，启动后会采集内容并调用模型，费用按服务商规则计算。仅调试界面时，将两项设为 `false`。

配置完成后启动：

```bash
docker compose up -d --build
```

打开 [http://localhost:3000](http://localhost:3000)，后台位于 `/admin`，使用 `.env` 中的 `ADMIN_PASSWORD` 登录。首次启动导入预置信源配置，文章和往期内容不会随仓库附带。

更多部署方式、域名与 HTTPS、更新和备份说明见[部署文档](docs/deploy.md)。

## 技术栈与目录

Node.js 24、TypeScript、React Router（服务端渲染）、Fastify、PostgreSQL 17、pg-boss、Tailwind CSS 和 Docker Compose。

| 目录 | 用途 |
|---|---|
| `site/` | 站名与文案、导航、出刊时间、模型配置和品牌素材 |
| `industry/` | 信源、分类、标签、主题、提示词和入选门槛 |
| `apps/web/` | 读者页面与管理后台 |
| `apps/api/` | 供网页使用的接口、公开 API 与 MCP |
| `apps/worker/` | 采集、模型处理与定时任务 |
| `packages/` | 后端业务逻辑、发布数据读取、接口契约与配置类型 |
| `modules/` | 按需启用的扩展模块 |
| `scripts/` | 初始化、数据运维、字体构建与检查脚本 |
| `docs/` | 架构、部署、定制及各功能说明 |

## 定制与管理

更换行业时，从 `site/site.ts` 与 `industry/` 入手，调整站名、信源、分类、主题和提示词。完整步骤见[定制指南](docs/customize.md)。

运行期间可通过后台管理信源和条目，在出刊台保存草稿、调整选稿、发布或回滚精选，并查看模型用量、运行任务与操作记录。

- [信源配置与抓取](docs/sources.md)
- [精选规则与校准](docs/selection.md)
- [事件归组](docs/grouping.md)
- [后台界面规范](docs/admin-ui.md)

## 开发与验证

以下命令在 `app/` 目录执行。需要使用上述 Node.js 版本，并先安装依赖：

```bash
npm ci
npm run typecheck
npm run build -w @aihot/web
node --test apps/web/tests/*.test.ts
npm run test:standalone
```

后端集成测试需要本机 PostgreSQL。下面的命令使用专用测试库；测试库名必须以 `_test` 或 `_ci` 结尾，数据库账号需要有建库权限：

```bash
DATABASE_URL=postgres://127.0.0.1:5432/fengxiang_test npm test
```

测试不需要模型密钥，也不会调用真实的采集或模型服务。站点运行后，可检查主要页面与接口：

```bash
node scripts/smoke.ts --base http://localhost:3000
```

修改前先阅读[架构说明](docs/architecture.md)与相关功能文档，完成后同步更新文档。仓库级流程见[贡献指南](../CONTRIBUTING.md)。不要提交 `.env`、密钥或 `.data/`。

## 反馈与内容更正

产品建议、内容更正及来源方的下架或展示调整请求，可通过站内「反馈」页提交。安全问题的报告方式见 [SECURITY.md](../SECURITY.md)。

## 许可与来源

代码采用仓库根目录的 [MIT 许可证](../LICENSE)，上游 AIHOT 许可证副本保留在 [LICENSE](LICENSE)。原始版权与第三方素材说明见 [NOTICE](../NOTICE)。「风向」名称、站点内容和品牌素材不在 MIT 许可范围内。
