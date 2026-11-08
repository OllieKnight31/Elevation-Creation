#!/usr/bin/env node
// Builds, then serves on the port chosen in setup (PORT in .env.local), 3000 if none.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(WEB, ".env.local");
const fromFile = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8").match(/^PORT=(\d+)/m)?.[1] : undefined;
const port = process.env.PORT || fromFile || "3000";
const next = path.join(WEB, "node_modules", "next", "dist", "bin", "next");
const run = (args) => spawnSync(process.execPath, [next, ...args], { cwd: WEB, stdio: "inherit" }).status ?? 1;

if (!process.argv.includes("--no-build")) { const code = run(["build"]); if (code) process.exit(code); }
process.exit(run(["start", "-p", port]));
