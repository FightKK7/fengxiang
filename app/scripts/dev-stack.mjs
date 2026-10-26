#!/usr/bin/env node
// Starts the three development processes together: api (:3001), worker, web (:3000).
// Ctrl-C stops all three; if one exits, the rest are stopped too (a dev stack that "looks alive"
// while the worker is gone is how collection silently stops — 采集会在后台静默停止）。
//
//   npm run dev
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RESET = "\x1b[0m";
const COLORS = { api: "\x1b[36m", worker: "\x1b[35m", web: "\x1b[32m" };

let stopping = false;
const children = [];

function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const { child } of children) child.kill("SIGTERM");
  // Give each process a moment to close its listeners, then make sure nothing is left behind.
  setTimeout(() => {
    for (const { child } of children) child.kill("SIGKILL");
    process.exit(code);
  }, 3000).unref();
}

for (const name of ["api", "worker", "web"]) {
  const child = spawn("npm", ["run", `dev:${name}`], {
    cwd: root,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push({ name, child });
  for (const stream of [child.stdout, child.stderr]) {
    createInterface({ input: stream }).on("line", (line) => {
      process.stdout.write(`${COLORS[name]}[${name}]${RESET} ${line}\n`);
    });
  }
  child.on("error", (error) => {
    console.error(`[${name}] failed to start: ${error.message}`);
    stop(1);
  });
  child.on("exit", (code, signal) => {
    if (stopping) return;
    console.error(`[${name}] exited (${signal ?? code}); stopping the stack`);
    stop(code ?? 1);
  });
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

console.log("风向 dev stack: api :3001 / web :3000 / worker，Ctrl-C 全部停止");
