import {
  isRouteErrorResponse, Link, Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData, useLocation, useNavigation, useRouteError, useRouteLoaderData,
  type ShouldRevalidateFunction,
} from "react-router";
import type { SiteMeta } from "@aihot/contracts/site";
import { SITE } from "@aihot/site";
import { RingMark } from "@aihot/site/brand/Logo.tsx";
import { beijingDate } from "@aihot/contracts/time";
import { useEffect, useState, type ReactNode } from "react";
import type { Route } from "./+types/root";
import "./app.css";
import "./fengxiang.css";
import "./fx-fonts.css";
import "./fx-fonts-base.css";
import { MastheadBrand, MastheadNav } from "./components/shell/Sidebar";
import { TabBar } from "./components/shell/TabBar";
import { usePageTransition } from "./components/shell/transitions";
import { SearchOverlay } from "./features/search/SearchOverlay";
import { BackToTop, NavigationProgress } from "./components/shell/Chrome";
import { buttonClass } from "./components/ui/Controls";
import { APPEARANCE_BOOT_SCRIPT, rememberPage, TRANSLATION_BOOT_SCRIPT, useAppearanceSync } from "./lib/local-state";
import { apiGet } from "./lib/api.server";
import { useHydratedFlag } from "./lib/hydration";
import { titled } from "./lib/seo";
import { webModules } from "./site-modules";

export const links: Route.LinksFunction = () => [
  // 图标带版本号：浏览器把 favicon 缓存得很死，换标后不改 URL 会一直显示旧图标。
  { rel: "icon", href: "/favicon.ico?v=20261023", sizes: "any" },
  { rel: "icon", type: "image/png", href: "/icon.png?v=20261023" },
  { rel: "apple-touch-icon", href: "/apple-icon.png?v=20261023" },
  { rel: "manifest", href: "/manifest.webmanifest" },
  { rel: "alternate", type: "application/rss+xml", title: `${SITE.name} — 精选动态`, href: "/feed.xml" },
  // The headings' serif subset is the one font that blocks first paint of the page's type: fetch it with
  // the document instead of after the CSS is parsed. Numbers are 2 KB each and can arrive later.
  { rel: "preload", href: "/fonts/fx-serif-600.woff2", as: "font", type: "font/woff2", crossOrigin: "anonymous" },
  // 报头「风向」+ 副题是独立的显示字面（5.4 KB / 10 字）：不 preload 会在字体 swap 时抽动刊头宽度。
  { rel: "preload", href: "/fonts/fx-wordmark.woff2", as: "font", type: "font/woff2", crossOrigin: "anonymous" },
];

/** The release rendering this document: once a newer one is deployed, a render error reloads the page (entry.client). */
export async function loader({ request }: Route.LoaderArgs) {
  const release = process.env.AIHOT_RELEASE ?? null;
  const today = beijingDate(Date.now());
  const meta = await apiGet<SiteMeta>("/api/site/meta", {
    headers: Object.assign({}, ...webModules().map((m) => m.root?.documentHeaders?.(request) ?? {})),
    signal: request.signal,
  }).catch(() => null);
  return { changelogVersion: meta?.changelogVersion ?? null, release, today };
}

export const shouldRevalidate: ShouldRevalidateFunction = () => false;

export function Layout({ children }: { children: React.ReactNode }) {
  const site = useRouteLoaderData<typeof loader>("root");
  const [documentRelease] = useState(site?.release ?? null);
  // 外观（深浅色/字体）在客户端对齐读者的选择或系统偏好；首屏由下面的 boot script 先落地，避免闪白。
  useAppearanceSync();
  return (
    <html lang={SITE.locale} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        {documentRelease && <meta name="aihot-release" content={documentRelease} />}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#ffffff" />
        <meta name="apple-mobile-web-app-title" content={SITE.name} />
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_BOOT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: TRANSLATION_BOOT_SCRIPT }} />
        {webModules().map((m) => m.root?.bootScript && <script key={m.name} dangerouslySetInnerHTML={{ __html: m.root.bootScript }} />)}
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration getKey={(location) => location.key} />
        <Scripts />
      </body>
    </html>
  );
}

