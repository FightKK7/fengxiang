import assert from "node:assert/strict";
import { test } from "node:test";
import { bilingualBody } from "../packages/backend/src/content/bilingual.ts";

const english = [
  "<p><strong>Later becomes To-dos.</strong> Messages you save show up as To-dos.</p>",
  "<p>Activity has a new filter for people and apps.</p>",
  "<p>To-dos are available today on desktop and web.</p>",
].join("");
const chinese = [
  "<p><strong>Later 改为 To-dos。</strong>你保存的消息现在会显示为 To-dos。</p>",
  "<p>Activity 新增了按人员和应用筛选的功能。</p>",
  "<p>To-dos 现已在桌面端和网页端上线。</p>",
].join("");

test("pairs each original block with the translation of the same block, in order", () => {
  const paired = bilingualBody(english, chinese);
  assert.ok(paired);
  assert.equal(paired.html.match(/class="fx-pair"/g)?.length, 3);
  assert.equal(paired.html.match(/class="fx-tr"/g)?.length, 3);
  // 原文在前、译文紧跟其后；三块的译文顺序不能错位。
  assert.match(paired.html, /^<div class="fx-pair"><p><strong>Later becomes To-dos\.<\/strong>.*<\/p><div class="fx-tr" lang="zh"><p><strong>Later 改为 To-dos。<\/strong>/);
  assert.ok(paired.html.indexOf("Activity has a new filter") < paired.html.indexOf("Activity 新增了按人员和应用筛选"));
  assert.ok(paired.html.indexOf("To-dos are available today") < paired.html.indexOf("To-dos 现已在桌面端和网页端上线"));
});

test("a heading block keeps its anchor on the pair and the outline reads the translation", () => {
  const paired = bilingualBody("<h2>Pricing</h2><p>Prices change.</p>", "<h2>定价</h2><p>价格变了。</p>");
  assert.ok(paired);
  assert.match(paired.html, /^<div class="fx-pair" id="sec-1"><h2>Pricing<\/h2><div class="fx-tr" lang="zh"><h2>定价<\/h2>/);
  assert.deepEqual(paired.outline, [{ id: "sec-1", text: "定价", level: 2 }]);
});

test("blocks with no textual change (code, images) are not repeated and the translation's own media is dropped", () => {
  const original = '<p>Intro.</p><pre><code>const x = 1;</code></pre><figure><img src="https://example.org/a.png"><figcaption>A chart.</figcaption></figure>';
  const translated = '<p>前言。</p><pre><code>const x = 1;</code></pre><figure><img src="https://example.org/a.png"><figcaption>一张图。</figcaption></figure>';
  const paired = bilingualBody(original, translated);
  assert.ok(paired);
  assert.equal(paired.html.match(/class="fx-tr"/g)?.length, 2, "code block is not translated twice; the figure's caption is");
  assert.equal(paired.html.match(/<img /g)?.length, 1, "the image is shown once, from the original block");
  assert.ok(!/const x = 1;<\/code><\/pre><div class="fx-tr"/.test(paired.html));
  assert.match(paired.html, /一张图。/);
});

test("structures that do not line up are refused instead of paired by guesswork", () => {
  assert.equal(bilingualBody("<p>One.</p><p>Two.</p>", "<p>一。</p>"), null);
  assert.equal(bilingualBody("<p>One.</p>", "<ul><li>一</li></ul>"), null);
  assert.equal(bilingualBody("", "<p>一。</p>"), null);
});
