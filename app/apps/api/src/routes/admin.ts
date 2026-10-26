// /api/admin/*: queries are GET, creation POST, edits PATCH, business commands POST.
// Every route goes through adminHandler (session + CSRF); manual changes are audited in the modules.
import { readFile } from "node:fs/promises";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AdminSourceUpdate } from "@aihot/contracts/admin";
import { actorOf } from "@aihot/backend/admin/auth";
import { navCounts } from "@aihot/backend/admin/navigation";
import { listAudit } from "@aihot/backend/audit";
import { importSelectBenchRun, listSelectBenchRuns, selectBenchRun } from "@aihot/backend/admin/selectbench";
import { modelsOverview, switchModel } from "@aihot/backend/admin/models";
import { contentChain, overrideFields, rerun, searchContent, setSeoIndexed, setVisibility } from "@aihot/backend/admin/content";
import { discardReportDraft, listReports, publishReportDraft, regenerateReport, reportEditor, rollbackReport, saveReportDraft } from "@aihot/backend/admin/reports";
import { detachFromFact, mergeStories } from "@aihot/backend/events/corrections";
import { banFeedbackEmail, banSource, eraseFeedback, feedbackScreenshot, listFeedback, unbanSource, updateFeedback } from "@aihot/backend/admin/feedback";
import { requeueFailedArticles, runsOverview } from "@aihot/backend/admin/runs";
import { resolveDelivery } from "@aihot/backend/notify/deliver";
import { releaseReceipt } from "@aihot/backend/operations/recover";
import { replaceContactQr, setTargetEnabled, settingsOverview, updateBudget } from "@aihot/backend/admin/settings";
import { batchSources, createSource, fetchNow, listSources, previewSource, previewStoredSource, sourceDetail, updateSource } from "@aihot/backend/admin/sources";
import { sendProblem } from "../http/respond.ts";
import { adminHandler } from "./admin-auth.ts";

// What every admin route reads its request with (the modules' admin routes too).
type Q = Record<string, string | undefined>;

/** A query/path string we will hand to PostgreSQL: a crafted URL must not 500 the admin API. */
const MAX_PARAM_LENGTH = 512;
function cleanParam(value: unknown): string {
  // Decoded strings may carry NUL (PostgreSQL rejects 0x00 in text) or lone surrogates (invalid UTF-8).
  // Long values are truncated: every admin filter/identifier here is short, and search patterns with
  // no bound are needless work for the database.
  return String(value ?? "").replace(/\u0000/g, "").replace(/[\uD800-\uDFFF]/g, "\uFFFD").slice(0, MAX_PARAM_LENGTH);
}
export const q = (req: FastifyRequest): Q => {
  const raw = (req.query ?? {}) as Record<string, unknown>;
  const out: Q = {};
  for (const [key, value] of Object.entries(raw)) {
    // A repeated key (`?q=a&q=b`) arrives as an array; reading it as text would throw downstream
    // (or hand PostgreSQL an array where a string is expected). The browser's own URLSearchParams.get()
    // reads the last value, so do the same.
    const text = Array.isArray(value) ? [...value].reverse().find((v) => typeof v === "string") as string | undefined : value;
    out[key] = text === undefined ? undefined : cleanParam(text);
  }
  return out;
};
export const body = <T = Record<string, unknown>>(req: FastifyRequest) => (req.body ?? {}) as T;
export const param = (req: FastifyRequest, name: string) => cleanParam((req.params as Record<string, string>)[name]);
const notFound = (req: FastifyRequest, reply: FastifyReply) => sendProblem(req, reply, { status: 404, code: "not_found", detail: "Not found." });
export const orNotFound = <T>(req: FastifyRequest, reply: FastifyReply, value: T | null) => (value === null || value === undefined ? notFound(req, reply) : value);
/** 1 until a page number too large for OFFSET/`bigint` (a crafted `?page=` would 500 the list otherwise). */
const MAX_PAGE = 10000;
export const page = (req: FastifyRequest) => {
  const parsed = Number.parseInt(String(q(req).page ?? ""), 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), MAX_PAGE) : 1;
};

function decodeImage(dataUrl: unknown): Buffer {
  const m = /^data:image\/(png|jpeg|webp);base64,(.+)$/s.exec(String(dataUrl ?? ""));
  if (!m) throw Object.assign(new Error("image must be a PNG, JPEG or WebP data URL"), { statusCode: 400 });
  return Buffer.from(m[2]!, "base64");
}

