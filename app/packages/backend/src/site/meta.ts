// Small site-wide facts for the web shell (e.g. the changelog red-dot anchor).
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ChangelogResponse, SiteMeta } from "@aihot/contracts/site";
import { REPO_ROOT } from "../config.ts";
import { sql } from "../db.ts";

let changelogCache: ChangelogResponse | null = null;

/** Changelog is published as a data file of the site (site/changelog.json), newest first. */
export function loadChangelog(): ChangelogResponse {
  changelogCache ??= JSON.parse(readFileSync(path.join(REPO_ROOT, "site/changelog.json"), "utf8")) as ChangelogResponse;
  return changelogCache;
}

/**
 * 刊头的事实：changelog 红点版本 + 最近一次真实抓取时间。
 * 抓取时间取「最近成功的 fetch_run」与「最新素材入库」中较晚者：前者证明我们在抓，
 * 后者覆盖外部推送（feishu-collect）这类不写 fetch_runs 的抓取。
 */
export async function siteMeta(): Promise<SiteMeta> {
  const [row] = await sql<{ last_fetched_at: Date | null }[]>`
    SELECT GREATEST(
      (SELECT max(finished_at) FROM fetch_runs WHERE status = 'ok'),
      (SELECT max(discovered_at) FROM articles)
    ) AS last_fetched_at`;
  return {
    changelogVersion: loadChangelog().latestVersion,
    lastFetchedAt: row?.last_fetched_at ? new Date(row.last_fetched_at).toISOString() : null,
  };
}
