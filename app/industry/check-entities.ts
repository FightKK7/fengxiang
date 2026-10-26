// 身份词典自检：entityIdentity() 必须把每个实体 id、显示名和别名唯一地解析回它自己。
// 用法（在 app/ 目录）： node industry/check-entities.ts
//
// 背景：别名只能「多认」，不能「抢」。同一个写法同时属于两家公司时，entityIdentity() 会匹配到多家
// 而返回 null，representativePriority() 就认不出一手源（Slack 与 Salesforce 曾经互相把对方写进
// orgNames / otherNames，两家的 id 都解析成 null）。新增公司或别名后跑一遍这个脚本。
import { ENTITIES } from "./taxonomy.ts";
import { entityIdentity } from "@aihot/backend/editorial/vocabulary";

type Entity = (typeof ENTITIES)[string];

const key = (value: string) => value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, "");
const entityNames = (id: string, entity: Entity) => [id, entity.name, ...entity.aliases, ...(entity.orgNames ?? []), ...(entity.otherNames ?? [])];
const aliasNames = (entity: Entity) => [...entity.aliases, ...(entity.orgNames ?? []), ...(entity.otherNames ?? [])];

let failures = 0;
const fail = (message: string) => {
  failures += 1;
  console.error(`FAIL ${message}`);
};

/** 与 packages/backend/src/publication/representative.ts 的判定顺序一致（这里只是复核，不连库）。 */
function representativePriority(row: { source_tier: string; publisher_role: string | null; owner_entity_id: string | null; fact_subject: string | null }) {
  if (row.source_tier === "T1") return 0;
  const owner = entityIdentity(row.owner_entity_id);
  const subjects = row.fact_subject?.split(/[,，、;；+＋&＆/]/u).map((subject) => entityIdentity(subject)) ?? [];
  if (!owner || subjects.some((subject) => !subject) || !subjects.includes(owner)) return 3;
  if (row.publisher_role === "organization") return 1;
  if (row.publisher_role === "person") return 2;
  return 3;
}

// 1. 每个 id / 显示名都解析回自己；16 家逐行打印，便于肉眼核对。
console.log("id               entityIdentity(id)   entityIdentity(name)");
const ids = Object.keys(ENTITIES);
for (const id of ids) {
  const entity = ENTITIES[id]!;
  const byId = entityIdentity(id);
  const byName = entityIdentity(entity.name);
  console.log(`  ${id.padEnd(16)} ${String(byId).padEnd(20)} ${String(byName)}`);
  if (byId !== id) fail(`${id}: entityIdentity("${id}") = ${byId}，应为 ${id}`);
  if (byName !== id) fail(`${id}: entityIdentity(显示名 "${entity.name}") = ${byName}，应为 ${id}`);
}

// 2. 每个实体的每个写法（别名、组织名、产品名）都解析回它自己：不允许 null，也不允许串号。
for (const id of ids) {
  const entity = ENTITIES[id]!;
  for (const name of aliasNames(entity)) {
    const resolved = entityIdentity(name);
    if (resolved !== id) fail(`${id}: 别名 "${name}" 解析成 ${resolved}，应为 ${id}`);
  }
}

// 3. 词典不变量：同一个写法只能属于一家公司（这是上面歧义的根因检查）。
const owners = new Map<string, string>();
for (const id of ids) {
  for (const name of entityNames(id, ENTITIES[id]!)) {
    const normalized = key(name);
    const existing = owners.get(normalized);
    if (existing && existing !== id) fail(`"${name}" 同时属于 ${existing} 和 ${id}`);
    else owners.set(normalized, id);
  }
}

// 4. 「精确 id/name 不能被别家的别名抢」：任何实体的 id 或显示名都不得出现在别家的别名集合里。
for (const id of ids) {
  const entity = ENTITIES[id]!;
  for (const otherId of ids) {
    if (otherId === id) continue;
    for (const name of aliasNames(ENTITIES[otherId]!)) {
      if (key(name) === key(id) || key(name) === key(entity.name)) fail(`${otherId} 的别名 "${name}" 抢了 ${id} 的 id/显示名`);
    }
  }
}

// 5. 代表源优先级复核：本家官方源报本家事实 = 一手（1）；别家事实不能靠别名抢成一手（3）。
const demonstrated: Array<[string, number]> = [];
for (const id of ids) {
  const fact = ENTITIES[id]!.name;
  const own = representativePriority({ source_tier: "T1_5", publisher_role: "organization", owner_entity_id: id, fact_subject: fact });
  demonstrated.push([`${id} 官方源 + ${fact}`, own]);
  if (own !== 1) fail(`representativePriority(${id} 报 ${fact}) = ${own}，应为 1`);
}
for (const [owner, subject] of [["slack", "Salesforce"], ["salesforce", "Slack"]]) {
  const borrowed = representativePriority({ source_tier: "T1_5", publisher_role: "organization", owner_entity_id: owner, fact_subject: subject });
  demonstrated.push([`${owner} 官方源 + ${subject}`, borrowed]);
  if (borrowed !== 3) fail(`representativePriority(${owner} 报 ${subject}) = ${borrowed}，应为 3（别名不能抢身份）`);
}

console.log("\n代表源优先级（T1_5 + 机构官方源）：");
for (const [label, priority] of demonstrated) console.log(`  ${String(priority).padEnd(2)} ${label}`);

const slack = entityIdentity("Slack");
const salesforce = entityIdentity("Salesforce");
if (slack !== "slack") fail(`entityIdentity("Slack") = ${slack}，应为 slack`);
if (salesforce !== "salesforce") fail(`entityIdentity("Salesforce") = ${salesforce}，应为 salesforce`);

console.log("\nidentity map:", JSON.stringify({ Slack: slack, Salesforce: salesforce }));
if (failures > 0) {
  console.error(`\n${failures} 项自检失败`);
  process.exit(1);
}
console.log(`\nOK：${ids.length} 家公司的 id / 显示名 / 别名均唯一解析，代表源优先级符合预期`);
