# AI DM Setter Companion (Chrome extension)

A Manifest V3 extension, plain JavaScript, no build step, no dependencies. It runs in the account owner's own logged-in Google Chrome and fills two gaps in Meta's official API for the AI DM Setter web app:

1. **History depth.** The API returns only the 20 most recent messages per thread. The extension reads the full thread from the page you already have open and sends it to the app.
2. **Labels in Meta Business Suite.** Meta has no API for Instagram inbox labels. The extension applies the app's tags as labels through the Business Suite inbox UI.

It also shows a small side panel in the inbox with the app's stage, labels and suggested reply for the open conversation.

Since version 0.2.0 it has a third, separate job, **off by default**:

3. **Outreach sending.** When you switch it on, the extension asks the app for one lead at a time, opens that lead's profile in its own pinned tab, types the first message the way a person would, and either sends it (auto mode) or leaves it in the box for you to send (assisted mode). See [Outreach](#outreach).

## Status: selectors are UNVERIFIED

Every DOM selector in `src/selectors.js` was written without access to a logged-in Instagram or Business Suite session. None has been checked against the real pages. Treat the first run as a calibration run:

1. Open the inbox, click the extension icon, press **Selector health check**.
2. Fix whatever is reported NOT FOUND in `src/selectors.js` (add the working selector at the top of that target's list).
3. Reload the extension at `chrome://extensions`, reload the inbox tab, check again.

Until that is done, expect capture, insert and label sync to stop with a "Selector miss" error. They are built to stop, not to guess.

The same is true for outreach. The `instagramOutreach` selectors (the Message button on a profile, the composer of the thread it opens, the send control, the message list, the logged in account link) are guesses too, and nobody has run the sender against the live site. Calibrate it the same way before trusting it: open a profile page, run the health check, then open a thread and run it again. The health check lists the outreach targets that belong on the page it runs on. Until a selector is fixed, an outreach task ends with status `error` and a detail that names the selector. It does not click around looking for an alternative.

## What it will never do

Everything except the outreach sender (capture, labels, the side panel, the popup buttons):

- Never sends a message and never clicks a send button. **Insert** puts text in the message box and stops. You press send.
- Dispatches no keyboard events at all, so it cannot press Enter.
- Only acts on `instagram.com/direct/*` and the `business.facebook.com` inbox, and only opens conversations that already exist in your inbox list.

The outreach sender is the one deliberate exception, and it is fenced in:

- It is off until you switch on "Outreach sending" in the popup. Switched off, the extension asks the app for no task and opens no tab.
- All sending code is in one file, `src/outreach/outreach-content.js`. That file is not in the manifest. The service worker injects it into one tab only: the pinned tab the extension created for outreach. It is never loaded in a tab you opened, and the extension never looks up or touches any other tab for outreach.
- It starts a conversation in one way only: the Message button on the lead's own profile page. It sends one message per task, to the handle the app named, at the address `https://www.instagram.com/<handle>/` and nowhere else.
- It presses send only in auto mode, only after the text in the box was compared with the target and matched exactly, and never if the box held any other text when it arrived.
- In assisted mode it never presses send.

The whole extension, outreach included:

- No follow, unfollow or like automation.
- It sends data to one place only: the app base URL you set in the options.
- It works on the rendered page only. It does not intercept network traffic and does not call Instagram or Facebook endpoints.
- It does not fake the tab's visibility or focus state.

These rules are enforced in code and checked by `test/run-tests.js`: one guarded click path for everything, plus exactly one send click inside the outreach sender; keyboard events in that one file only; no network code in content scripts; the sender named by nothing but the outreach runner; the runner using no tab lookup of any kind.

## Install

1. Open **Google Chrome** and go to `chrome://extensions`.
2. Switch on **Developer mode** (top right).
3. Press **Load unpacked** and choose this `extension` folder.
4. Pin "AI DM Setter" from the puzzle-piece menu so the popup is one click away.

Requires Chrome 111 or newer. After editing any file, press the reload arrow on the extension card and reload the inbox tab.

## Configure

Open the options (popup, **Options** link, or the extension card's "Details", "Extension options").

| Setting | Meaning |
| --- | --- |
| App base URL | Where the web app runs. Default `https://ainable-setter.vercel.app`, the live app. Use `http://localhost:3000` for a copy running on this computer. When you save a different address Chrome asks you to allow it. |
| Workspace token | From the web app. Sent as `Authorization: Bearer <token>` on every call. |
| Test connection | Saves, then calls `GET /api/ext/ping` and shows the workspace name. |
| Capture cap per run | Maximum conversations per bulk capture or label sync. Default 40, maximum 150. |
| Show side panel | Hides or shows the panel. The progress bar and Stop button always appear during a run. |
| Apply labels in Business Suite | Master switch for label sync. |
| Skip unread threads in bulk capture | On by default, because opening an unread thread marks it as seen. |

Outreach has no options entry. Its one switch is in the popup, and everything else about it (mode, daily cap, sending window, typing speed, the message text) is set in the web app.

## Features

### Side panel

Appears on `instagram.com/direct/*` and in the Business Suite inbox, inside a shadow root so page styles cannot leak in. Collapsible with Hide and Show. For the open conversation it shows the name and handle, stage, labels, 24 hour window state, AI mode, and the suggested reply as separate bubbles.

- **Insert** (per bubble) and **Insert all**: writes the text into the message box and stops. It refuses when the box already holds text, and it tells you if it could not confirm the text landed.
- **New suggestion**: asks the app for a fresh suggestion (`POST /api/ext/suggest`).
- **Capture this thread**: see below.

### Capture this thread

Scrolls the open conversation upward until nothing older loads, reads each text message with its direction (in or out) and a timestamp where the page exposes one, removes the overlap between scroll steps, and posts the result to `POST /api/ext/ingest` in chunks of 200.

### Capture recent threads

Works down the inbox list from the top, one conversation at a time, up to the cap. Unread conversations are skipped by default.

Pacing for both captures and for label sync:

- one conversation at a time, never in parallel
- a randomised pause of 4 to 9 seconds between scroll steps and between conversations (the 4 second floor cannot be lowered in code)
- a hard cap per run
- a visible progress bar and a **Stop** button
- an immediate halt if the page shows rate-limit, "try again later", checkpoint or login text, or redirects to a login or challenge URL. The page is re-checked every second during a run.

A 40 conversation run takes roughly 20 minutes at the very least, and much longer with long threads. That is intended.

### Sync labels now (Business Suite only)

Fetches `GET /api/ext/label-queue`. For each item it finds the conversation by exact name (using the inbox search box when it is not in the loaded list), opens it, confirms the header shows the same name, reads the labels already applied, adds the missing ones, creating a label when it does not exist, and reports the result with `POST /api/ext/label-queue/ack`.

Any step that cannot find exactly the element it needs acks `ok: false` with a precise error and clicks nothing. Zero matches is an error. More than one match is also an error. A stop or a halt leaves the current item unacknowledged, so it stays in the queue.

### Selector health check

Runs every selector for the current site and lists found or not found, with the hit count for each fallback. Some targets only exist while a conversation, a dialog or the label picker is open, and the report says which.

On `instagram.com/direct/*` the report also lists the outreach targets of a thread (composer, send control, message list). On any other instagram.com page, such as a profile, it lists the outreach targets of a profile page (the Message button and so on).

### Last run summary

The popup shows the outcome, counts and warnings of the most recent run.

## Live inbox sync

While an Instagram tab is open, `src/content/sync.js` keeps the app's inbox in step with Instagram, for messages sent and received on any device. It reads the rendered page only:

- the open chat, while it is scrolled to its newest message (so reading old messages is never mistaken for new ones);
- the latest message each chat list entry shows, with its age. Entries older than a day, and previews of photos, reactions and similar, are left out.

It checks every 1.5 seconds and sends only what changed to `POST /api/ext/live`, which lines the messages up against what the app already holds, so nothing is stored twice. It never opens a chat, so nobody sees "Seen", and it calls no Instagram address. One tab does it at a time, preferring the one in front. Status shows in the popup under "Live inbox sync".

A chat that gets several messages while it is closed shows only the latest in the list. The rest arrive the moment the chat is opened.

## Outreach

**Status: built against a fixture, never run against the live site.** Read "Limitations" before switching it on with an account you care about.

### Switching it on

Popup, **Outreach sending**, tick the box. It is off after install. The box below the switch shows the app's live view (`GET /api/ext/outreach/status`): enabled or not, auto or assisted, sent today against the cap, paused and why, the next send time, plus what the extension is doing right now and its last five results.

### What one task does

A one minute alarm asks the app for work (`POST /api/ext/outreach/next`) whenever outreach is on and nothing is running. When the app answers "no task", the extension waits the `retryInSec` it was given before asking again. One task is one message to one lead:

1. **Open.** The lead's profile opens in the outreach tab. The extension creates that tab once (pinned, in the background) and reuses it. It is never the tab you are working in.
2. **Check.** The page is checked for block signals. A profile that shows "page isn't available" is reported `not_found`.
3. **Message.** The Message button is found and clicked through the same guarded click helper as everything else. Several matching buttons is an error, not a guess.
4. **Composer.** It waits for the composer of the thread that opens. If the thread header names a different handle, or the box already holds text, nothing is typed (`error`, `skipped`).
5. **Read.** It waits `readMs`.
6. **Type.** The message is typed one keystroke at a time (next section).
7. **Verify.** The text in the box is read back and compared with the target. If it differs in any way, the box is cleared and the task is reported `error`. Nothing wrong is ever sent.
8. **Send or stop.**
   - **auto:** send is pressed (the send control if it is found, otherwise Enter), then the thread is read to confirm the message is there. Reported `sent`.
   - **assisted:** the text stays in the box, a notice appears on the page, the toolbar icon shows `SEND`, and the task is reported `typed`. No new task is fetched while that text is still sitting in the box, so the tab is not navigated away under it.
9. **Report.** `POST /api/ext/outreach/result` with the status, a detail line, the typing time, and the keystroke and typo counts.

Never two tasks at once. A task that runs past 6 minutes is stopped and reported `error`. A message too long to type inside that limit at the given speed is typed faster rather than timed out.

### Typing like a person

`src/lib/typing.js` plans every keystroke before the first one is typed:

- a speed for the whole message, drawn between `wpmMin` and `wpmMax`
- per key timing with a right skewed spread: quicker for common letter pairs, slower after a space, after punctuation, for capitals and symbols, and at the start of a word or sentence; short bursts of fast words; an emoji takes as long as finding one
- thinking pauses at `pauseRate` per word, more often at the start of a sentence
- mistakes at `typoRate` per character: a neighbouring key, two letters swapped, a doubled letter, a dropped letter, wrong case, a missed space. Each is noticed 0 to 6 characters later, or at the end of the word, then fixed with a short pause, quick backspaces and a retype
- with `rewriteRate` per message, the last few words are deleted and typed again, as if rephrasing
- URLs, @handles, email addresses, emoji and line breaks are typed exactly and are never backspaced over

Replaying a plan always gives exactly the target text. That is tested over tens of thousands of random plans. All the waiting happens in the service worker and each keystroke is its own message to the tab, because Chrome slows timers in a background tab.

Each keystroke follows the order of events of a real key press: a `beforeinput` event first, and when the editor leaves that alone, the browser's own edit through `document.execCommand`, which fires the trusted `input` event a rich editor reads from. An editor that accepts neither is reported as an error on the first key.

### Block detection

Before and after every stage, and every 40 keystrokes while typing, the page is checked against the phrases and URL fragments the app sends with the task (`detect.phrases`, `detect.urlParts`), in open dialogs first and then in the rest of the visible page. A login form counts too. Text inside the message list, the conversation column and the composer is ignored. On a hit the task stops at once, the page is left exactly as it is, the task is reported `blocked` (the app then pauses the account), and the extension also switches its own outreach switch off with the reason shown in the popup. You switch it back on by hand after looking at the account.

### Result statuses

| Status | When |
| --- | --- |
| `sent` | Auto mode: send was pressed and the box emptied. The detail says whether the message was also read back from the thread or is unconfirmed. |
| `typed` | Assisted mode: the text is in the box, waiting for you. |
| `unreachable` | The profile loaded but has no Message button. Only reported once the Message selector has matched on the live site at least once. Before that, a missing button is an `error`, so a wrong selector cannot burn through your lead list as "unreachable". |
| `not_found` | The profile page says it is not available. |
| `blocked` | A block phrase, a block URL or a login form. |
| `skipped` | The box already held text, or you switched outreach off during the task. |
| `error` | A selector miss, a wrong thread, text that did not match after typing, a send that did nothing, the outreach tab closed, a timeout, a malformed task, a restarted service worker. The detail says which. |

Other safety behaviour:

- Three `error` or `unreachable` results in a row switch outreach off, with the last detail shown in the popup.
- Switching outreach off during a task stops it within a second, clears what was typed and reports `skipped`.
- The task state is saved at every stage. If Chrome restarts the service worker mid task, the task is not resumed. It is failed, what was typed is cleared, and the result is still reported. If the restart came after send was pressed, the thread is read to decide between `sent` and `error`.
- A result that cannot be delivered to the app is kept and sent again every minute. No new task starts until it has been delivered.
- A task whose `profileUrl` is anything other than `https://www.instagram.com/<its handle>/` is refused before any page is opened.

## Files

| Path | Purpose |
| --- | --- |
| `manifest.json` | MV3 manifest |
| `src/selectors.js` | Every DOM selector and text marker, per site, all UNVERIFIED |
| `src/lib/core.js` | Pure logic: pacing, caps, de-duplication, chunking, ids, timestamps, halt detection |
| `src/lib/api.js` | Client for the app's `/api/ext/*` contract |
| `src/lib/typing.js` | Pure human typing planner: `planTyping`, `replay`, `summary` |
| `src/background.js` | Service worker. The only code that calls the app. Hosts the outreach alarm |
| `src/outreach/outreach-runner.js` | Outreach task state machine (service worker). No page code |
| `src/outreach/outreach-content.js` | Outreach page commands. The only file that can send. Injected into the outreach tab only |
| `src/content/dom.js` | Selector resolution, guarded click, text insertion, halt scan, health check |
| `src/content/panel.js` | Side panel and progress box (shadow DOM) |
| `src/content/capture.js` | Thread identity, message extraction, single and bulk capture |
| `src/content/labels.js` | Business Suite label sync |
| `src/content/main.js` | Run management, open-thread watcher, popup commands |
| `popup/`, `options/`, `ui.css` | Popup and options pages |
| `test/` | Tests and fixtures, not loaded by the extension |

## Tests

```
node test/run-tests.js           # static checks, pure logic, typing planner, API client, service worker and outreach runner against stubs
node test/run-browser-tests.js   # the real content scripts in headless Google Chrome against fixture pages
```

The browser tests start Google Chrome only, and Chrome only loads local files and a server on `127.0.0.1`. Nothing in the tests contacts Instagram.

The fixture pages in `test/fixture/` imitate a guessed page structure. They prove the code paths work end to end against that guess. They prove nothing about the real Instagram or Business Suite pages. The outreach fixture (`outreach.html`) runs the real runner and the real page commands against a fake profile and thread, with three kinds of editor: a plain one, one that takes every edit into its own state, and one that mixes both and rebuilds its content after each key.

## Limitations (read this)

- **Outreach is unverified on the live site.** No logged in session was available while it was built. Its selectors are guesses, and so is the assumption that Instagram's composer accepts text the way the fixture editors do. The first live runs should be in assisted mode, watched, on a small list.
- **Outreach account risk is high.** Automated cold messages are against Instagram's terms. Human looking typing and slow pacing do not make it permitted and do not guarantee anything. The outreach tab is a background tab and the page can tell: the extension deliberately does not fake visibility or focus. Caps, sending windows and pauses are the app's job. The extension only obeys them.
- **The outreach tab must stay open.** It is a pinned tab in whichever window was in front when the first task ran. Closing it during a task fails that task. After a browser restart the extension does not recognise its old tab and creates a new pinned one, so close the old one.
- **Instagram may not fully load a background tab.** If the profile or the thread only renders while the tab is in view, tasks will end with a selector miss. Nothing in the extension works around that.
- **Send confirmation depends on unverified selectors.** If the message list cannot be read, a message whose text left the box is reported `sent` with "unconfirmed" in the detail. It is not reported as an error, because that could lead to the same person being messaged twice.
- **Assisted mode cannot report the actual send.** The app is told `typed`. The extension only notices that the text has left the box, and then moves on.
- **The logged in handle may not be readable.** It comes from an unverified selector. Until it is read once, the app is sent an empty account name.
- **Block phrases are English and come from the app.** A warning worded differently is only caught by the URL and login form checks. A lead whose own profile text contains a block phrase will stop outreach, which is the safe direction.
- **Selectors are guesses.** See the top of this file. Meta also changes its markup without notice, so a working selector can break on any day. The health check exists for that.
- **Account risk.** Automated reading of Instagram or Facebook pages may be against Meta's terms, even for your own inbox and even though only the rendered page is read. Slow pacing lowers the load on the account. It is not a guarantee against a restriction. Use it on purpose, not on a schedule.
- **Opening a thread marks it as seen.** Bulk capture skips unread threads by default, but that depends on an unverified selector. Until the health check confirms `threadRowUnread`, assume a bulk capture can send read receipts.
- **Text only.** Photos, videos, voice notes, reactions, shared posts, story replies, links previews and unsent messages are not captured.
- **Timestamps are approximate and often missing.** Instagram shows a time only on separators between groups of messages. Each message gets the time of the nearest separator above it, or `null`. Ambiguous numeric dates are left as `null`.
- **Direction is inferred.** It comes from a screen-reader marker ("You sent") when present, otherwise from which side of the list the bubble is drawn on. Messages whose direction cannot be read are skipped and counted in a warning, and the capture is then marked incomplete. In group chats every other participant is "in" and the sender name is not recorded.
- **De-duplication relies on overlap between scroll steps.** If a step does not overlap the previous one, the run reports a gap, keeps everything, and marks the capture incomplete.
- **Thread ids.** On instagram.com the id is taken from the URL (`/direct/t/<id>`). That id is not the same as the conversation id returned by Meta's API. In Business Suite the id is the `selected_item_id` URL parameter if present, else a hash of the handle or name. Two contacts with the same display name and no handle would get the same hashed id.
- **Business Suite platform detection.** The extension must tell Instagram threads from Messenger threads by URL hints or a badge. If it cannot, it refuses to capture and the panel shows an error for that thread.
- **Label sync matches by display name.** Two conversations with the same name are refused, not guessed. Labels are only added, never removed.
- **English UI only.** Text markers ("You sent", "Add label", "Try again later" and so on) are English. Another interface language needs its own entries in `src/selectors.js`.
- **Insert may not work in every editor version.** The message box is a rich-text editor. Insert uses the browser's standard text insertion and a paste fallback, then checks the result. If it cannot confirm, it says so and you copy the text by hand. Inserting text shows the usual typing indicator to the other person.
- **Keep the tab open and visible during a capture or label run.** Chrome slows timers in background tabs, and some lists only render while visible. A run stops if you navigate away from the inbox.
- **Stopping discards the thread in progress.** Threads already sent stay in the app. The one being scrolled when you press Stop is not sent.
- **Halt detection can misfire.** It looks for English phrases in visible page text outside the message list and thread list. A false halt stops a run early, which is the safe direction. A challenge screen worded in a way the list does not cover would not be caught by text, only by the URL and login-form checks.
- **Permissions.** Outreach added one permission, `alarms`, for the one minute poll. It needs no `tabs` permission: it only ever handles the tab it created. The content script is registered on all of `www.instagram.com` and `business.facebook.com` because both are single-page apps, but it does nothing outside the direct inbox and the Business Suite inbox. The optional host permission is broad (`https://*/*`, `http://*/*`) so that any app address can be granted at run time. Only the address you save is ever requested.
- **Token storage.** The workspace token sits in `chrome.storage.local`, unencrypted, in this browser profile. It is kept out of reach of content scripts and is sent only to the configured app address.
- **No icon.** The toolbar shows Chrome's default letter icon.
