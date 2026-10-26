# 厂商标

> 状态：当前有效 · 最后核对：2026-10-23

主题目录 / 主题页用的公司标识。标只用来识别，不构成背书。当前 25 个文件，对应 `industry/taxonomy.ts` 的 25 家公司。

- `*.svg`：矢量标，来自 [gilbarbara/logos](https://github.com/gilbarbara/logos)（CC0）与
  [VectorLogoZone](https://www.vectorlogo.zone/)；DingTalk 取自 VectorLogoZone，Zapier 与
  DeepSeek 取自 [Simple Icons](https://simpleicons.org/)（CC0）。
- `*.png`：位图标的几家。企业微信、用友、金蝶、WPS、Salesforce、DSH 取官网最大尺寸应用图标，
  裁掉透明边距后归一化为 96×96（`dsh.png` 的浅色圆角底是应用图标本身的底）；`monday.png` 与
  `vercel.png` 是 2026-10-23 从官网直接下载的原始尺寸位图（monday 120×120 透明底，vercel
  180×180 黑底白三角的 apple-touch-icon），未做改画。
- 2026-10-23 补的几家（直接取公开官方图标，原样使用、不改画）：
  - `feishu.svg`：字节 Semi Design 站点用的官方彩色标 `icon_lark-logo_colorful.svg`
    （`lf3-static.bytednsdoc.com/.../root-web-sites/icon_lark-logo_colorful.svg`，透明底）。
  - `monday.png`：monday.com 官方图标 `cdn.monday.com/images/logos/monday_logo_icon.png`（120×120，透明底）。
  - `hubspot.svg`：worldvectorlogo 的官方橙色齿轮 `cdn.worldvectorlogo.com/logos/hubspot-1.svg`（透明底）。
  - `vercel.png`：vercel.com 官方 apple-touch-icon（180×180，黑底白三角，原样）。
  - `dsh.png` 是 DeepSeek Harness 的应用图标，只去掉透明边、保留浅色底。
- `google-ai.svg` 用的是 Gemini 的星标（主题定义是 Gemini / DeepMind），和 `google-workspace.svg`
  的四色 G 区分开。
- 商标归各公司所有。换标时保持文件名与主题 slug 一致，并在 `modules/topic-marks/marks.ts`
  改路径与 `raster` 标记（PNG 为 `true`）。
