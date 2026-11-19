// Checks the cold outreach rules in web/lib/outreach.ts on stand in data. No database, no browser, no network.
// Run: node test/outreach-rules-check.mjs
//
// The rules: the helper types inside instagram.com only for first messages to accounts that do not follow the owner,
// 5 to 10 an hour (never more than the hour's number in any 60 minutes), 50 a day at most, and an inbox reply is
// never handed to the helper unless settings.instagramTyping is true.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.join(here, "..", "web");
const require = createRequire(path.join(web, "package.json"));
const ts = require("typescript");

// Gaps between sends are scaled to nothing, so the hourly and daily caps are the only things holding sends back.
process.env.SETTER_OUTREACH_GAP_SCALE = "0";

// The same random numbers every run, so a failure can be repeated.
let seed = 20261119;
Math.random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// The library is TypeScript, so it is compiled in memory. Its only imports are crypto and the defaults file.
const defaults = JSON.parse(fs.readFileSync(path.join(web, "lib", "outreach-defaults.json"), "utf8"));
const lib = (() => {
  const src = fs.readFileSync(path.join(web, "lib", "outreach.ts"), "utf8");
  const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  const req = (name) => (name === "./outreach-defaults.json" ? defaults : name === "crypto" ? require("node:crypto") : (() => { throw new Error("unexpected import " + name); })());
  new Function("require", "module", "exports", out)(req, mod, mod.exports);
  return mod.exports;
})();
const { normaliseOutreach, cleanSettings, importProspects, saveCampaign, nextTask, recordResult, recordFollowers, clearFollowers, followersKnown, requestFollowers, followersBatch, queueReply, hourlyRange, capToday } = lib;

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  cond ? pass++ : fail++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  -> " + String(typeof extra === "string" ? extra : JSON.stringify(extra)).slice(0, 400)}`);
};

const VARIANTS = ["hey {first_name|there}, one", "hi {first_name|there}, two", "hello {first_name|there}, three", "yo {first_name|there}, four", "morning {first_name|there}, five"].map((text) => ({ text }));

/** A workspace with nothing in it, set up so only the caps under test hold sending back. */
function makeDb(settings = {}, { typing = false } = {}) {
  const db = {
    workspace: {
      outreach: normaliseOutreach(undefined),
      settings: { instagramTyping: typing, autopilotMaster: false },
      meta: { instagram: null },
      intake: { ownerName: "Sam", businessName: "Stand In Ltd" },
      helper: { account: "owner" },
    },
    conversations: [],
    messages: [],
  };
  const o = db.workspace.outreach;
  o.settings = cleanSettings({ enabled: true, timezone: "UTC", hourStart: 0, hourEnd: 24, ramp: false, dailyMin: 50, dailyMax: 50, minGapSeconds: 60, ...settings }, o.settings);
  return db;
}

function addCampaign(db, count, prefix = "cold") {
  const r = importProspects(db, "Stand in list " + prefix, Array.from({ length: count }, (_, i) => `${prefix}_${i}`).join("\n"));
  saveCampaign(db, { name: "Stand in campaign " + prefix, listIds: [r.listId], variants: VARIANTS, status: "active" });
  return r;
}

/** Runs the clock a minute at a time, sending whatever nextTask hands out. Returns every send with the hour's number at that moment. */
function run(db, start, minutes) {
  const sends = [];
  const targets = new Map();
  for (let i = 0; i < minutes; i++) {
    const now = new Date(start.getTime() + i * 60_000);
    const res = nextTask(db, "", now);
    const hour = db.workspace.outreach.hour;
    if (hour) targets.set(hour.key, hour.target);
    if (!res.task) continue;
    sends.push({ at: now.getTime(), handle: res.task.handle, target: hour?.target, day: now.toISOString().slice(0, 10) });
    recordResult(db, { id: res.task.id, status: "sent" }, now);
  }
  return { sends, targets };
}

/** The most sends found in any 60 minutes. */
const worstHour = (sends) => Math.max(0, ...sends.map((s, i) => sends.filter((x, j) => j <= i && x.at > s.at - 3600_000).length));
const perDay = (sends) => sends.reduce((m, s) => m.set(s.day, (m.get(s.day) ?? 0) + 1), new Map());