export function registerAdmin(app: FastifyInstance) {
  // Sources
  app.get("/api/admin/sources", adminHandler(async (req) => {
    const f = q(req);
    return listSources({ q: f.q, kind: f.kind, health: f.health, mode: f.mode, enabled: f.enabled as "true" | "false" | undefined, page: page(req) });
  }));
  app.post("/api/admin/sources", adminHandler(async (req, _reply, admin) => createSource(body(req), actorOf(admin))));
  app.post("/api/admin/sources/batch", adminHandler(async (req, _reply, admin) => batchSources(body(req), actorOf(admin))));
  app.post("/api/admin/sources/preview", adminHandler(async (req) => previewSource(body(req) as never)));
  app.get("/api/admin/sources/:id", adminHandler(async (req, reply) => orNotFound(req, reply, await sourceDetail(param(req, "id")))));
  app.patch("/api/admin/sources/:id", adminHandler(async (req, reply, admin) => {
    const b = body<AdminSourceUpdate>(req);
    return orNotFound(req, reply, await updateSource(param(req, "id"), b, actorOf(admin)));
  }));
  app.post("/api/admin/sources/:id/preview", adminHandler(async (req, reply) => orNotFound(req, reply, await previewStoredSource(param(req, "id")))));
  app.post("/api/admin/sources/:id/fetch", adminHandler(async (req, reply, admin) => orNotFound(req, reply, await fetchNow(param(req, "id"), actorOf(admin)))));

  // Content and events
  app.get("/api/admin/content", adminHandler(async (req) => ({ rows: await searchContent(q(req).q ?? "") })));
  app.get("/api/admin/content/:id", adminHandler(async (req, reply) => orNotFound(req, reply, await contentChain(param(req, "id")))));
  app.post("/api/admin/content/:id/visibility", adminHandler(async (req, _reply, admin) => setVisibility(param(req, "id"), body(req) as never, actorOf(admin))));
  app.post("/api/admin/content/:id/seo", adminHandler(async (req, reply, admin) => orNotFound(req, reply, await setSeoIndexed(param(req, "id"), body(req) as never, actorOf(admin)))));
  app.post("/api/admin/content/:id/override", adminHandler(async (req, _reply, admin) => overrideFields(param(req, "id"), body(req) as never, actorOf(admin))));
  app.post("/api/admin/content/:id/rerun", adminHandler(async (req, reply, admin) => {
    const b = body<import("@aihot/contracts/admin").AdminRerun>(req);
    const requestId = String(req.headers["idempotency-key"] ?? "");
    return orNotFound(req, reply, await rerun(param(req, "id"), b.step, requestId, actorOf(admin), { preview: b.preview, version: b.version }));
  }));
  app.post("/api/admin/content/:id/detach", adminHandler(async (req, _reply, admin) => detachFromFact(param(req, "id"), String(body(req).reason ?? ""), actorOf(admin))));
  app.post("/api/admin/stories/merge", adminHandler(async (req, _reply, admin) => {
    const b = body<{ from: number; into: number; reason: string }>(req);
    return mergeStories(Number(b.from), Number(b.into), b.reason, actorOf(admin));
  }));

  // Reports (出刊台): the issue's draft, publishing it, regenerating it and rolling it back. The GET
  // carries the issue's price estimate and revision history, so the page needs no second read.
  app.get("/api/admin/reports", adminHandler(async () => listReports()));
  app.get("/api/admin/reports/:kind/:key", adminHandler(async (req, reply) => orNotFound(req, reply, await reportEditor(param(req, "kind"), param(req, "key")))));
  app.post("/api/admin/reports/:kind/:key/draft", adminHandler(async (req, reply, admin) =>
    orNotFound(req, reply, await saveReportDraft(param(req, "kind"), param(req, "key"), body(req), actorOf(admin)))));
  app.post("/api/admin/reports/:kind/:key/draft/discard", adminHandler(async (req, reply, admin) =>
    orNotFound(req, reply, await discardReportDraft(param(req, "kind"), param(req, "key"), body(req), actorOf(admin)))));
  app.post("/api/admin/reports/:kind/:key/publish", adminHandler(async (req, reply, admin) =>
    orNotFound(req, reply, await publishReportDraft(param(req, "kind"), param(req, "key"), body(req), actorOf(admin), String(req.headers["idempotency-key"] ?? "")))));
  app.post("/api/admin/reports/:kind/:key/regenerate", adminHandler(async (req, reply, admin) =>
    orNotFound(req, reply, await regenerateReport(param(req, "kind"), param(req, "key"), body(req), actorOf(admin), String(req.headers["idempotency-key"] ?? "")))));
  app.post("/api/admin/reports/:kind/:key/rollback", adminHandler(async (req, reply, admin) =>
    orNotFound(req, reply, await rollbackReport(param(req, "kind"), param(req, "key"), body(req), actorOf(admin), String(req.headers["idempotency-key"] ?? "")))));

  // Feedback
  app.get("/api/admin/feedback", adminHandler(async (req) => listFeedback({ status: q(req).status, q: q(req).q, page: page(req) })));
  app.patch("/api/admin/feedback/:id", adminHandler(async (req, reply, admin) => orNotFound(req, reply, await updateFeedback(Number(param(req, "id")), body(req) as never, actorOf(admin)))));
  app.post("/api/admin/feedback/:id/erase", adminHandler(async (req, reply, admin) => orNotFound(req, reply, await eraseFeedback(Number(param(req, "id")), String(body(req).reason ?? ""), actorOf(admin)))));
  app.get("/api/admin/feedback/:id/screenshot", adminHandler(async (req, reply) => {
    const file = await feedbackScreenshot(Number(param(req, "id")));
    const data = file ? await readFile(file).catch(() => null) : null;
    if (!data) return notFound(req, reply);
    const ext = file!.split(".").pop();
    return reply.type(ext === "jpeg" || ext === "jpg" ? "image/jpeg" : `image/${ext}`).send(data);
  }));
  app.post("/api/admin/feedback-bans", adminHandler(async (req, reply, admin) => {
    const b = body<{ sourceHash: string; feedbackId?: number; reason: string }>(req);
    if (b.feedbackId !== undefined) await banFeedbackEmail(b.feedbackId, b.reason, actorOf(admin));
    else await banSource(b.sourceHash, b.reason, actorOf(admin));
    return reply.code(204).send();
  }));
  app.delete("/api/admin/feedback-bans/:hash", adminHandler(async (req, reply, admin) => {
    await unbanSource(param(req, "hash"), actorOf(admin));
    return reply.code(204).send();
  }));

  // Runs
  app.get("/api/admin/runs", adminHandler(async () => runsOverview()));
  app.post("/api/admin/receipts/:id/release", adminHandler(async (req, reply, admin) => orNotFound(req, reply, await releaseReceipt(Number(param(req, "id")), body(req) as never, actorOf(admin)))));
  app.post("/api/admin/deliveries/:id/resolve", adminHandler(async (req, reply, admin) => orNotFound(req, reply, await resolveDelivery(Number(param(req, "id")), body(req) as never, actorOf(admin)))));
  app.post("/api/admin/processing/requeue", adminHandler(async (req, _reply, admin) => requeueFailedArticles(body(req) as never, actorOf(admin))));

  // Settings
  app.get("/api/admin/settings", adminHandler(async () => settingsOverview()));
  app.post("/api/admin/settings/contact-qr", adminHandler(async (req, _reply, admin) => {
    const b = body<{ slot: "wechatQr" | "feishuQr"; image: string }>(req);
    return replaceContactQr({ slot: b.slot, data: decodeImage(b.image) }, actorOf(admin));
  }));
  app.post("/api/admin/notify-targets/:key", adminHandler(async (req, reply, admin) => {
    const b = body<{ enabled: boolean; reason: string }>(req);
    return orNotFound(req, reply, await setTargetEnabled(param(req, "key"), !!b.enabled, b.reason, actorOf(admin)));
  }));
  app.put("/api/admin/budgets/:service", adminHandler(async (req, _reply, admin) => updateBudget(param(req, "service"), body(req) as never, actorOf(admin))));


  // Models and evaluation
  app.get("/api/admin/models", adminHandler(async (req) => modelsOverview(Math.min(90, Math.max(1, Number(q(req).days) || 7)))));
  app.post("/api/admin/models/:capability", adminHandler(async (req, _reply, admin) => {
    const b = body<{ model: string | null; reason: string }>(req);
    return switchModel(param(req, "capability"), b.model ?? null, String(b.reason ?? ""), actorOf(admin));
  }));

  // SelectBench
  app.get("/api/admin/selectbench", adminHandler(async () => ({ runs: await listSelectBenchRuns() })));
  app.get("/api/admin/selectbench/:id", adminHandler(async (req, reply) => {
    const f = q(req);
    return orNotFound(req, reply, await selectBenchRun(param(req, "id"), { model: f.model, outcome: f.outcome, stratum: f.stratum, disagree: f.disagree === "1" }));
  }));
  app.post("/api/admin/selectbench/import", adminHandler(async (req, _reply, admin) => {
    const b = body<{ label: string; report: unknown }>(req);
    return importSelectBenchRun(b.report, String(b.label || "导入的对比运行"), actorOf(admin));
  }));

  // Attention counts for the navigation, and the audit trail.
  app.get("/api/admin/nav-counts", adminHandler(async () => navCounts()));
  app.get("/api/admin/audit", adminHandler(async (req) => listAudit({ subject: q(req).subject, action: q(req).action, page: page(req) })));
}
