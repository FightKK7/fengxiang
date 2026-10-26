import { Suspense } from "react";
import { beijingDate } from "@aihot/contracts/time";
import { SITE } from "@aihot/site";
import { Await, isRouteErrorResponse, Link, NavLink, Outlet, useLocation, useNavigation, useRouteError, type ShouldRevalidateFunction } from "react-router";
import type { Route } from "./+types/layout";
import { NavigationProgress } from "../../components/shell/Chrome";
import type { AdminMe, AdminNavCounts } from "@aihot/contracts/admin";
import { Toaster } from "../../features/admin/toast";
import { adminGet } from "../../lib/admin.server";
import { weekdayShort } from "../../lib/format";
import type { AdminNavEntry } from "../../modules";
import { webModules } from "../../site-modules";
import "../../features/admin/admin.css";

export async function loader({ request }: Route.LoaderArgs) {
  const counts = adminGet<AdminNavCounts>(request, "/api/admin/nav-counts").catch((): AdminNavCounts => ({}));
  const me = await adminGet<AdminMe>(request, "/api/admin/me");
  // Reset the badge boundaries so a navigation transition never keeps the old page waiting on them.
  return { me, counts, countsKey: crypto.randomUUID(), today: beijingDate(Date.now()) };
}

// Verify identity and update badges on every navigation/command; badges do not hold up the page.
export const shouldRevalidate: ShouldRevalidateFunction = () => true;

export const meta: Route.MetaFunction = () => [{ title: `${SITE.name} 后台` }, { name: "robots", content: "noindex, nofollow" }];

export const headers: Route.HeadersFunction = () => ({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "X-Accel-Buffering": "no" });

/** 内容：编辑每天要用的。 */
const contentItems = (): AdminNavEntry[] => [
  { to: "/admin/reports", label: "出刊台" },
  { to: "/admin/content", label: "条目" },
  { to: "/admin/sources", label: "信源", count: "sources", tone: "bad" },
  ...webModules().flatMap((m) => m.admin?.content ?? []),
  { to: "/admin/feedback", label: "反馈", count: "feedback", tone: "accent" },
];

/** 系统：运维与配置。 */
const systemItems = (): AdminNavEntry[] => [
  { to: "/admin/runs", label: "运行", count: "runs", tone: "bad" },
  { to: "/admin/models", label: "模型" },
  { to: "/admin/selectbench", label: "精选对照" },
  { to: "/admin/settings", label: "设置" },
  { to: "/admin/audit", label: "审计记录" },
];

/** 模块自己的分组（目前没有），排在系统之后，各成一段。 */
const moduleGroups = (): AdminNavEntry[][] => webModules().flatMap((m) => (m.admin?.groups ?? []).map((group) => group.items));

type Counts = Pick<Route.ComponentProps["loaderData"], "counts" | "countsKey">;

function NavCount({ counts, countsKey, name, tone }: Counts & { name: string | undefined; tone?: "bad" | "accent" }) {
  if (!name) return null;
  return (
    <Suspense key={countsKey} fallback={null}>
      <Await resolve={counts} errorElement={null}>
        {(resolved: AdminNavCounts) =>
          resolved[name] ? <span className={`adm-nav-count${tone ? " adm-nav-count--bad" : ""}`}>{resolved[name]}</span> : null
        }
      </Await>
    </Suspense>
  );
}

function NavItem({ to, label, count, tone, counts, countsKey }: AdminNavEntry & Counts) {
  return (
    <NavLink to={to} className={({ isActive }) => `adm-nav-link${isActive ? " adm-nav-on" : ""}`}>
      {label}
      <NavCount counts={counts} countsKey={countsKey} name={count} tone={tone} />
    </NavLink>
  );
}

