# Unit bsuite-sender: the helper sends inbox messages inside Meta Business Suite only

Status: done as built and tested on stand ins. NOTHING here has been run against the real Meta Business Suite: every selector it depends on is a guess (list below). It is off by default in the app and in the helper.

Checks run at the end (fact, command output):
- `npx tsc --noEmit` in web/: exit 0
- `node extension/test/run-tests.js`: 58 passed, 0 failed (was 49; 9 new)
- `node extension/test/run-browser-tests.js`: 43 passed, 0 failed (was 35; 8 new)
- `node test/outreach-rules-check.mjs`: 52 passed, 0 failed (other unit's test, still green)
- `node test/sweep-check.mjs`: 102 passed, 0 failed (other unit's test, still green)
- Scratch check of the app side, 60 passed, 0 failed (49 before the fix pass, 11 new for Human Agent approved): (session scratch file, not kept) (run with the project root as its argument; not added to the project because test/ is outside this unit's files)

No version number was changed. Nothing was deployed, no browser was pointed at Instagram or Business Suite, no message was sent, production was not read or written.

## What it does, end to end

1. Owner switches on Settings, AI tab, "Send through Meta Business Suite" (`settings.businessSuiteSending`). Off for a new customer.
2. `sendVia` (web/lib/engine.ts:321) answers:
   - "meta" for anything Meta will take: inside 24 hours, or, when META_HUMAN_AGENT=approved, a lead whose last message is under 7 days old (less one hour of margin, `humanAgentOpen`, engine.ts:343). Always first. A lead who never wrote is never "meta".
   - "suite" for every other Instagram chat when the switch is on, the helper is linked and the chat has a username or a real name. No age limit, with the Human Agent switch unset or set to approved: 25 hours (unset) , 8 days, 3 years, never replied, and chats with no Meta id (history import) all answer "suite". With the switch approved, 24 hours to 7 days goes to Meta with the tag and everything past that goes to "suite". Fact: scratch check, both env states.
   - "helper" (typing inside instagram.com) only when `instagramTyping` is on, as before. With both switches on, Business Suite wins.
   - "none" otherwise. Messenger chats are never routed to Business Suite.
3. `deliver` (engine.ts:358) queues a "suite" message the way helper replies were queued (message added with `delivery: "queued"`), through `queueReply` with a `suite` mark `{ name, auto }` (web/lib/outreach.ts:746). `auto` is true for AI and keyword rule messages.
4. The helper's new Business Suite runner asks `POST /api/ext/outreach/next` with `{ account: "", channel: "suite" }`. `nextTask` (outreach.ts:386) sends that to `nextSuiteTask` (outreach.ts:506). The Instagram channel is never handed a Business Suite message and the suite channel is never handed anything else (fact: scratch check, both directions).
5. The helper opens `https://business.facebook.com/latest/inbox` in its own pinned background tab, finds the chat, checks it, types with the existing human typing planner, presses send, reads the message back, and reports to `POST /api/ext/outreach/result` (route unchanged; `recordResult`, outreach.ts:557, handles the suite mark).

## Pacing and safety rules (all fact, source in brackets)

| Rule | Value | Where |
|---|---|---|
| Gap between Business Suite messages | 60 seconds at least, counted from when the last one finished | `SUITE.gapSeconds`, outreach.ts:58, nextSuiteTask |
| Sending hours | automatic messages only inside Outreach sending hours (hourStart, hourEnd, timezone). A message a person typed goes at any hour | nextSuiteTask |
| One at a time | nothing is handed out on either channel while any message is being sent; the helper also stands back while the outreach sender is busy | nextTask "A message is being sent", suite-runner.js pollOnce:943, background.js:126 |
| Order | bubbles of one reply go in order; oldest waiting first | nextSuiteTask |
| Checked again at hand out | chat gone, Do not contact, Close friend (automatic only), or the lead wrote after an automatic message was queued: cancelled with a note, not sent | nextSuiteTask |
| Warning seen | status "blocked" pauses ALL Chrome sending (cold outreach too) with a Business Suite reason, until Resume | recordResult |
| Broken page | 3 "error" results in a row pause it. "not found", "not certain" and "cannot reply" do not count | `SUITE.errorsBeforePause`, recordResult |
| Helper silent | a task not reported within 12 minutes fails and is never typed twice | expireLeases |
| Switch turned off with messages waiting | cancelled with "Not sent: sending through Meta Business Suite is switched off." | nextTask, top |
| Daily ceiling | none (`SUITE.dailyMax: 0`). The counter exists; set a number to switch it on. See Decisions | outreach.ts:58 |
| Queue length for the sweep | `suiteRoom(db)` returns how many more may be queued (3 waiting at most) | outreach.ts:498 |

## How the helper decides it has the right person (extension/src/suite/suite-runner.js)

- Search order (`findAndVerify`, line 510): the chats already listed, then a search for the username, then a search for the name.
- An entry is only opened when its title is exactly the name or the username, or it is the single result of a username search (`candidates`, line 188). Never a partial title.
- At most 2 chats are opened per message (`MAX_OPENED`), because opening a chat can mark it read.
- The match (`matchThread`, line 136) needs BOTH:
  1. who: the username from a profile link on the page or from the header; or, failing that, a header that is exactly the name. A profile link naming a different username is a refusal even when the name matches.
  2. last message: the newest message the app has on record (not queued, not failed) is among the last 8 messages shown, and nothing the app does not know about comes after it.
  - A name only match is weaker, so it also needs a last message of 20 characters or more, or the message before it to match as well.
  - A Messenger chat is refused.
- The match must hold on two looks in a row (the inbox still shows the previous chat for a moment), and is checked again before typing, every 40 typing steps, and once more just before send.
- Not certain: nothing is typed, status "skipped", and the detail says why (for example "The open chat belongs to @x, not @y" or "The open chat shows something newer than the app has on record").
- Send (`pressSend`, suite-content.js:423) is the send control only: refused unless the reply box holds exactly the text, refused with no control, with two controls, or with a disabled one. There is no Enter key path and no keyboard event in either file.
- The tab only ever loads the one inbox address (a constant in the runner). A task carries no address. Both files refuse to do anything on a host other than business.facebook.com and never name instagram.com.

Result statuses: sent, skipped (not certain, draft in the box, chat changed, switched off mid task), not_found (no chat found), unreachable (the page says the chat cannot be replied to), blocked (warning or login form), error (page did not behave as expected).

## Files and functions

App:
- web/lib/engine.ts: `sendVia` (gains "suite"), `searchableName` (new), `cannotSend` (rewritten copy, names Business Suite and the setting), `deliver` (queues suite and helper sends in one branch), re-exports `suiteSending`.
- web/lib/outreach.ts: `suiteSending`, `SuiteMark`, `SUITE`, `suiteWaiting`, `suiteRoom`, `nextSuiteTask` (all new); `nextTask` (fourth argument `channel`, cancel loop now covers both switches), `recordResult` (suite branch, error count, daily count), `queueReply` (optional `suite`), `outreachStatus` (adds `suiteSending`, `suiteWaiting`), `resume` (clears the suite error count), `expireLeases` (wording).
- web/app/api/ext/outreach/next/route.ts: passes `channel`.
- web/app/api/ext/outreach/result/route.ts: unchanged.
- web/app/settings/page.tsx: new section "Chats Meta cannot reach" with the toggle "Send through Meta Business Suite" (AI tab, under the AI section).

Helper:
- extension/src/suite/suite-content.js (new, 490 lines): the page side. Commands: probe, rows, search, open-row, thread, focus-composer, step, read-composer, clear-composer, send.
- extension/src/suite/suite-runner.js (new, 1,065 lines): the service worker side. Pure functions `validateTask`, `matchThread`, `candidates`, `sameMessage`; `createRunner`.
- extension/src/background.js: loads the runner, `syncSuite` (reads `suiteSending` from GET /api/ext/outreach/status after each heartbeat and switches the runner), the once a minute outreach alarm now also ticks the suite runner after the outreach runner, self update and the follower reader wait for either sender, `aidm:suite` messages are left to the tab.
- extension/src/lib/api.js: `outreachNext` forwards `channel: "suite"` and nothing else new.
- extension/src/selectors.js, under businessSuite: new target `dialog`; new markers `noResultsTexts`, `cannotReplyTexts`, `statusTexts`; `sendButton` comment and description changed (it is still on the click blocklist for everything else).
- extension/test/suite/suite-sender.html and suite-sender-run.js (new): the stand in inbox and its driver.
- extension/test/run-tests.js, extension/test/run-browser-tests.js: see below.

Task contract (app to helper): `{ id, channel: "suite", handle, name, text, mode: "auto", expect: { last: [{ text, partial, out }] newest first, up to 4 }, readMs, typing, detect }`.

Note on duplication (fact): the reply box editing functions in suite-content.js (endRange, caretAtEnd, ensureCaret, edit, applyStep, clearComposer) repeat those in src/outreach/outreach-content.js, which this unit may not change. They could be shared from one file later.

## Hard rule tests changed, each narrowly (extension/test/run-tests.js)

1. "one guarded click path": the list of files holding a click is now dom.js 1, outreach sender 2, Business Suite sender 1. Nothing else changed in that test. The new click is pinned down in the new carve out test (inside pressSend, after the text check, the no control check, the two controls check and the disabled check).
2. "no network code in content scripts": src/suite/ added to the files checked; the count floor went from 9 to 11.
3. "every referenced file exists": the suite runner's injected files are checked too.
4. "selectors.js": every businessSuite target and marker the new sender uses must exist.
5. Test stand ins only: the stub app answers POST /api/ext/hello and can say `suiteSending`; the fake worker has `getManifest` (the heartbeat needs it); "a message cannot redirect the call" now counts ping requests by route, because the heartbeat reaches the stub at its own moment.
Unchanged on purpose: "no keyboard events outside the outreach sender" (the Business Suite sender has none), "nothing follows or likes", the outreach carve out.

## Tests added

run-tests.js (9): the Business Suite carve out (one click, no keyboard events, business.facebook.com only, one address, own tab and storage keys, off by default, only the worker switches it, only the runner commands it); matching rules; which entries may be opened and which tasks are refused; API client and worker (off until the app says so, on after the heartbeat, off again); runner on a fake inbox with a virtual clock: right chat found and sent, wrong or uncertain chat refused, search finds nothing and chats that cannot be written in, warnings and chats that change, one at a time, never beside outreach, foreign task handed back, restart, closed tab, switch off mid task, time limit.

run-browser-tests.js (8), real content script and real runner in headless Chrome against test/suite/suite-sender.html: commands and guards; right thread found and sent (rich text editor box and a plain text area, with emoji, a link and a line break); wrong thread refused (same name other person, another chat opens, Messenger); search finds nothing; warning text shown (dialog while typing, login form at load); closed chat, lead writes while typing, dead send control; tab and address rules.

Mutation check (fact, run here, files restored after): seven deliberate breaks each made tests fail: newer message check off (3 failed), username mismatch ignored (2), last message not needed (2), runs beside outreach (1), on by default (4), send without the text check (1), any site allowed (1 unit, 1 browser).

## UNVERIFIED against the real Meta Business Suite

No data found for any of these on the live page; all are guesses (extension/src/selectors.js, businessSuite). Each one that is wrong fails safe (nothing typed or nothing sent) and names itself in the result detail.

Selectors the sender depends on:
- threadList, threadRow, threadRowTitle, threadRowClickTarget: the conversation column and its entries. Wrong: "Selector miss: businessSuite.threadList" or not found.
- threadSearchInput: the search box. Wrong: "The inbox could not be searched".
- threadHeaderName: the name above the open chat. Wrong: "no readable name".
- threadHeaderProfileLink: a link to the lead's Instagram profile. If the page has none, only the name can match (the weaker rule).
- platformBadgeInstagram, platformBadgeMessenger, markers.urlPlatformHints: Instagram or Messenger. If neither answers the platform is unknown and is not a reason to refuse.
- messageList, messageRow, messageText: the messages. Wrong: "No message could be read".
- composer: the reply box. Wrong: "Selector miss: businessSuite.composer".
- sendButton: the send control. Wrong: nothing sent, selector named.
- dialog, loginForm: warning detection.
- markers noResultsTexts, cannotReplyTexts, statusTexts: wording guesses. A missing status word (for example a "Seen" line in other words) makes the sender refuse with "something newer than the app has on record", quoting the word to add.

Behaviour that is assumed, not known:
1. That https://business.facebook.com/latest/inbox opens the inbox of the right account. If the owner manages several Pages or accounts, Business Suite may open another one. Then leads are not found, or (same name, other inbox) refused by the last message check.
2. That the search box filters as text is set in it, with no Enter key. The sender never presses Enter. If Business Suite needs Enter, only chats already in the loaded list will be found.
3. That the search finds Instagram chats by username, and that entry titles are the display name or the username.
4. That Business Suite lets a reply be typed in an Instagram chat older than 24 hours, older than 7 days, or one where the lead never wrote. This is the owner's requirement 8 and it is speculation that Meta allows it there. If Business Suite shows a "cannot reply" notice the result is "unreachable" (if the wording is in cannotReplyTexts) or "Selector miss: businessSuite.composer". Either way the owner sees the reason on the message, and three "error" results in a row pause it.
5. That the page works in a pinned background tab (same assumption the outreach sender makes about instagram.com).
6. That the reply box takes typing through beforeinput or execCommand, like the Instagram box does.
7. That a message cut short in the app (`partial`) starts the same as the full message on the page, and that long messages are shown whole (no "See more").
8. Inference: the helper's own panel and label sync also load on that tab (manifest content scripts). Label sync only runs when asked from the popup, so it should not collide, but do not run it while a send is in progress.
9. Whether typed sends inside Business Suite carry any account risk. No data found.

## First supervised test (the lead, with the owner watching)

Do this on the live app only after deploy and a helper reload. Use a second Instagram account of the owner's as the "lead" (it has messaged the main account more than 24 hours ago).
1. In Chrome, open business.facebook.com/latest/inbox by hand, signed in, and confirm it shows the inbox of @oliverknzght. Click the helper icon and run "Selector health check" there. Fix any required businessSuite target reported "not found" in extension/src/selectors.js (threadList, threadRow, threadRowTitle, threadSearchInput, messageList, messageRow, messageText, threadHeaderName, composer; sendButton is listed as optional but the sender needs it).
2. Type the test account's username in the search box by hand: does the list filter without Enter, and what does the entry title read? Open the chat: is there a link to instagram.com/username on the page, and does the reply box appear for a chat older than 24 hours? Note any "cannot reply" wording and add it to cannotReplyTexts.
3. In the app, make sure the test chat exists, has a username, and that its last message in the app is the same as the last message on the page.
4. Keep Autopilot off for this test, or set that chat's AI to off, so only one message is in play. Switch on Settings, AI, "Send through Meta Business Suite".
5. Wait for the helper to pick the switch up (15 minutes at most, or reload the helper on chrome://extensions to make it ask at once).
6. Send one short reply to the test chat from the app (needs lead task 2 below, or use the AI draft's Send button, which is not blocked). The bubble shows "Waiting for the helper to send it from Chrome".
7. Watch the pinned Business Suite tab: inbox loads, search, chat opens, typing, send. Under a minute to start, typing at human speed.
8. Check three places: the message arrived on the test account; the bubble in the app lost its waiting line; Outreach, activity log shows "Business Suite, sent".
9. Refusal test: send again to a chat whose last message in the app is NOT the last on the page (write something in the chat by hand first). Expected: nothing typed, bubble shows "Not sent. Not certain this is the right person..." with the reason.
10. Only then let Autopilot use it (lead task 1), and watch the first few.
If anything looks wrong: switch the setting off. Waiting messages are cancelled on the helper's next check and nothing more is handed out.

## What the lead must do

### 1. web/lib/sweep.ts, so Autopilot follow ups and waiting replies go through Business Suite (this unit may not edit it)

Today the sweep is Meta only by design: `reachOf` returns "notConnected", "noMetaId", "noInbound", "windowClosed" or "other" for every chat this unit now routes to "suite", and `dueKind` only allows a follow up while Meta's window is open. `canAutopilot` and `deliver` already accept the suite route (fact: scratch check "Autopilot may use the Business Suite route"), so only the sweep's own gates are in the way. Exact changes:

a. Import: `import { suiteRoom } from "./outreach";`

b. `reachOf`: after the five gates that are about the lead (Close friend, Do not contact, AI off, Needs human, Late stage) and before the Meta gates, add:
```ts
  // Outside Meta's reach (window closed however long ago, never replied, no Meta id): the helper sends it inside
  // Meta Business Suite when the owner has switched that on.
  if (sendVia(db, conv) === "suite") return null;
```
The remaining gates stay as they are for every other chat.

c. `dueKind`: give it the route and add a branch for "suite" before the window rule. Suggested signature `dueKind(conv, m, s, now, done, via: "meta" | "suite")`:
```ts
  if (via === "suite") {
    // No window to race here. One follow up per silence, once our last message has sat unanswered for followUpHours.
    return quiet >= s.followUpHours && done < FOLLOW_UP_MAX ? "followUp" : null;
  }
```
The "answer" rule above it (last message is the lead's, older than 10 minutes) already fits a suite chat as it is. `followUpHours` is in the saved settings and unused today, so this brings it back for suite chats only. A lead who never replied has `lastInboundAt: null`; the follow up count is anchored on that value, so such a lead gets one follow up, ever, until they write. "Oldest silence allowed" is `maxAgeDays: 0` (production already has 0; the product default is 90, change `SWEEP_DEFAULTS` if a new customer should also have no limit).

d. Call sites of `dueKind` (`sweepDue` line 147 and `workChat` line 276): pass `sendVia(db, conv) === "suite" ? "suite" : "meta"`.

e. One a minute: in `sweepTick`, split the picks. Keep the Meta batch as it is, and take at most `suiteRoom(db)` suite chats per tick (0 when the queue already holds 3, when sending is paused, or when the switch is off). The helper sends one a minute at most, so anything more only makes the AI write messages that then wait and go stale. Sorting suite picks newest silence first matches the Meta rule; the owner asked that no age be shut out, not for a particular order.

f. `workChat`: a suite message is queued, not sent, when `aiTurn` returns true. Log it truthfully, for example `reason: "Queued for Meta Business Suite"` when `added.some((m) => m.delivery === "queued")`. The real outcome arrives later on the message itself (`delivery`, `deliveryNote`) and in the Outreach activity log under "Business Suite". After a failed suite send the chat's last message is ours and marked failed, so `dueKind` never picks it again (no retry storm).

g. `sweepReach` / REACH_REASONS: with (b) in place those chats count as reachable. Add a count of "reachable through Business Suite" if the activity panel should show the split.

h. test/sweep-check.mjs will need new cases; its stand in for engine/outreach must provide `suiteRoom`.

Volume warning (fact from the sweep-meta unit's read of production today: 1,568 chats where the lead never wrote, 1,279 with no Meta id, 547 with the window closed over 7 days): with (b) to (e) and both sweep switches on, Autopilot would start working through about 3,400 chats at up to one a minute. See Decisions 1 before switching that on.

### 2. Inbox screen (files outside this unit)

- web/components/thread.tsx `reach()` line 17: add `if (c.sendVia === "suite") return { ok: true, text: "Sends inside Meta Business Suite through the helper in Chrome" };`. Without it the reply box is disabled for these chats (web/app/inbox/page.tsx:540, `disabled={!r.ok}`), so a person cannot send one by hand even though the app would queue it.
- web/components/ui.tsx line 7: `sendVia?: "meta" | "suite" | "helper" | "none"`.
- web/app/inbox/page.tsx line 477: the "24 hour window has closed" banner should also be hidden when `c.sendVia === "suite"`.
- web/components/thread.tsx line 104: "Waiting for the helper to send it from Chrome" is still true; no change needed.
- web/lib/ai.ts line 259 tells the AI "closed, so this reply would be sent by the owner by hand as a follow up". Still a fair hint for tone; adjust if wanted.

### 3. Types (web/lib/types.ts, owned by another unit this wave)

- `Workspace.settings.businessSuiteSending?: boolean` next to `instagramTyping`; then drop the two casts (outreach.ts:51, settings/page.tsx:51).
- `Prospect.suite?: { name: string; auto: boolean }`; then drop `SuiteMark`'s local intersection (`QueueRow`, `suiteOf`) in outreach.ts.
- `Outreach.suite?: { lastAt: string; errors?: number; day?: { date: string; sent: number } }`; it sits in the local `OutreachStore` type today.

### 4. Helper release

- Bump the version (manifest.json, `CODE_VERSION` in background.js, web/lib/helper-version) and reload. Until the helper is the new one, the app's switch does nothing: an old helper never asks with `channel: "suite"`, so nothing is handed out and nothing is typed anywhere (messages wait, and fail after the switch is turned off).
- manifest.json description still says "Optional outreach sender". Consider adding the Business Suite sender. No new permission is needed (business.facebook.com and scripting are already there).
- The popup shows nothing about Business Suite sending (popup files are outside this unit). `Suite.localStatus()` in background.js has what a popup line would need: enabled, running, last five results, next check.
- Optional, one request saved per heartbeat: return `suite: suiteSending(db)` from web/app/api/ext/hello/route.ts and read it in `hello()` instead of the extra GET /api/ext/outreach/status in `syncSuite`.

### 5. Leftover comments from wave 1

- web/lib/outreach.ts, inside `nextTask`: the comment about the inbox sweep sending "through the helper" and the 45 second check in (`sweeping ? 45`) predate the Meta only sweep. Left alone because the sweep-meta report lists it as the lead's.

## Decisions taken here that the owner or lead may want to reverse

1. No daily ceiling on Business Suite sends. The owner asked for one a minute and named no daily number. One a minute inside 08:00 to 22:00 allows up to 840 a day. Speculation: that many typed sends a day in Business Suite may draw Meta's attention; no data found either way. To cap it, set `SUITE.dailyMax` in web/lib/outreach.ts:58 (the count and the stop are already built and off).
2. A message a person wrote goes at any hour; only automatic ones wait for sending hours. The task text said "inside sending hours" without the distinction. To hold everything to sending hours, change `(w.open || !suiteOf(r)!.auto)` to `w.open` in `nextSuiteTask`.
3. An automatic message is cancelled if the lead writes before it goes out (the chat is then inside Meta's window again and the sweep answers through Meta).
4. Both switches on: Business Suite wins over typing inside instagram.com for inbox messages.
5. A warning in Business Suite pauses cold outreach as well, until Resume.
6. Send is the send control only, never Enter, so the keyboard rule stays untouched. Cost: if the control's selector is wrong nothing can be sent until it is fixed.
7. The helper's switch follows the app's setting through the heartbeat (every 15 minutes, and on each worker start), not through the popup.
8. The Instagram route (`instagramTyping`) is untouched and still off by default.


## Fix pass (2026-11-19): 7 day ceiling on the Human Agent path

Reviewer issue: with META_HUMAN_AGENT=approved, sendVia answered "meta" for any Instagram chat with a Meta id however old, so Meta would refuse the send and Business Suite was skipped. Fixed in place.

- Fact: new `humanAgentOpen(lastInboundAt, now)` and `HUMAN_AGENT_MS` (7 days less 1 hour) at web/lib/engine.ts:339 to 347. It is false when the env is not "approved", when the lead never wrote, or when the last message is 7 days old or more.
- Fact: sendVia uses it in place of the bare `humanAgentApproved()` (web/lib/engine.ts:327). Older chats and never replied chats fall through to "suite" (or "none" when the switch is off).
- Fact: deliver passes the Human Agent tag only when `!windowOpen && humanAgentOpen(conv.lastInboundAt)` (web/lib/engine.ts:405).
- Fact: `humanAgentApproved` is still exported unchanged; web/lib/sweep.ts:386 reads it for reporting only (command: grep humanAgentApproved web/lib web/app).
- Fact: 11 new scratch checks with META_HUMAN_AGENT=approved, all passing: 2 hours, 3 days and 6 days 22 hours answer "meta"; 6 days 23.5 hours, 8 days, 3 years and never replied answer "suite"; with the suite switch off, 8 days and never replied answer "none"; deliver sends 3 days old through Meta with the tag, inside 24 hours with no tag, and queues 8 days old and never replied for Business Suite with nothing sent through Meta.
- Fact: checks rerun after the fix: `npx tsc --noEmit` exit 0; run-tests.js 58 passed, 0 failed; run-browser-tests.js 43 passed, 0 failed; scratch check 60 passed, 0 failed.
- Inference: the one hour margin means a chat between 6 days 23 hours and 7 days goes to Business Suite a little early when that switch is on, and cannot be sent from the app when it is off. Chosen so a send typed or delayed near the edge is not refused by Meta.
- Unverified: that Meta measures the Human Agent window as exactly 7 days from the lead's last message on this account. Not testable until Meta approves the app. Still unverified as before: every Business Suite selector, and whether Business Suite allows typing in chats this old.
- Not changed (other units' files): the sweep's own gates (web/lib/sweep.ts) still decide which chats Autopilot offers; `canAutopilot` was not touched.