/* ---------- 1. defaults and the limits a saved setting cannot pass ---------- */
{
  const p = defaults.pacing;
  ok("defaults: 5 to 10 an hour, hard ceiling 10", p.hourlyMin === 5 && p.hourlyMax === 10 && p.hourlyHardMax === 10, p);
  ok("defaults: the day never goes above 50", p.hardMax === 50 && p.dailyMax <= 50, p);
  const fresh = normaliseOutreach(undefined).settings;
  ok("a new workspace starts at 5 to 10 an hour", fresh.hourlyMin === 5 && fresh.hourlyMax === 10, fresh);
  ok("a workspace saved before this change (no hourly numbers) reads as 5 to 10", hourlyRange({ ...fresh, hourlyMin: undefined, hourlyMax: undefined }).min === 5 && hourlyRange({ ...fresh, hourlyMin: undefined, hourlyMax: undefined }).max === 10);
  ok("an older saved hourly limit of 8 is kept, with 5 as the low end", hourlyRange({ ...fresh, hourlyMin: undefined, hourlyMax: 8 }).min === 5 && hourlyRange({ ...fresh, hourlyMin: undefined, hourlyMax: 8 }).max === 8);
  const wild = cleanSettings({ hourlyMin: 40, hourlyMax: 99, dailyMin: 400, dailyMax: 500 }, fresh);
  ok("asking for 99 an hour is held at 10", wild.hourlyMax === 10 && wild.hourlyMin === 10, wild);
  ok("asking for 500 a day is held at 50", wild.dailyMax === 50 && wild.dailyMin === 50, wild);
  ok("a stored value above the ceiling is still read as 10", hourlyRange({ ...fresh, hourlyMin: 3, hourlyMax: 60 }).max === 10);
  const low = cleanSettings({ hourlyMin: 9, hourlyMax: 4 }, fresh);
  ok("the low end can never sit above the high end", low.hourlyMax === 4 && low.hourlyMin === 4, low);
  ok("the build up is on for a new workspace and holds day one at its start number", fresh.ramp === true && capToday(fresh).max === p.rampStart, capToday(fresh));
  ok("the build up can be switched off", cleanSettings({ ramp: false }, fresh).ramp === false && capToday({ ...fresh, ramp: false }).max === fresh.dailyMax);
}

/* ---------- 2. hourly pacing and the daily ceiling over two days ---------- */
{
  const db = makeDb();
  recordFollowers(db, []);
  addCampaign(db, 160);
  const { sends, targets } = run(db, new Date("2026-01-05T00:00:30Z"), 2 * 1440);
  const days = perDay(sends);
  ok("day one sends 50, no more", days.get("2026-01-05") === 50, [...days]);
  ok("day two sends 50, no more", days.get("2026-01-06") === 50, [...days]);
  ok("no 60 minutes holds more than 10 sends", worstHour(sends) <= 10 && worstHour(sends) >= 5, worstHour(sends));
  const over = sends.filter((s, i) => sends.filter((x, j) => j <= i && x.at > s.at - 3600_000).length > s.target);
  ok("no send ever takes a rolling hour past that hour's number", over.length === 0, over.slice(0, 3));
  const t = [...targets.values()];
  ok("every clock hour's number is between 5 and 10", t.length > 10 && t.every((n) => n >= 5 && n <= 10), t);
  ok("the hourly number changes from hour to hour", new Set(t).size > 1, t);
  ok("nobody is messaged twice", new Set(sends.map((s) => s.handle)).size === sends.length);
  const after = nextTask(db, "", new Date("2026-01-06T23:59:00Z"));
  ok("once the day is done the helper is told why", after.task === null && /done/.test(after.reason), after);
}

