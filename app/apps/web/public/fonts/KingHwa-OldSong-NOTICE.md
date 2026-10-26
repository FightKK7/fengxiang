风向 · 报头字标字体（fx-wordmark.woff2）
========================================

> 状态：当前有效 · 最后核对：2026-10-23

本文件说明 fx-wordmark.woff2 的来源与许可。它**不是** OFL 字体，不适用同目录 OFL.txt。

1) 字体
   名称：京華老宋体（KingHwa_OldSong）v2.002，Regular
   作者：特里王（Terry Wang，中国大陆）
   设计来源：北京新华字模厂旧 61-1 铅字（1961）的数字化复刻
   用途：承载报头「风向」与副题「全球企业服务资讯」，子集仅含这 10 个字

2) 许可
   作者声明：企业、个人均可免费商用（非 OSI 开源协议）。
   核验日期：2026-10-22。证据：
   - 作者发布页（知乎）：https://zhuanlan.zhihu.com/p/637491623
   - 猫啃网条目（标注「作者声明」「企业、个人均可免费商用」）：https://www.maoken.com/freefonts/19417.html
   - 中文网字计划收录（只收免费商用字体）：https://github.com/KonghaYao/chinese-free-web-font-storage
   商用发布前如需更强的法律确定性，可另存上述授权页快照；本目录只记录来源与结论。

3) 子集与改动
   源文件：京華老宋体 v2.002 TTF（36,587,506 字节）
     https://raw.githubusercontent.com/KonghaYao/chinese-free-web-font-storage/branch/packages/jhlst/fonts/%E4%BA%AC%E8%8F%AF%E8%80%81%E5%AE%8B%E4%BD%93v2.002.ttf
     源文件 sha256：35d92af5ac4e9485e8e7749098e67211da5885d2697d95aea979fe4acd19ee2a
   子集命令：pyftsubset <ttf> --text="风向" --flavor=woff2 --layout-features='' --no-hinting
   子集文件 sha256：87f5571045d27682973c959aefe1fa73e0dab5f537d555d931a8a978ef8d36c8（5.4 KB）
   未改动字形轮廓；字体内部名称（KingHwa_OldSong / Regular）保留原样，仅做网页格式转换与按字裁剪。

4) 重建
   cd app && node scripts/fonts/build-wordmark.mjs
