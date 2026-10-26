// The phone tab bar (below lg): the ways into the paper — the timeline front page, 每日精选, and 我的.
// The page declares its tab (components/shell/screens.ts); pages without one in the bar keep the tab
// they were opened under, or 动态. No blur, no shadow: one hairline on top.
import { useLocation } from "react-router";
import { IntentLink } from "../ui/IntentLink";
import { tabs } from "./nav";
import { useScreen } from "./screens";

export function TabBar() {
  const screen = useScreen();
  const { pathname } = useLocation();
  const items = tabs();
  // 周报与每日精选共用 report-latest/detail 的 handle（tab 都是 daily）：周报已没有 tab，按路径归到动态。
  const requested = pathname.startsWith("/weekly") ? "weekly" : (screen.tab ?? screen.home);
  const active = requested && items.some((t) => t.key === requested) ? requested : "featured";
  if (screen.toolbar) return null;
  return (
    <nav aria-label="底部导航" className="fx-tabbar lg:hidden">
      <div className="fx-tabbar-row">
        {items.map((t) => {
          const on = t.key === active;
          return (
            <IntentLink key={t.key} to={t.to} aria-current={on ? "page" : undefined} className={`fx-tab${on ? " fx-tab-on" : ""}`}>
              {t.label}
            </IntentLink>
          );
        })}
      </div>
    </nav>
  );
}
