// Re-derives a source's public rows now (development / operations helper).
// Use after changing a source's publication fields outside the admin (site_fulltext, tier, name…):
// the admin route queues the same job, this is the offline path.
//   node --env-file=.env scripts/republish.ts rss-google-workspace-updates web-slack-changelog
import { closeDb } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { republishSource } from "@aihot/backend/publication/publish";

for (const id of process.argv.slice(2)) {
  const started = performance.now();
  const r = await republishSource(id, async (done, total) => {
    if (done === total) console.log(`  [${id}] ${done}/${total}`);
  });
  console.log(JSON.stringify({ source: id, ...r, ms: Math.round(performance.now() - started) }));
}
await stopBoss();
await closeDb();
