// Packs the Chrome helper into public/ainable-setter-helper.zip, so a hosted copy can offer it as a download.
// Run before deploying whenever the helper changes: node scripts/pack-helper.mjs
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const web = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const src = path.resolve(web, "..", "extension");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helper-"));
const dir = path.join(tmp, "ainable-setter-helper");
fs.cpSync(src, dir, { recursive: true, filter: (p) => !/[\\/](test|node_modules)([\\/]|$)/.test(p.slice(src.length)) && !p.endsWith(".DS_Store") });
const out = path.join(web, "public", "ainable-setter-helper.zip");
fs.rmSync(out, { force: true });
execFileSync("zip", ["-qr", out, "ainable-setter-helper"], { cwd: tmp });
console.log("Packed", out, fs.statSync(out).size, "bytes");

// The Chrome Web Store upload: manifest.json at the top of the zip, and no localhost access.
const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
const local = (u) => u.startsWith("http://localhost");
manifest.host_permissions = manifest.host_permissions.filter((u) => !local(u));
for (const c of manifest.content_scripts) c.matches = c.matches.filter((u) => !local(u));
fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
const store = path.resolve(web, "..", "store", `ainable-setter-helper-${manifest.version}-store.zip`);
fs.mkdirSync(path.dirname(store), { recursive: true });
fs.rmSync(store, { force: true });
execFileSync("zip", ["-qr", store, "."], { cwd: dir });
fs.rmSync(tmp, { recursive: true, force: true });
console.log("Packed", store, fs.statSync(store).size, "bytes");
