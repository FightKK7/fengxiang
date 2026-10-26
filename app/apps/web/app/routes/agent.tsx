import { useEffect, useState } from "react";
import { BackLink } from "../components/ui/BackLink";
import { IntentLink } from "../components/ui/IntentLink";
import { useLoaderData, useNavigate, useSearchParams } from "react-router";
import type { Route } from "./+types/agent";
import { PUBLIC_INTERFACE_VERSION } from "@aihot/contracts/http-policy";
import { SITE } from "@aihot/site";
import { apiGet, cachedPage } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { listPath, pageMeta, siteUrl } from "../lib/seo";
import { IconArrowUpRight, IconCode, IconPlug, IconRss } from "../components/icons";
import { AGENT_PARTS, GUIDE_CLIENTS, TAG } from "../features/agent/module-parts";
import { ApiPanel, McpPanel, mcpToolCount, RssPanel } from "../features/agent/panels";
import type { AgentTrack } from "../modules";
import { PhoneBar } from "../components/shell/PhoneBar";
import type { Screen } from "../components/shell/screens";
import "../fx-pages-tools.css";

export const handle: Screen = { tab: "me", name: "Agent 接入" };

export { pageHeaders as headers } from "../lib/api.server";

const V = PUBLIC_INTERFACE_VERSION;

/** The ways in, the modules' first. The tabs are the tracks: `?tab=` (the first is the default and not written). */
const TRACKS: AgentTrack[] = [
  ...AGENT_PARTS.flatMap((p) => p.tracks ?? []),
  { key: "mcp", name: "MCP", short: "MCP", pitch: `填一个地址，多出 ${mcpToolCount()} 个工具`, fit: "Claude 桌面版、Cursor 等远程 MCP 客户端", icon: IconPlug, Panel: McpPanel },
  { key: "rss", name: "RSS", short: "RSS", pitch: "复制地址，用阅读器订阅", fit: "Reeder、Folo、Inoreader、n8n", icon: IconRss, Panel: RssPanel },
  { key: "api", name: "REST API", short: "API", pitch: "匿名 GET，自己写程序取数", fit: "脚本、机器人、小程序、看板", icon: IconCode, Panel: ApiPanel, anchors: ["agent-api-recovery"] },
];
const FIRST = TRACKS[0]!.key;
const tabKey = (key: string | null) => key && TRACKS.some(t => t.key === key) ? key : FIRST;
const hrefOf = (key: string) => (key === FIRST ? "/agent" : `/agent?tab=${key}`);
/** How many ways, as the copy counts them ("四种方式"). */
const WAYS = ["零", "一", "两", "三", "四", "五", "六"][TRACKS.length];

/** The modules' sections at the end of a panel. */
const BLOCKS = AGENT_PARTS.flatMap((p) => p.blocks ?? []);
/** Which tab each section that can be linked to is on: the tracks' own, then the modules'. */
const ANCHORS = new Map([
  ...TRACKS.flatMap((t) => (t.anchors ?? []).map((id) => [id, t.key] as const)),
  ...BLOCKS.map((b) => [b.anchor, b.track] as const),
]);
const anchorHref = (id: string) => `${hrefOf(ANCHORS.get(id)!)}#${id}`;

/** Machine-readable entry points, with what each one is for. */
const RESOURCES: Array<[label: string, href: string, note: string]> = [
  ["llms.txt", "/llms.txt", "给大模型读的站点说明"],
  ["Agent 使用说明", "/api/v1/agent", `工具、参数与示例${GUIDE_CLIENTS ? `（${GUIDE_CLIENTS} 也用它）` : ""}`],
  ["OpenAPI 3.1", "/openapi-v1.json", `REST API 的完整定义（版本 ${V}）`],
  ...AGENT_PARTS.flatMap((p) => p.resources ?? []),
];

const BANNERS = AGENT_PARTS.flatMap((p) => (p.Banner ? [p.Banner] : []));
/** The tag's value: a hook, called on every render. */
const useTag = TAG?.useValue ?? (() => null);

export async function loader({ request }: Route.LoaderArgs) {
  // Only whether the api answers, within three seconds.
  const healthy = await apiGet("/api/health", { signal: AbortSignal.any([request.signal, AbortSignal.timeout(3000)]) }).then(() => true, () => false);
  return cachedPage(300, {
    healthy,
    // The examples show the configured public address, the same on the server and in the browser; what
    // depends on the time reads the server's.
    base: siteUrl(),
    now: Date.now(),
  });
}

/** The tabs read one result, kept under the address without `tab`. */
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>((url) => {
  const params = new URLSearchParams(url.search);
  params.delete("tab");
  return url.pathname + (params.size ? `?${params}` : "");
});

