// 媒体源的准入：只有提到受监控实体（行业包 ENTITIES）的条目才进入采集池。
import assert from "node:assert/strict";
import { test } from "node:test";
import { mentionsTrackedEntity } from "@aihot/backend/sources/relevance";

test("mentioning a tracked entity keeps a media item", () => {
  assert.equal(mentionsTrackedEntity("飞书发布多维表格新功能"), true);
  assert.equal(mentionsTrackedEntity("DeepSeek 开源新模型"), true);
  assert.equal(mentionsTrackedEntity("DeepSeek Harness 版本更新"), true);
  assert.equal(mentionsTrackedEntity("Slack 调整定价"), true);
  assert.equal(mentionsTrackedEntity("Microsoft 365 Copilot 更新"), true);
  assert.equal(mentionsTrackedEntity("Salesforce 收购 Braze"), true);
});

test("an item about something else is dropped", () => {
  assert.equal(mentionsTrackedEntity("某明星离婚案开庭"), false);
  assert.equal(mentionsTrackedEntity("奇瑞说，中国家庭的下一台车是摩托"), false);
  assert.equal(mentionsTrackedEntity("奶茶新品上市"), false);
});

test("the摘要 alone may carry the entity", () => {
  assert.equal(mentionsTrackedEntity("企业办公市场新变化\n飞书与钉钉的定价对比"), true);
});
