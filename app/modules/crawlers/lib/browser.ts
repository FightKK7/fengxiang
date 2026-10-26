// Playwright 浏览器封装（Tier 1）。
//
// 版本坑：本机 @playwright/test 1.61.1 期望 chromium_headless_shell-1228，但缓存里只有 1223。
// 所以先直接 launch()；报 "Executable doesn't exist" 时自己扫 ~/Library/Caches/ms-playwright/
// （或 PLAYWRIGHT_BROWSERS_PATH），挑版本号最大的 chromium_headless_shell-* 用 executablePath 启动。
// 都没有就返回结构化的「Tier 1 不可用」，由适配器决定记 skipped/失败，不在这里抛到进程外。
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { chromium, type Browser } from "playwright";

const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export interface RenderOptions {
  /** DOMContentLoaded 之后再等多久（前端渲染和懒加载），默认 4000ms。 */
  waitMs?: number;
  /** goto 的超时，默认 45s。 */
  timeoutMs?: number;
  viewport?: { width: number; height: number };
}

export type BrowserResult<T> =
  | { ok: true; value: T; executablePath: string | null }
  | { ok: false; reason: "unavailable" | "error"; message: string };

/** 浏览器缓存根目录（与 Playwright 自己的查找规则一致）。 */
function cacheRoots(): string[] {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) return [process.env.PLAYWRIGHT_BROWSERS_PATH];
  if (process.platform === "darwin") return [path.join(homedir(), "Library", "Caches", "ms-playwright")];
  if (process.platform === "win32") return [path.join(process.env.LOCALAPPDATA ?? path.join(homedir(), "AppData", "Local"), "ms-playwright")];
  return [process.env.XDG_CACHE_HOME ? path.join(process.env.XDG_CACHE_HOME, "ms-playwright") : path.join(homedir(), ".cache", "ms-playwright")];
}

/** 缓存里的 chrome-headless-shell，按版本号从新到旧。 */
export function cachedExecutables(): string[] {
  const found: Array<{ version: number; executable: string }> = [];
  for (const root of cacheRoots()) {
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root)) {
      const match = /^chromium_headless_shell-(\d+)$/.exec(entry);
      if (!match) continue;
      const version = Number(match[1]);
      if (!Number.isFinite(version)) continue;
      const dir = path.join(root, entry);
      let platform: string | undefined;
      try {
        platform = readdirSync(dir).find((child) => child.startsWith("chrome-headless-shell-"));
      } catch {
        continue;
      }
      if (!platform) continue;
      const executable = path.join(dir, platform, process.platform === "win32" ? "chrome-headless-shell.exe" : "chrome-headless-shell");
      if (existsSync(executable)) found.push({ version, executable });
    }
  }
  return found.sort((a, b) => b.version - a.version).map((item) => item.executable);
}

/** 显式指定优先；其次 Playwright 期望的可执行文件；再其次缓存里任一可用的 headless shell。 */
function configuredExecutable(): string | null {
  const explicit = process.env.CRAWLERS_BROWSER_PATH?.trim();
  if (explicit && existsSync(explicit)) return explicit;
  return null;
}

/** Tier 1 是否可能可用（后台的「降级未启用」据此显示）。 */
export function hasBrowser(): boolean {
  if (configuredExecutable()) return true;
  try {
    const expected = chromium.executablePath();
    if (expected && existsSync(expected)) return true;
  } catch {
    // Playwright 自己也可能因为版本目录缺失而抛错，继续看缓存。
  }
  return cachedExecutables().length > 0;
}

const executableMissing = (error: unknown) => /Executable doesn['’]t exist|executable doesn['’]t exist|is not found at/i.test(error instanceof Error ? error.message : String(error));

async function launchBrowser(): Promise<{ browser: Browser; executablePath: string | null }> {
  const configured = configuredExecutable();
  if (configured) return { browser: await chromium.launch({ headless: true, executablePath: configured }), executablePath: configured };
  try {
    return { browser: await chromium.launch({ headless: true }), executablePath: null };
  } catch (error) {
    if (!executableMissing(error)) throw error;
    const fallback = cachedExecutables()[0];
    if (!fallback) {
      throw Object.assign(new Error("Tier 1 不可用：Playwright 期望的 Chromium 未安装，缓存里也没有可回退的 chromium_headless_shell-*。"), { unavailable: true });
    }
    return { browser: await chromium.launch({ headless: true, executablePath: fallback }), executablePath: fallback };
  }
}

/**
 * 打开一个页面，把 page 交给调用方抽取，随后关闭 context / browser。
 * 浏览器起不来或页面加载失败都返回结构化结果，调用方可以记 skipped 或把 message 写成这一级的错误。
 */
export async function withPage<T>(url: string, extract: (page: import("playwright").Page) => Promise<T>, options: RenderOptions = {}): Promise<BrowserResult<T>> {
  if (!hasBrowser()) {
    return { ok: false, reason: "unavailable", message: "Tier 1 不可用：本机没有 Playwright Chromium 浏览器（未执行 npx playwright install）。" };
  }
  const waitMs = options.waitMs ?? 4000;
  const timeoutMs = options.timeoutMs ?? 45_000;
  let browser: Browser | null = null;
  let executablePath: string | null = null;
  try {
    const launched = await launchBrowser();
    browser = launched.browser;
    executablePath = launched.executablePath;
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      viewport: options.viewport ?? { width: 1366, height: 900 },
      javaScriptEnabled: true,
    });
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(timeoutMs);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      if (waitMs > 0) await page.waitForTimeout(waitMs);
      return { ok: true, value: await extract(page), executablePath };
    } finally {
      await context.close().catch(() => {});
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: (error as { unavailable?: boolean }).unavailable ? "unavailable" : "error", message: message.replace(/\s+/g, " ").slice(0, 500) };
  } finally {
    await browser?.close().catch(() => {});
  }
}