/* ---------- 3. a narrow hourly range is a hard cap in any rolling hour ---------- */
{
  const db = makeDb({ hourlyMin: 3, hourlyMax: 3 });
  recordFollowers(db, []);
  addCampaign(db, 60);
  // Starts 40 minutes into an hour, so a window that straddles two clock hours is tested too.
  const { sends } = run(db, new Date("2026-02-02T09:40:10Z"), 300);
  ok("3 an hour: 15 sends in 5 hours", sends.length === 15, sends.length);
  ok("3 an hour: never more than 3 in any 60 minutes", worstHour(sends) === 3, worstHour(sends));
  const blocked = nextTask(db, "", new Date(sends[sends.length - 1].at + 60_000));
  ok("the wait is explained as the hour's number being done", blocked.task === null && /This hour's 3 messages are done/.test(blocked.reason), blocked);
}

/* ---------- 4. lowering the limit takes effect in the same hour ---------- */
{
  const db = makeDb({ hourlyMin: 10, hourlyMax: 10 });
  recordFollowers(db, []);
  addCampaign(db, 40);
  const start = new Date("2026-03-03T12:00:10Z");
  const first = run(db, start, 4).sends.length;
  db.workspace.outreach.settings = cleanSettings({ hourlyMin: 2, hourlyMax: 2 }, db.workspace.outreach.settings);
  const rest = run(db, new Date(start.getTime() + 4 * 60_000), 50).sends.length;
  ok("a lower hourly limit saved mid hour stops sends at once", first === 4 && rest === 0, { first, rest });
}

/* ---------- 5. the build up holds a new account back ---------- */
{
  const db = makeDb({ ramp: true, rampStart: 10, rampStep: 5 });
  recordFollowers(db, []);
  addCampaign(db, 80);
  const days = perDay(run(db, new Date("2026-04-06T00:00:30Z"), 2 * 1440).sends);
  ok("with the build up on, day one stops at 10 and day two at 15", days.get("2026-04-06") === 10 && days.get("2026-04-07") === 15, [...days]);
}

/* ---------- 6. followers are never cold messaged ---------- */
{
  const db = makeDb();
  addCampaign(db, 6, "person");
  const now = new Date("2026-05-04T10:00:00Z");
  const waiting = nextTask(db, "", now);
  ok("nothing is sent until the follower list is on record", waiting.task === null && /follower list/i.test(waiting.reason), waiting);
  ok("the screen is told no followers are on record", followersKnown(db).count === 0 && followersKnown(db).updatedAt === "");

  const r = recordFollowers(db, ["person_0", "@Person_1", "https://www.instagram.com/person_2/", "not a handle!", 42]);
  ok("followers are recorded from handles, @handles and profile links", r.read === 3 && r.recorded === 3 && r.total === 3, r);
  const o = db.workspace.outreach;
  const gone = o.prospects.filter((p) => ["person_0", "person_1", "person_2"].includes(p.handle));
  ok("a follower waiting on a list is taken off it with the reason", r.leftOut === 3 && gone.every((p) => p.status === "skipped" && /Follows you/.test(p.detail)), gone.map((p) => [p.status, p.detail]));
  ok("recording followers creates no list and no prospect", o.lists.length === 1 && o.prospects.length === 6, { lists: o.lists.length, prospects: o.prospects.length });

  recordFollowers(db, ["outside_fan"]);
  const again = importProspects(db, "Second list", "person_0\noutside_fan\nbrand_new");
  ok("importing a follower as a prospect is refused and counted", again.added === 1 && again.followers === 1 && again.duplicates === 1, again);

  // Someone who started following after they were put on a list: recorded behind the list's back, caught at send time.
  o.followerHandles.push("person_3");
  const sent = run(db, now, 120).sends.map((s) => s.handle);
  ok("only people who do not follow are messaged", sent.length === 2 && sent.includes("person_4") && sent.includes("person_5"), sent);
  const p3 = o.prospects.find((p) => p.handle === "person_3");
  ok("a follower reached at send time is skipped with a clear reason", p3.status === "skipped" && p3.detail === "Follows you. Cold messages only go to people who do not follow you.", p3);
  ok("no follower was ever handed to the helper", !sent.some((h) => o.followerHandles.includes(h)));

  // The helper's follower reader records followers too, and never builds a list.
  requestFollowers(db, 500);
  const lists = o.lists.length, prospects = o.prospects.length;
  const b = followersBatch(db, { users: [{ username: "fresh_follower", name: "Fresh Follower" }, { username: "person_0" }], end: true });
  ok("the helper's follower reader records followers only", b.done === true && b.added === 1 && o.followerHandles.includes("fresh_follower") && o.lists.length === lists && o.prospects.length === prospects, { b, lists: o.lists.length });
  ok("no list called My followers exists", !o.lists.some((l) => l.name === "My followers"));
  const named = importProspects(db, "My followers", "someone_else");
  ok("a list cannot be named My followers any more", !o.lists.some((l) => /^my followers$/i.test(l.name)) && named.added === 1, o.lists.map((l) => l.name));

  // The reader only sees the newest few, so by itself it never lets cold messages start.
  const alone = makeDb();
  addCampaign(alone, 3, "lonely");
  requestFollowers(alone, 500);
  followersBatch(alone, { users: [{ username: "newest_fan" }], end: true });
  ok("the helper's reader by itself does not start cold messages", alone.workspace.outreach.followerHandles.includes("newest_fan") && nextTask(alone, "", now).task === null && followersKnown(alone).updatedAt === "");

  clearFollowers(db);
  ok("forgetting the followers makes cold messages wait again", followersKnown(db).updatedAt === "" && nextTask(db, "", new Date("2026-05-04T13:00:00Z")).task === null);
}

/* ---------- 7. an old My followers list becomes followers, not prospects ---------- */
{
  const old = normaliseOutreach(undefined);
  const saved = {
    ...old,
    lists: [{ id: "l_f", name: "My followers", columns: [], createdAt: "" }, { id: "l_c", name: "Cold list", columns: [], createdAt: "" }],
    prospects: [
      { id: "p1", listId: "l_f", handle: "fan_one", name: "", fields: {}, status: "queued", attempts: 0, addedAt: "" },
      { id: "p2", listId: "l_f", handle: "fan_two", name: "", fields: {}, status: "sent", attempts: 0, addedAt: "", sentAt: "2026-01-01T00:00:00.000Z", campaignId: "oc1" },
      { id: "p3", listId: "l_c", handle: "stranger", name: "", fields: {}, status: "queued", attempts: 0, addedAt: "" },
    ],
    campaigns: [{ id: "oc1", name: "Old", listIds: ["l_f", "l_c"], variants: VARIANTS.map((v, i) => ({ id: "v" + i, ...v })), status: "active", createdAt: "" }],
  };
  const o = normaliseOutreach(saved);
  ok("old list: its people are recorded as followers", ["fan_one", "fan_two"].every((h) => o.followerHandles.includes(h)), o.followerHandles);
  ok("old list: it does not count as the full follower file, so cold messages still wait for that", !o.followersAt);
  ok("old list: nobody on it is still waiting to be messaged", !o.prospects.some((p) => p.handle === "fan_one") && o.prospects.some((p) => p.handle === "stranger" && p.status === "queued"), o.prospects.map((p) => p.handle));
  ok("old list: what was already sent stays on record", o.prospects.some((p) => p.handle === "fan_two" && p.status === "sent"));
  ok("old list: no campaign points at it and the name is gone", o.campaigns[0].listIds.join() === "l_c" && !o.lists.some((l) => l.name === "My followers"), { c: o.campaigns[0].listIds, l: o.lists.map((l) => l.name) });
  const twice = normaliseOutreach(o);
  ok("loading the workspace again changes nothing more", twice.prospects.length === o.prospects.length && twice.followerHandles.length === o.followerHandles.length && twice.lists.length === o.lists.length);
}

/* ---------- 8. inbox replies never go to the helper unless Instagram typing is on ---------- */
{
  const reply = (db) => {
    db.conversations.push({ id: "c1", handle: "warm_lead", name: "Warm Lead" });
    db.messages.push({ id: "m1", conversationId: "c1", text: "first bubble", delivery: "queued" }, { id: "m2", conversationId: "c1", text: "second bubble", delivery: "queued" });
    queueReply(db, { conversationId: "c1", handle: "warm_lead", messages: [{ id: "m1", text: "first bubble" }, { id: "m2", text: "second bubble" }] });
  };
  const now = new Date("2026-06-01T10:00:00Z");

  const off = makeDb({}, { typing: false });
  reply(off);
  const res = nextTask(off, "", now);
  ok("typing off: the helper is handed nothing", res.task === null, res);
  ok("typing off: both messages are marked not sent, with the reason", off.messages.every((m) => m.delivery === "failed" && /Meta only/.test(m.deliveryNote)), off.messages);
  ok("typing off: nothing is left in the queue to go out later", !off.workspace.outreach.prospects.some((p) => p.reply));
  ok("typing off: asking again still hands out nothing", nextTask(off, "", new Date(now.getTime() + 60_000)).task === null);

  const disabled = makeDb({ enabled: false }, { typing: false });
  reply(disabled);
  ok("typing off and outreach off: the reply is still cancelled", nextTask(disabled, "", now).task === null && disabled.messages.every((m) => m.delivery === "failed") && !disabled.workspace.outreach.prospects.some((p) => p.reply));

  const unset = makeDb();
  delete unset.workspace.settings.instagramTyping;
  reply(unset);
  ok("typing never set (a new customer): treated as off", nextTask(unset, "", now).task === null && unset.messages.every((m) => m.delivery === "failed"));

  const on = makeDb({}, { typing: true });
  reply(on);
  const handed = nextTask(on, "", now);
  ok("typing on: the reply is handed to the helper as before", handed.task?.handle === "warm_lead" && handed.task?.text === "first bubble", handed);

  // The other half of the rule lives in engine.ts: a chat is only ever routed to the helper when the switch is on.
  const engine = fs.readFileSync(path.join(web, "lib", "engine.ts"), "utf8");
  const body = engine.slice(engine.indexOf("export function sendVia("), engine.indexOf("export function cannotSend("));
  const helperLines = body.split("\n").filter((l) => /return "helper"/.test(l));
  ok("engine.ts: sendVia answers helper only when instagramTyping is true", helperLines.length === 1 && /settings\.instagramTyping === true/.test(helperLines[0]), helperLines);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