export function meta({ location }: Route.MetaArgs) {
  const tab = tabKey(new URLSearchParams(location.search).get('tab'));
  const path = listPath("/agent", { tab: tab !== FIRST ? tab : null });
  return pageMeta({
    title: "Agent 接入",
    description: `把${SITE.name}接进你的 Agent：${TRACKS.map((t) => t.name).join("、")} ${WAYS}种方式，读官方一手的全球企业服务动态、每日精选和热点事件；匿名只读，无需 API Key。`,
    path,
    image: "/og/pages/agent.png",
  });
}

export default function AgentPage() {
  const { healthy, base, now } = useLoaderData<typeof loader>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const tag = useTag();
  const tab = tabKey(params.get('tab'));
  // A section to scroll to once its panel is on the page.
  const [target, setTarget] = useState<string | null>(null);

  // Opened at a section's anchor: show its tab and scroll there.
  useEffect(() => {
    const hash = location.hash.slice(1);
    const key = ANCHORS.get(hash);
    if (key) {
      if (key !== tab) navigate(`${hrefOf(key)}#${hash}`, { replace: true, preventScrollReset: true });
      setTarget(hash);
    }
  }, []);
  useEffect(() => {
    if (!target || tab !== ANCHORS.get(target)) return;
    document.getElementById(target)?.scrollIntoView({ block: "start" });
    setTarget(null);
  }, [target, tab]);

  const select = (key: string) => {
    if (key === tab) return;
    navigate(hrefOf(key), { replace: true, preventScrollReset: true });
  };
  const open = (id: string) => {
    navigate(anchorHref(id), { replace: true, preventScrollReset: true });
    setTarget(id);
  };
  const track = TRACKS.find((t) => t.key === tab);

  return (
    <>
    <PhoneBar back={{ to: "/more", label: "我的" }} title="Agent 接入" />
    <div className="fxp-page fxp-agent">
      <div className="fxp-read">
        <div className="fxp-read-main">
          <BackLink to="/more" />
          <header className="fxp-head">
            <div className="fxp-eyebrow">Agent 接入</div>
            <h1 data-page-title="" className="fxp-title">{`把${SITE.name}接进你的 Agent`}</h1>
            <p className="fxp-lead">{`${TRACKS.map((t) => t.short).join("、")} ${WAYS}种方式读同一份数据：官方一手的全球企业服务动态——全部动态、每日精选与热点事件。按你用的工具选一种接入，匿名只读，不用注册和 API Key。`}</p>
            <div className="fxp-chips">
              <span className={`fxp-chip ${healthy ? "" : "fxp-chip-bad"}`}>
                <span className={`fxp-sq ${healthy ? "fxp-sq-ink" : "fxp-sq-error"}`} aria-hidden="true" />
                {healthy ? "服务正常" : "服务异常"}
              </span>
              <span className="fxp-chip">版本 <b>{V}</b></span>
            </div>
            <div className="fxp-head-rule" />
          </header>

          {BANNERS.map((Banner, i) => <Banner key={i} base={base} tag={tag} now={now} href={anchorHref} open={open} />)}

          <div role="tablist" aria-label="接入方式" className="fxp-tabs">
            {TRACKS.map((t) => {
              const on = t.key === tab;
              return (
                <a
                  key={t.key}
                  href={hrefOf(t.key)}
                  role="tab"
                  id={`agent-tab-${t.key}`}
                  aria-selected={on}
                  aria-controls="agent-panel"
                  onClick={(e) => {
                    e.preventDefault();
                    select(t.key);
                  }}
                  className={`fxp-tab ${on ? "fxp-tab-on" : ""}`}
                >
                  {t.name}
                  {t.badge && <span className="fxp-tab-note">{t.badge}</span>}
                </a>
              );
            })}
          </div>
          {TAG && <TAG.Note />}

          <section id="agent-panel" role="tabpanel" aria-labelledby={`agent-tab-${tab}`} className="fxp-panel">
            {track && <track.Panel key={track.key} base={base} tag={tag} now={now} />}
            {BLOCKS.filter((b) => b.track === tab).map((b) => <b.Block key={b.anchor} base={base} tag={tag} now={now} />)}
          </section>
        </div>

        <aside className="fxp-read-aside">
          <section className="fxp-aside-sec">
            <h2 className="fxp-aside-title">接入资源</h2>
            <nav aria-label="接入资源">
              {RESOURCES.map(([l, h, note]) => (
                <a key={h} href={h} target={h.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" className="fxp-aside-row">
                  <span className="fxp-aside-row-main">
                    <span className="fxp-aside-row-label">{l}</span>
                    <span className="fxp-aside-row-note">{note}</span>
                  </span>
                  <IconArrowUpRight size={12} />
                </a>
              ))}
            </nav>
          </section>
          <section className="fxp-aside-sec">
            <h2 className="fxp-aside-title">接不上？</h2>
            <p className="fxp-aside-more">把平台、版本和报错写进反馈页，不要发 token。</p>
            <p className="fxp-aside-more">
              <IntentLink viewTransition to="/feedback" className="fxp-link">去反馈 →</IntentLink>
            </p>
          </section>
        </aside>
      </div>
    </div>
    </>
  );
}
