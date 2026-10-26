// Bodies never carry embedded audio or video (2026-10-23：不再内嵌音视频，图片保留). Readability
// kept publishers' players; extraction now drops the elements and every later stage — translation,
// Markdown, the image proxy — must keep them out while the article's pictures and ordinary links stay.
import "./setup.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import * as cheerio from "cheerio";
import { readable } from "@aihot/backend/content/extract";
import { sanitizeBody } from "@aihot/backend/content/sanitize";
import { bodyToMarkdown, markdownBody } from "@aihot/backend/content/markdown";
import { shield, unshield } from "@aihot/backend/editorial/translate";
import { proxyBodyImages } from "@aihot/backend/media/imgproxy";

const base = "https://publisher.example/posts/article";
const prose = "An ordinary article explains the announcement and includes a demonstration of the work. ".repeat(6);
const video = '<video data-src="/clip.mp4?token=example&amp;quality=high" data-poster="/cover.jpg?token=poster&amp;frame=1" width="1280" height="720" autoplay loop controls preload="auto"><source data-src="/clip.webm" type="video/webm"></video>';

test("article extraction drops embedded players and keeps the article's pictures", () => {
  const body = readable(`<html><head><title>Article</title></head><body><article><h1>Article</h1><p>${prose}</p><img src="/picture.png" width="800" height="400">${video}<p>${prose}</p></article></body></html>`, base);
  assert.ok(body);
  assert.doesNotMatch(body.html, /<video|<source|data-src|autoplay|\bloop=|\bpreload=/);
  const $ = cheerio.load(body.html);
  assert.equal($("img").attr("src"), "https://publisher.example/picture.png");
  assert.doesNotMatch(body.html, /clip\.(?:mp4|webm)|\/cover\.jpg/, "the player's media URLs are not kept either");
  assert.equal(sanitizeBody(body.html, base), body.html, "translation and export can clean the body again");
});

test("sanitizing drops players and their fallbacks, keeps pictures and ordinary links", () => {
  const html = sanitizeBody('<picture><source srcset="/image.webp 1x"><img src="/image.png"></picture><source src="/orphan.mp4"><video><source data-src="/clip.webm" type="video/webm"><source src="/clip.mp4" type="video/mp4"><a href="https://example.org/watch">Watch elsewhere</a></video><p><a href="https://example.org/more">More</a></p>', base);
  assert.doesNotMatch(html, /<video|<source|srcset|orphan|clip\.(?:mp4|webm)/);
  const $ = cheerio.load(html);
  assert.equal($("picture img").attr("src"), "https://publisher.example/image.png");
  assert.equal($("p a").attr("href"), "https://example.org/more");
  assert.equal(sanitizeBody(html, base), html, "cleaning a body again changes nothing");
});

test("an unsafe player leaves no payload or script behind", () => {
  const html = sanitizeBody('<p>Before</p><video width="1280" height="720" data-src="javascript:alert(1)" data-poster="javascript:alert(2)" onclick="alert(3)"><source data-src="data:video/mp4;base64,AAAA"><script>alert(4)</script><a href="https://example.org/watch">Watch elsewhere</a></video><p>After</p>', base);
  assert.doesNotMatch(html, /<video|<source|<script|javascript:|data:video|onclick|alert\(/);
  assert.match(html, /Before/);
  assert.match(html, /After/);
  assert.equal(sanitizeBody(html, base), html);
});

test("translation, Markdown and public image outputs carry no players", () => {
  const html = sanitizeBody(`<p>Before.</p>${video}<p>After.</p>`, base);
  assert.equal(html, "<p>Before.</p><p>After.</p>");
  const protectedBody = shield(html);
  assert.equal(sanitizeBody(unshield(protectedBody.html, protectedBody)!, base), html, "a translation round trip keeps it out");
  const markdown = bodyToMarkdown(html, base);
  assert.doesNotMatch(markdown, /<video|clip\.(?:mp4|webm)|cover\.jpg/);
  assert.equal(markdownBody(markdown, base), html);
  for (const absolute of [false, true]) assert.equal(proxyBodyImages(html, absolute), html);
});
