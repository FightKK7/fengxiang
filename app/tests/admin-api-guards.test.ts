// The admin HTTP edge must answer a crafted URL with 200/404, never 500: the strings a URL carries go
// straight into PostgreSQL text parameters, which reject NUL bytes, and a page number becomes an OFFSET
// (bigint). Password sign-ins are also budgeted per address by *failed* attempts, so an operator or an
// automated check signing in repeatedly is not locked out of the admin.
//
// ADMIN_PASSWORD is set before any module reads the config (the config module keeps its own snapshot).
process.env.ADMIN_PASSWORD = "test-admin-password-0123456789";

import assert from "node:assert/strict";
import { after, test } from "node:test";

await import("./setup.ts");
const { buildApp } = await import("../apps/api/src/app.ts");
const { closeDb } = await import("@aihot/backend/db");

const PASSWORD = process.env.ADMIN_PASSWORD;
const app = await buildApp();
after(async () => {
  await app.close();
  await closeDb();
});

const form = (fields: Record<string, string>) => new URLSearchParams(fields).toString();

async function signIn(password = PASSWORD, ip = "203.0.113.7") {
  return app.inject({
    method: "POST",
    url: "/api/auth/password",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": ip },
    payload: form({ password, return: "/admin" }),
  });
}

const cookieOf = (res: Awaited<ReturnType<typeof signIn>>) => {
  const header = res.headers["set-cookie"];
  const first = Array.isArray(header) ? header[0] : header;
  return String(first ?? "").split(";")[0];
};

const session = cookieOf(await signIn());
const get = (url: string) => app.inject({ method: "GET", url, headers: { cookie: session } });
const me = await (await get("/api/admin/me")).json();
const post = (url: string, payload: Record<string, unknown>) =>
  app.inject({ method: "POST", url, headers: { cookie: session, "x-csrf-token": String(me.csrf), "content-type": "application/json" }, payload: JSON.stringify(payload) });
const where = (res: { headers: Record<string, unknown> }) => String(res.headers.location ?? "");

test("a crafted query string or path id answers 200/404 instead of 500", async () => {
  for (const [url, expected] of [
    ["/api/admin/sources?q=%00", 200],
    ["/api/admin/sources?health=%00", 200],
    ["/api/admin/sources?kind=%00", 200],
    ["/api/admin/sources?mode=%00", 200],
    ["/api/admin/sources?q=a&q=b", 200],
    ["/api/admin/content?q=%00", 200],
    ["/api/admin/content?q=%00&q=x", 200],
    ["/api/admin/feedback?status=%00", 200],
    ["/api/admin/audit?subject=%00", 200],
    ["/api/admin/audit?action=%00", 200],
    ["/api/admin/sources/%00", 404],
    ["/api/admin/content/%00", 404],
    ["/api/admin/reports/daily/%00", 404],
    ["/api/admin/selectbench/%00", 404],
  ] as const) {
    const res = await get(url);
    assert.equal(res.statusCode, expected, `${url}: ${res.body}`);
  }
  // A real filter still works (the sanitizing must not swallow ordinary values).
  const filtered = await get(`/api/admin/sources?q=${encodeURIComponent("飞书")}`);
  assert.equal(filtered.statusCode, 200);
  assert.ok(Array.isArray(filtered.json().rows));
});

test("a page number too large for OFFSET is clamped instead of reaching PostgreSQL", async () => {
  const huge = "99999999999999999999";
  for (const url of [`/api/admin/sources?page=${huge}`, `/api/admin/feedback?page=${huge}`, `/api/admin/audit?page=${huge}`]) {
    const res = await get(url);
    assert.equal(res.statusCode, 200, `${url}: ${res.body}`);
    assert.equal(res.json().page, 10000, url);
  }
  for (const bad of ["-3", "abc", "1e9"]) {
    const res = await get(`/api/admin/sources?page=${bad}`);
    assert.equal(res.statusCode, 200, res.body);
    assert.ok(res.json().page >= 1 && res.json().page <= 10000, `${bad} → ${res.json().page}`);
  }
});

test("the models window is clamped to 1..90 days", async () => {
  for (const [query, days] of [
    ["-3", 1],
    ["0", 7],
    ["999", 90],
    ["abc", 7],
  ] as const) {
    const res = await get(`/api/admin/models?days=${query}`);
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().days, days, `days=${query}`);
  }
});

test("previewing a source kind that cannot be fetched is a client error, not a 500", async () => {
  // A normal-looking 「预览抓取」 click on an 外部上报 source used to answer 500 with an English detail:
  // the page showed it as a backend failure. These kinds are not fetchable at all — say so with a 400.
  for (const kind of ["external", "mp_account"]) {
    const res = await post("/api/admin/sources/preview", { id: "preview-guard", kind, config: {} });
    assert.equal(res.statusCode, 400, `${kind}: ${res.body}`);
    assert.match(res.json().detail, /不支持预览抓取/, `${kind}: ${res.body}`);
  }
  // The stored-source route used by the detail page behaves the same way.
  const { sql } = await import("@aihot/backend/db");
  await sql`INSERT INTO sources (id, name, kind) VALUES ('preview-guard-external', '外部上报样本', 'external')`;
  const stored = await post("/api/admin/sources/preview-guard-external/preview", {});
  assert.equal(stored.statusCode, 400, stored.body);
  assert.match(stored.json().detail, /外部上报类信源不支持预览抓取/, stored.body);
});

test("successful sign-ins do not use up the failed-attempt budget", async () => {
  // Twelve correct sign-ins in a row from one address: every one succeeds (no too-many).
  for (let i = 0; i < 12; i += 1) {
    const res = await signIn(PASSWORD, "203.0.113.21");
    assert.equal(res.statusCode, 303, res.body);
    assert.match(where(res), /\/admin$/, `sign-in ${i + 1} redirected to ${where(res)}`);
  }
  // Ten wrong ones from another address are allowed, the eleventh is turned away before the password
  // is checked — and so is the right password from there now.
  for (let i = 0; i < 10; i += 1) {
    const res = await signIn("wrong-password-xxxxxxxx", "203.0.113.22");
    assert.equal(res.statusCode, 303, res.body);
    assert.match(where(res), /error=wrong/, `failed sign-in ${i + 1} redirected to ${where(res)}`);
  }
  const blocked = await signIn("wrong-password-xxxxxxxx", "203.0.113.22");
  assert.match(where(blocked), /error=too-many/, where(blocked));
  const stillBlocked = await signIn(PASSWORD, "203.0.113.22");
  assert.match(where(stillBlocked), /error=too-many/, where(stillBlocked));
});