/** Only a page nobody matched falls back to this; every page names itself. */
export function meta({ error }: Route.MetaArgs) {
  if (!error) return [];
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return [{ title: titled(notFound ? "页面不存在" : "暂时无法加载") }, { name: "robots", content: "noindex" }];
}

/** Masthead, page and phone tab bar: the paper's shell, on white. */
function SiteShell({ today, children }: { today: string; children: ReactNode }) {
  const navigation = useNavigation();
  // The phone search is client-side, mounted once the page is interactive.
  const [interactive, setInteractive] = useState(false);
  useEffect(() => setInteractive(true), []);
  return (
    <div className="min-h-dvh">
      <NavigationProgress active={navigation.state === "loading"} />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:bg-surface focus:px-3 focus:py-2 focus:text-ink">
        跳到正文
      </a>
      {/* 品牌条常驻顶部（滚动时 sticky），导航随页面滚动。 */}
      <MastheadBrand today={today} />
      <div className="mx-auto w-full max-w-[1140px] px-[var(--gutter-l)] lg:px-[30px]">
        <MastheadNav />
      </div>
      <main id="main" className="pb-[calc(72px+env(safe-area-inset-bottom))] lg:px-7 lg:pb-[72px] lg:pt-6">
        <div className="mx-auto w-full max-w-[640px] pl-[var(--gutter-l)] pr-[var(--gutter-r)] lg:max-w-[1140px] lg:px-[30px]">
          {webModules().map((m) => m.root?.Top && <m.root.Top key={m.name} />)}
          {children}
        </div>
      </main>
      <TabBar />
      {interactive && <SearchOverlay />}
      <BackToTop />
    </div>
  );
}

export default function App() {
  const meta = useLoaderData<typeof loader>();
  useHydratedFlag();
  const { pathname, search } = useLocation();
  useEffect(() => rememberPage(pathname + search), [pathname, search]);
  usePageTransition();
  // iOS Safari only shows :active (pressed) styles once the document listens for touches.
  useEffect(() => {
    const noop = () => {};
    document.addEventListener("touchstart", noop, { passive: true });
    return () => document.removeEventListener("touchstart", noop);
  }, []);
  // The admin has its own chrome.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return <Outlet />;
  return (
    <>
      <SiteShell today={meta.today}>
        <Outlet />
      </SiteShell>
      {webModules().map((m) => m.root?.Bottom && <m.root.Bottom key={m.name} />)}
    </>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const site = useRouteLoaderData<typeof loader>("root");
  const { pathname, search, hash } = useLocation();
  const status = isRouteErrorResponse(error) ? error.status : 500;
  const notFound = status === 404;
  const body = (
    <div className="flex min-h-[70vh] items-center justify-center px-2 py-16">
      <div className="max-w-sm text-center">
        <RingMark className="mx-auto mb-5 size-10 text-ink" />
        <div className="mono text-[12px] text-ink-4">{status}</div>
        <h1 className="mt-1.5 text-[20px] font-bold text-ink">{notFound ? "页面不存在" : "暂时无法加载"}</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-3">
          {notFound ? "链接可能失效了，或这条内容已经下架。" : "页面暂时打不开，请重新加载后再试。"}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2.5">
          {!notFound && <Link reloadDocument to={pathname + search + hash} className={buttonClass("primary")}>
            重新加载
          </Link>}
          <Link reloadDocument to="/" className={buttonClass(notFound ? "primary" : "secondary")}>
            回到首页
          </Link>
        </div>
      </div>
    </div>
  );
  // Admin errors stay inside the admin's own chrome.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return body;
  return <SiteShell today={site?.today ?? beijingDate(Date.now())}>{body}</SiteShell>;
}

