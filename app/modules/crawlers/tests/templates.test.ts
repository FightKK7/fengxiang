// 抓取模板与抓取器存储的行为测试：模板参数校验、build 只依赖传入的行、增删改查与软删除语义。
import assert from "node:assert/strict";
import test, { after } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { buildAdapter, TEMPLATES, templateOf, templateViews } from "../templates.ts";
import { createAdapter, deleteAdapter, getAdapter, listAdapters, updateAdapter } from "../store.ts";

// 每个测试文件自带一个数据库副本（tests/databases.ts）；文件结束时关掉连接，测试进程才能退出。
after(async () => { await closeDb(); });

test("模板注册表：id 唯一、视图完整、参数校验和 build 可离线执行", () => {
  assert.equal(new Set(TEMPLATES.map((entry) => entry.id)).size, TEMPLATES.length);
  assert.equal(templateOf("nope"), null);
  for (const view of templateViews()) {
    assert.ok(view.name.length > 0);
    assert.ok(view.url.startsWith("https://"));
    assert.ok(view.unit.length > 0);
    assert.ok(view.tiers.length > 0);
  }
  const feishu = templateOf("feishu-changelog")!;
  assert.deepEqual(feishu.config({ months: "6" }), { months: 6 });
  assert.throws(() => feishu.config({ months: 0 }), /1–12/);
  assert.throws(() => feishu.config({ months: 13 }), /1–12/);
  assert.deepEqual(templateOf("feishu-pricing")!.config({}), {});

  const row = {
    id: "custom-1", name: "自定义抓取器", template: "feishu-changelog", source_id: "feishu-changelog",
    url: "https://example.com/page", config: { months: 2 }, enabled: true,
    source_name: "飞书功能变化", source_enabled: true, created_at: new Date(), updated_at: new Date(),
  };
  const adapter = buildAdapter(row);
  assert.equal(adapter.id, "custom-1");
  assert.equal(adapter.name, "自定义抓取器");
  assert.equal(adapter.sourceId, "feishu-changelog");
  assert.equal(adapter.unit, "条");
  assert.equal(adapter.tiers.length, 2);
  assert.throws(() => buildAdapter({ ...row, template: "gone" }), /模板/);
});

test("抓取器存储：新建 → 读取（带目标信源）→ 修改 → 软删除后不再出现", async () => {
  await sql`INSERT INTO sources (id, name, kind) VALUES ('crawler-test-src', '抓取测试源', 'external') ON CONFLICT DO NOTHING`;
  const created = await createAdapter({
    name: "测试抓取器", template: "feishu-changelog", sourceId: "crawler-test-src",
    url: "https://example.com/feed", config: { months: 2 }, enabled: true,
  });
  assert.match(created.id, /^feishu-changelog-/);
  const got = await getAdapter(created.id);
  assert.equal(got?.name, "测试抓取器");
  assert.equal(got?.source_name, "抓取测试源");
  assert.equal(got?.source_enabled, true);
  assert.equal(got?.config.months, 2);

  const updated = await updateAdapter(created.id, {
    name: "改名后的抓取器", sourceId: "crawler-test-src",
    url: "https://example.com/v2", config: { months: 1 }, enabled: false,
  });
  assert.equal(updated?.name, "改名后的抓取器");
  assert.equal(updated?.enabled, false);
  assert.equal(updated?.url, "https://example.com/v2");

  assert.equal(await deleteAdapter(created.id), true);
  assert.equal(await getAdapter(created.id), null);
  assert.ok(!(await listAdapters()).some((adapter) => adapter.id === created.id));
  // 再删一次返回 false（已经不存在），不会影响别的抓取器。
  assert.equal(await deleteAdapter(created.id), false);
  assert.equal(await deleteAdapter("no-such-adapter"), false);
});