export default function AdminLayout({ loaderData }: Route.ComponentProps) {
  const { me, counts, countsKey, today } = loaderData;
  const navigation = useNavigation();
  const groups = [...moduleGroups()];
  return (
    <div className="adm-shell">
      <NavigationProgress active={navigation.state === "loading"} />
      <a href="#admin-main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:bg-bg focus:px-3 focus:py-2 focus:text-ink">
        跳到正文
      </a>
      <div className="adm-wrap">
        <header className="adm-mast">
          <NavLink to="/" reloadDocument className="adm-wordmark" aria-label={`${SITE.name} 首页`}>
            {SITE.name}
            <span className="adm-wordmark-sub">后台</span>
          </NavLink>
          <div className="adm-mast-meta">
            <div>
              {today.slice(0, 4)} 年 {Number(today.slice(5, 7))} 月 {Number(today.slice(8, 10))} 日 {weekdayShort(today)}
            </div>
            <div>
              <b>{me.name}</b>
              {me.dev ? " · 开发模式" : ""}
              <span className="adm-mast-links">
                <span aria-hidden="true">·</span>
                <a href="/">回到官网</a>
                <span aria-hidden="true">·</span>
                <form method="post" action="/api/auth/logout">
                  <button type="submit">退出登录</button>
                </form>
              </span>
            </div>
          </div>
        </header>
        <div className="adm-rules" aria-hidden="true" />
      </div>
      <div className="adm-navbar">
        <div className="adm-wrap">
          <nav className="adm-nav" aria-label="后台导航">
            {contentItems().map((item) => (
              <NavItem key={item.to} {...item} counts={counts} countsKey={countsKey} />
            ))}
            <span className="adm-nav-sep" aria-hidden="true" />
            {systemItems().map((item) => (
              <NavItem key={item.to} {...item} counts={counts} countsKey={countsKey} />
            ))}
            {groups.map((items, index) => (
              <span key={index} className="contents">
                <span className="adm-nav-sep" aria-hidden="true" />
                {items.map((item) => (
                  <NavItem key={item.to} {...item} counts={counts} countsKey={countsKey} />
                ))}
              </span>
            ))}
          </nav>
        </div>
      </div>
      <main id="admin-main" className="adm-wrap">
        <Outlet />
      </main>
      <Toaster />
    </div>
  );
}

/**
 * 页面数据出错时留在后台自己的壳里：报状态码与建议动作，不再掉到读者面的通用错误页。
 * 出错时 loaderData 拿不到，所以只画字标与说明，导航由「回到出刊台」代替。
 */
export function ErrorBoundary() {
  const error = useRouteError();
  const location = useLocation();
  const status = isRouteErrorResponse(error) ? error.status : 500;
  const notFound = status === 404;
  return (
    <div className="adm-shell">
      <div className="adm-wrap">
        <header className="adm-mast">
          <a href="/" className="adm-wordmark" aria-label={`${SITE.name} 首页`}>
            {SITE.name}
            <span className="adm-wordmark-sub">后台</span>
          </a>
        </header>
        <div className="adm-rules" aria-hidden="true" />
      </div>
      <main className="adm-wrap">
        <div className="adm-page">
          <header className="adm-head">
            <div className="adm-head-row">
              <div className="adm-head-main">
                <h1 className="adm-title">{notFound ? "找不到这个页面" : "这页暂时打不开"}</h1>
                <div className="adm-page-meta">
                  HTTP {status} ·{" "}
                  {notFound ? "链接可能有误，或者这条内容已经下架。" : "后台接口没有返回数据；先重新加载，再看「运行」页。"}
                </div>
              </div>
              <div className="adm-actions">
                <Link reloadDocument to={location.pathname + location.search} className="adm-btn adm-btn--primary">
                  重新加载
                </Link>
                <Link to="/admin/reports" className="adm-btn">
                  回到出刊台
                </Link>
                <Link to="/" reloadDocument className="adm-btn adm-btn--ghost">
                  回到官网
                </Link>
              </div>
            </div>
          </header>
        </div>
      </main>
    </div>
  );
}
