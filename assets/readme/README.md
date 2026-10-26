# README 截图

> 状态：当前有效 · 最后核对：2026-10-26

仓库根 [`README.md`](../../README.md) 使用的产品截图，来自 2026-10-26 的本地实例（`http://localhost:3000`），内容是真实抓取的公开信息。

| 文件 | 页面 | 视口 |
|---|---|---|
| `hero.png` | 顶部横幅（首页上半部分） | 1440×640 |
| `daily.png` | 每日精选（一期 5 条） | 1440×900 @2x |
| `item.png` | 条目页（中文摘要 + 中英对照） | 1440×900 @2x |
| `topics.png` | 企业厂商目录 | 1440×780 @2x |
| `agent.png` | Agent 接入页（MCP / RSS / API） | 1440×900 @2x |
| `mobile.png` | 手机端首页（动态） | 390×844 @3x |

截图页面都是读者面公开页面，不含后台、登录态或个人信息。重建方式：Playwright Chromium 截图（`deviceScaleFactor: 2/3`、`locale: zh-CN`、`timezoneId: Asia/Shanghai`），再用 Pillow 做 LANCZOS 缩放，PNG 保存。
