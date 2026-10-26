import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouteLoaderData } from "react-router";
import { SITE } from "@aihot/site";
import type { loader as rootLoader } from "../root";
import { useChangelogDot } from "../components/shell/Sidebar";
import { PhoneBar } from "../components/shell/PhoneBar";
import { inNav } from "../components/shell/nav";
import type { Screen } from "../components/shell/screens";
import { edgeTtl } from "../lib/api.server";
import { webModules } from "../site-modules";
import { pageMeta } from "../lib/seo";
import { setFontPreference, useFontPreference, useStarred } from "../lib/local-state";
import { Select } from "../components/ui/Controls";
import { ThemeSwitch } from "../components/shell/ThemeSwitch";
import { Filings } from "../components/shell/Filings";
import { IconBookmark, IconChevronRight, IconGrid, IconHeart, IconMessage, IconMoon, IconPlug, IconSparkles } from "../components/icons";
import "../fx-pages-tools.css";

export const handle: Screen = { tab: "me", name: "我的" };

export function headers() {
  return edgeTtl(300);
}

export function meta() {
  return pageMeta({ title: "我的", path: "/more", noindex: true });
}

/**
 * "我的", the phone's last tab (the address stays /more): this browser's bookmarks and appearance first,
 * then the tools, then the site's own pages. Rows are hairlines, not cards.
 */
type Row = { to: string; label: string; icon: ReactNode; detail?: ReactNode };

/** The ways in that the agent page offers, the modules' first; its row names the first three. */
const agentWays = () => [...webModules().flatMap((m) => m.agentWays ?? []), "MCP", "RSS", "API"];

/** The modules' tools first, then the engine's. */
const tools = (): Row[] => [
  ...webModules().flatMap((m) => m.tools ?? []),
  ...(inNav("/topics") ? [{ to: "/topics", label: "企业厂商", icon: <IconGrid size={20} /> }] : []),
  { to: "/agent", label: "Agent 接入", icon: <IconPlug size={20} />, detail: agentWays().slice(0, 3).join(" / ") },
];

function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section>
      {title && <h2 className="fxp-group-title">{title}</h2>}
      <ul className="fxp-list">{children}</ul>
    </section>
  );
}

function RowLink({ row, dot = false }: { row: Row; dot?: boolean }) {
  return (
    <li>
      <Link viewTransition to={row.to} className="fxp-row fxp-rowlink">
        <span className="fxp-row-icon">{row.icon}</span>
        <span className="fxp-row-label">
          {row.label}
          {dot && <span className="fxp-dot" aria-label="有新的更新" />}
        </span>
        {row.detail && <span className="fxp-row-detail">{row.detail}</span>}
        <IconChevronRight size={14} className="fxp-row-chevron" />
      </Link>
    </li>
  );
}

export default function MorePage() {
  const root = useRouteLoaderData<typeof rootLoader>("root");
  const changelogDot = useChangelogDot(root?.changelogVersion ?? null);
  const starred = useStarred();
  const font = useFontPreference();
  // The count is this browser's: shown once the page runs here, never in the shared server copy.
  const [here, setHere] = useState(false);
  useEffect(() => setHere(true), []);
  return (
    <div className="fxp-page fxp-more">
      <PhoneBar title="我的" large />
      <h1 className="fxp-title hidden lg:block">我的</h1>
      <div className="fxp-more-groups">
        <Group>
          <RowLink row={{ to: "/starred", label: "收藏", icon: <IconBookmark size={20} />, detail: here && starred.length > 0 ? <span className="num">{starred.length}</span> : undefined }} />
          <li>
            <div className="fxp-row">
              <span className="fxp-row-icon">
                <IconMoon size={20} />
              </span>
              <span className="fxp-row-label">外观</span>
              <span className="fxp-control">
                <ThemeSwitch className="w-[126px]" />
              </span>
            </div>
          </li>
          <li>
            <div className="fxp-row">
              <span className="fxp-row-icon" aria-hidden="true">Aa</span>
              <span className="fxp-row-label">字体</span>
              <span className="fxp-control">
                <Select aria-label="字体" value={font ?? "system"} onChange={(e) => setFontPreference(e.target.value === "browser" ? "browser" : null)}>
                  <option value="system">默认字体</option>
                  <option value="browser">浏览器默认字体</option>
                </Select>
              </span>
            </div>
          </li>
        </Group>
        <Group title="工具">
          {tools().map((r) => (
            <RowLink key={r.to} row={r} />
          ))}
        </Group>
        <Group title="关于">
          <RowLink row={{ to: "/about", label: `关于${SITE.name}`, icon: <IconHeart size={20} /> }} />
          <RowLink row={{ to: "/changelog", label: "更新日志", icon: <IconSparkles size={20} /> }} dot={changelogDot} />
          <RowLink row={{ to: "/feedback", label: "意见反馈", icon: <IconMessage size={20} /> }} />
        </Group>
      </div>
      <div className="fxp-foot-more">
        <a href="/feed.xml">RSS</a>
        {SITE.github && <a href={SITE.github} target="_blank" rel="noopener noreferrer">GitHub 源码</a>}
        <Filings className="" badgeSize={13} />
      </div>
    </div>
  );
}
