// 后台登录：管理员密码（ADMIN_PASSWORD），配置了飞书时也可以走飞书。
// 表单直接 POST 给 API，由 API 设置会话 cookie 后跳转。版式和后台一致：白纸、宋体字标、2px 黑线、方角输入。
import { useLoaderData } from "react-router";
import type { Route } from "./+types/admin-login";
import { SITE } from "@aihot/site";
import { apiGet } from "../lib/api.server";
import "../features/admin/admin.css";

const ERRORS: Record<string, string> = {
  wrong: "密码不对，再试一次。",
  unset: "还没有设置管理员密码：在 .env 里设置 ADMIN_PASSWORD（至少 12 位），重启后再登录。",
  "too-many": "尝试次数太多，请 15 分钟后再试。",
};

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const returnTo = url.searchParams.get("return") ?? "/admin";
  const options = await apiGet<{ password: boolean; feishu: boolean }>("/api/auth/options", { signal: request.signal }).catch(() => ({ password: true, feishu: false }));
  return { returnTo: returnTo.startsWith("/admin") ? returnTo : "/admin", error: url.searchParams.get("error"), ...options };
}

export const meta: Route.MetaFunction = () => [{ title: `登录 · ${SITE.name} 后台` }, { name: "robots", content: "noindex, nofollow" }];

export const headers: Route.HeadersFunction = () => ({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" });

export default function AdminLogin() {
  const { returnTo, error, password, feishu } = useLoaderData<typeof loader>();
  const message = error ? (ERRORS[error] ?? ERRORS.wrong) : !password ? ERRORS.unset : null;
  return (
    <div className="adm-login">
      <div className="adm-login-box">
        <a href="/" className="adm-login-wordmark" aria-label={`${SITE.name} 首页`}>
          <span>{SITE.name}</span>
          <span>后台 · 管理员登录</span>
        </a>
        <form method="post" action="/api/auth/password" className="adm-login-form">
          <input type="hidden" name="return" value={returnTo} />
          <label htmlFor="password" className="adm-label">
            管理员密码
          </label>
          <input id="password" name="password" type="password" autoComplete="current-password" required autoFocus className="adm-input" />
          {message && (
            <p role="alert" className="adm-login-error">
              {message}
            </p>
          )}
          <button type="submit" className="adm-btn adm-btn--primary mt-4 w-full">
            登录
          </button>
          {feishu && (
            <a href={`/api/auth/feishu?${new URLSearchParams({ return: returnTo })}`} className="adm-btn mt-2 w-full">
              用飞书登录
            </a>
          )}
        </form>
        <p className="adm-login-foot">
          <a href="/" className="adm-link-muted">
            回到{SITE.name}
          </a>
        </p>
      </div>
    </div>
  );
}
