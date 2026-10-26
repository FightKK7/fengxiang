// The site's masthead (刊头): the paper's name, today's date, one row of sections, and the two rules
// that close it. Desktop only (≥ 961px); phones keep the pages' own PhoneBar and the tab bar.
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { SITE } from "@aihot/site";
import { IntentLink } from "../ui/IntentLink";
import { useChangelogSeen } from "../../lib/local-state";
import { weekdayShort } from "../../lib/format";
import { MastheadSearch } from "./MastheadSearch";
import { ThemeToggle } from "./ThemeToggle";
import { SubscribeDialog } from "../../features/subscribe/SubscribeDialog";
import { openSubscribe } from "../../features/subscribe/store";
import { MASTHEAD_LINKS, mastheadIsActive } from "./nav";
import { FxMark } from "./FxMark";

/** True while the changelog has an entry newer than the one this reader last opened. */
export function useChangelogDot(latestVersion: string | null): boolean {
  const seen = useChangelogSeen();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || !latestVersion) return false;
  return !seen || seen < latestVersion;
}

/** "2026 年 10 月 21 日 周三": the masthead's date. */
function dateLabel(today: string): string {
  return `${today.slice(0, 4)} 年 ${Number(today.slice(5, 7))} 月 ${Number(today.slice(8, 10))} 日 ${weekdayShort(today)}`;
}

/** 桌面报头：品牌与日期常驻顶部（往下滚动时固定在顶，2px 黑线收尾）。 */
export function MastheadBrand({ today }: { today: string }) {
  return (
    <div className="fx-mast fx-mast-sticky">
      <div className="mx-auto w-full max-w-[1140px] px-[var(--gutter-l)] lg:px-[30px]">
        <div className="fx-mast-top">
          <Link to="/" className="fx-wordmark" aria-label={`${SITE.name} 首页`}>
            <FxMark className="fx-wordmark-mark" />
            风向
            <span className="fx-wordmark-en">全球企业服务资讯</span>
          </Link>
          {/* 搜索在报头正中间：高频入口，和站名同一行常驻。 */}
          <MastheadSearch />
          <div className="fx-mast-right">
            <b>{dateLabel(today)}</b>
          </div>
        </div>
        <div className="fx-rules" aria-hidden="true" />
      </div>
    </div>
  );
}

/** 桌面主导航：随页面滚动（品牌条已经常驻，导航不必再占一屏顶部）。 */
export function MastheadNav() {
  const { pathname } = useLocation();
  return (
    <>
      <div className="fx-mast">
        <nav className="fx-nav" aria-label="主导航">
          {MASTHEAD_LINKS.map((link) => {
            const active = mastheadIsActive(link, pathname);
            // 订阅 is the one entry that is not a page: it opens the sheet. Plain RSS stays at href for no-JS.
            if (link.subscribe) {
              return (
                <button key={link.label} type="button" className="fx-nav-link" aria-haspopup="dialog" onClick={(event) => openSubscribe(event.currentTarget)}>
                  {link.label}
                </button>
              );
            }
            return link.to.startsWith("http") || link.to.endsWith(".xml") ? (
              <a key={link.label} href={link.to} className="fx-nav-link">
                {link.label}
              </a>
            ) : (
              <IntentLink key={link.label} to={link.to} aria-current={active ? "page" : undefined} className={`fx-nav-link${active ? " fx-nav-on" : ""}`}>
                {link.label}
              </IntentLink>
            );
          })}
          {/* 深浅色开关钉在导航行右端：常驻可见，不用去「我的」里找。 */}
          <ThemeToggle />
        </nav>
      </div>
      {/* The sheet is portalled to the body, so it opens even where the shell's masthead is hidden. */}
      <SubscribeDialog />
    </>
  );
}
