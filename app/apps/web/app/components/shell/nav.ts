// Site navigation in one place: the masthead's links (the front page's sections) and the phone tab
// bar's tabs, the engine's and the site's modules'.
import type { ReactNode } from "react";
import { NAV } from "@aihot/site";
import { webModules } from "../../site-modules";
import { IconBolt, IconDoc, IconUser } from "../icons";

/** Whether an engine page is a way in from the navigation (site.ts NAV.hidden); a hidden page still opens. */
export const inNav = (to: string) => !(NAV.hidden as readonly string[]).includes(to);

const UP = {
  "/hot": { name: "风向榜", back: "风向榜", tab: "hot" },
  "/topics": { name: "企业厂商", back: "全部企业厂商", tab: "me" },
} as const;

/**
 * Where pages under a navigation entry lead back up to: the entry, or 动态 in its place while the site hides
 * it. `name` is for breadcrumbs and desktop back links (风向榜), `back` for the phone bar (风向榜), `tab` the
 * phone tab it sits under, `crumbs` its breadcrumb after the site's home.
 */
export function navUp(entry: keyof typeof UP): { to: string; name: string; back: string; tab: TabKey; crumbs: Array<{ name: string; path: string }> } {
  if (!inNav(entry)) return { to: "/", name: "动态", back: "动态", tab: "featured", crumbs: [] };
  return { to: entry, ...UP[entry], crumbs: [{ name: UP[entry].name, path: entry }] };
}

/**
 * The masthead's one row of links: the timeline (the front page), the daily picks (每日精选), topics and
 * the subscription. 全部动态 is the timeline's own name now; /all stays its deep pages and search, reached
 * from the page itself. 周报 no longer sits in the row (the page still opens at /weekly).
 */
export interface MastheadLink {
  to: string;
  label: string;
  /** This entry's own path, when it differs from where it goes. */
  activeOn?: string;
  /** 订阅 is not a page: it opens the subscribe sheet (features/subscribe). `to` stays the plain-RSS fallback. */
  subscribe?: boolean;
}

export const MASTHEAD_LINKS: MastheadLink[] = [
  { to: "/", label: "全部动态" },
  { to: "/daily", label: "每日精选" },
  { to: "/topics", label: "企业厂商" },
  { to: "/feed.xml", label: "订阅", subscribe: true },
  { to: "/more", label: "我的" },
  { to: "/starred", label: "收藏" },
];

/** Whether a masthead link is the reader's current section. */
export function mastheadIsActive(link: MastheadLink, pathname: string): boolean {
  if (link.activeOn) return pathname === link.activeOn || pathname.startsWith(`${link.activeOn}/`);
  // /all 是时间线的深页与搜索，仍归在「动态」下。
  if (link.to === "/") return pathname === "/" || pathname.startsWith("/all");
  if (link.to === "/weekly") return /^\/(weekly|monthly)(\/|$)/.test(pathname);
  return pathname === link.to || pathname.startsWith(`${link.to}/`);
}

/**
 * The phone tab bar: 动态 is the timeline front page, 每日精选 is the daily picks, and "我的" at /more
 * holds 收藏, 外观, the tools and the site's own pages. Which tab a page sits under is declared by the page
 * itself (components/shell/screens.ts). 周报 no longer has a tab (the page still opens at /weekly).
 */
export type TabKey =
  | "featured"
  | "hot"
  | "daily"
  | "me"
  // A module's tab.
  | (string & {});

export interface Tab {
  key: TabKey;
  to: string;
  label: string;
  icon: (p: { size?: number }) => ReactNode;
}

const ENGINE_TABS: Tab[] = [
  { key: "featured", to: "/", label: "动态", icon: IconBolt },
  { key: "daily", to: "/daily", label: "每日精选", icon: IconDoc },
  { key: "me", to: "/more", label: "我的", icon: IconUser },
];

/** The tab bar: the engine's four, then the modules' before 我的. */
export function tabs(): Tab[] {
  return [...ENGINE_TABS.slice(0, -1).filter((t) => inNav(t.to)), ...webModules().flatMap((m) => m.tabs ?? []), ENGINE_TABS.at(-1)!];
}
