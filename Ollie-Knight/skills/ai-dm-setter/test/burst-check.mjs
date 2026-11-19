// Checks the burst rules (several lead messages in a row each get an answer). Run: node --experimental-strip-types test/burst-check.mjs
import { unanswered, missed, burstBlock, burstRoom, asksSomething } from "../web/lib/burst.ts";
let pass = 0, fail = 0;
const ok = (name, cond) => { cond ? pass++ : (fail++, console.log("FAIL", name)); };
let t = 0;
const m = (direction, text, sender) => ({ id: String(++t), conversationId: "c", direction, sender: sender ?? (direction === "in" ? "lead" : "owner"), text, sentAt: new Date(Date.UTC(2026, 0, 1, 0, 0, t)).toISOString(), source: "webhook" });

// 1. three in a row after our last message
let a = [m("in", "hey"), m("out", "hey man", "ai"), m("in", "how much is it?"), m("in", "and do you work with gyms"), m("in", "im in manchester btw")];
let w = unanswered(a);
ok("burst of three found", w.length === 3 && w[0].text === "how much is it?");
ok("block lists all three", /1\. how much is it\?\n2\. and do you work with gyms\n3\. im in manchester btw/.test(burstBlock(w)));
ok("room is three", burstRoom(w.length) === 3);
ok("skipping a question is caught", missed(w, [1, 3]).length === 1 && missed(w, [1, 3])[0].text.includes("gyms"));
ok("skipping a statement is allowed", missed(w, [1, 2]).length === 0);
ok("all covered passes", missed(w, [1, 2, 3]).length === 0);
ok("nothing addressed catches both questions", missed(w, []).length === 2);

// 2. single message: no special handling
a = [m("out", "hey", "owner"), m("in", "whats the price?")];
w = unanswered(a);
ok("single message", w.length === 1 && burstBlock(w) === "" && missed(w, []).length === 0);

// 3. lead never answered at all
w = unanswered([m("in", "hi"), m("in", "saw your reel"), m("in", "how does it work?")]);
ok("no reply yet: all three wait", w.length === 3);

// 4. a message that landed while the AI was writing sits before the AI reply
const q1 = m("in", "what do you charge?");
const late = m("in", "also is there a contract?");
const r1 = m("out", "depends what you need", "ai");
const r2 = m("out", "whats the business?", "ai");
const after = m("in", "its a gym");
w = unanswered([m("out", "yo", "owner"), q1, late, r1, r2, after], q1.sentAt);
ok("late message is picked up", w.length === 2 && w[0].text === "also is there a contract?" && w[1].text === "its a gym");
w = unanswered([m("out", "yo", "owner"), q1, late, r1, r2, after], late.sentAt);
ok("nothing late when the reply had read it", w.length === 1 && w[0].text === "its a gym");
w = unanswered([m("out", "yo", "owner"), q1, late, r1, r2, after]);
ok("no marker: only messages since our last", w.length === 1);

// 5. the owner replied by hand after the late message: the owner covered it
const o = m("out", "no contract mate", "owner");
w = unanswered([q1, late, r1, o, m("in", "nice")], q1.sentAt);
ok("owner reply closes earlier messages", w.length === 1 && w[0].text === "nice");

// 6. long bursts and filler
w = unanswered(Array.from({ length: 20 }, (_, i) => m("in", "msg " + i)));
ok("capped at 12", w.length === 12 && w[11].text === "msg 19");
ok("room capped at 4", burstRoom(9) === 4);
ok("attachment asks nothing", !asksSomething("[attachment]"));
ok("question word without mark", asksSomething("how does the call work"));
ok("plain statement", !asksSomething("im in manchester btw"));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
