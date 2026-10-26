// 搜索框上显示的快捷键：Mac 是 ⌘K，Windows/Linux 是 Ctrl K。
// 键位本身在 SearchOverlay 里监听（⌘K / Ctrl-K 打开搜索）；这里只负责把对的写法给读者看。
// 服务端与水合前按 Ctrl K 渲染，水合后按平台换 —— 只影响这一个键位提示。
import { useEffect, useState } from "react";

const MAC = /mac|iphone|ipad|ipod/i;

export function useSearchShortcut(): string {
  const [mac, setMac] = useState(false);
  useEffect(() => {
    setMac(MAC.test(`${navigator.platform ?? ""} ${navigator.userAgent ?? ""}`));
  }, []);
  return mac ? "⌘K" : "Ctrl K";
}

/** 给 aria-label / title 用的完整说法。 */
export function searchShortcutLabel(shortcut: string): string {
  return `搜索（快捷键 ${shortcut}）`;
}
