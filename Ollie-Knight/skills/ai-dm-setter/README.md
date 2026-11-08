# Ainable Setter: AI appointment setter (v0.2)

Two parts:

- `web/` the app: business brief (onboarding), inbox, leads centre, insights, playbook, stages and tags, settings (team, shortcuts, keyword replies, conversion links, CRM, database).
- `extension/` the Chrome extension: full thread capture, suggested replies beside the chat, labels in Meta Business Suite.

Research behind the design is in `../0-Inbox/research/ai-dm-setter/`.

## Set it up

```
git clone <this repo> && cd ai-dm-setter
npm install        # installs the app, then asks the setup questions in your terminal
npm run serve      # builds and serves on the port you chose (3000 by default)
```

The setup questions cover: business name, where to keep data (this computer or Supabase), the Anthropic key, the Meta app, your own login, a CRM webhook and the port. Every answer is optional. Run them again any time with `npm run setup`. The same settings live in the app under Settings, Database and setup, so nothing has to be done in the terminal.

With no keys at all it starts on demo conversations and a demo reply engine, so every screen can be clicked through.

Use `npm run serve` to use the app. `npm run dev` (inside `web/`) is for editing code only: its hot reload has twice got into a page reload loop here, and the cause is not fully pinned down.

## Database

Three modes. The first two are chosen in setup or in Settings; the third switches on by itself when `DATABASE_URL` is set:

- **This computer.** One file, `.data/db.json`, beside `web/`. Nothing to set up.
- **Supabase.** Create a project, give the app the project URL and the service role key, and create the tables from `web/supabase/schema.sql` (setup can do this for you with a Supabase access token). Leads, messages and events are then mirrored into `setter_leads`, `setter_messages` and `setter_events` with real columns (stage, tags, email, phone, situation, goal, pain, objections, budget, summary, owner), so they can be queried and reported on directly. On start the app reads everything back from Supabase. If Supabase cannot be reached the app carries on from the local copy and retries.

- **Hosted (Vercel).** Live at https://ainable-setter.vercel.app (Vercel project `ainable-setter`, region London). Data is in a free Neon Postgres database added through Vercel's marketplace (`DATABASE_URL`). Every record is one row in `setter_store`; a version number in `setter_store_meta` goes up with each write, and each request reads back only when another copy of the app has written since (`web/lib/hosted.ts`). Keys saved on the Setup tab are stored there too. Timed jobs (the reply delay, the CRM push, learning an answer) run after the response with Next's `after()`, so they work on Vercel. An empty database is filled from `.data/db.json` when one is present (how the first upload was done), otherwise from the seed.

For the first two modes the app keeps its working copy in the server's memory, so run them as one long lived server (your computer, a VPS, Railway, Render).

Deploying: from `web/`, `node scripts/pack-helper.mjs` (packs the Chrome helper into `public/ainable-setter-helper.zip`, offered for download on the hosted Get connected screen), then `vercel deploy --prod`. Checking a running copy end to end (63 checks: sign in, every screen, every API, the helper's routes, hooks, timed jobs, two copies on one database): `OWNER_EMAIL=... OWNER_PASSWORD=... node test/hosted-check.mjs https://ainable-setter.vercel.app` (add `ROUNDTRIP_CRM=1` to prove after-response jobs run, `SECOND=<url>` to check two copies). The hosted copy started as a copy of this computer's data on 2026-10-14; from then on the two are separate.

## Team and logins

Settings, Team. The first account you create becomes the owner and switches sign in on. Each further person gets an email, a password, a role (owner, admin, setter, closer, viewer), the screens they may open, whether they see every lead or only their own, and whether Insights shows them the whole team or only themselves. Messages and stage changes are recorded against whoever made them, which is what the per setter numbers in Insights are built from.

## CRM (GoHighLevel and others)

Settings, CRM. Two routes, usable together:

- **Webhook.** One flat JSON POST per change (new lead, stage, tags, lead details, summary, notes, owner) to any URL: a GoHighLevel Inbound Webhook trigger, Zapier, Make, n8n.
- **GoHighLevel direct.** With a private integration token and location ID the app creates or updates the contact, adds tags, fills custom fields (situation, goal, pain, objections, budget, summary, next step, stage, profile link), posts the summary as a note and moves an opportunity through a GHL pipeline you map stage by stage.

Bookings coming back (calendar to this app) use the booking webhook under Settings, Connections.

## Shortcuts, keyword replies and conversion links

- **Shortcuts** (Settings, Shortcuts): saved messages typed with a trigger such as `/open` in any reply box. Variables like `{first_name}` and `{link: Strategy call}` fill in from the lead; `{formtext: name=...}` asks before inserting; a line of `---` splits into separate messages.
- **Keyword replies** (Settings, Keyword replies): when a lead sends a word such as GUIDE, the reply goes out immediately, with optional tags and AI mode change.
- **Conversion links** (Settings, Conversion links): any number of destinations (call, VSL, webinar, resource, community, application, checkout). The AI picks by the "when to send" rule and can only send these links.

## Outreach (first messages to people who have not messaged you)

The Outreach screen holds prospect lists, campaigns and the sending rules. The Chrome extension does the sending, in a Chrome window signed in to your Instagram, by typing each message into Instagram the way a person would.

1. Outreach, Prospects: paste handles or profile links, or a CSV with a `username` column. A `name` column and any others can be used in messages as `{first_name}`, `{city}` and so on. `{first_name|there}` gives a fallback.
2. Outreach, Campaigns: write at least 5 versions of the opening message. They rotate, and results show per version.
3. Outreach, Sending and typing: choose automatic or assisted sending, the daily range (never above 50), sending hours, the slow build up, and how the typing behaves (speed, slips, rewording, pauses).
4. Run `npm run outreach:chrome`. It opens a separate Google Chrome profile with the extension loaded and pointed at the app. Sign in to Instagram there once. Leave the command running; it ends when you close that window. (To use your everyday Chrome instead, load the `extension` folder by hand at `chrome://extensions`.)
5. Switch on Outreach sending in the app and in the extension popup.

Sending stops by itself on any Instagram warning, a request to confirm it is you, a signed out session, or two failed sends in a day. Press Resume on the Outreach screen once it is cleared. People already in your inbox are never messaged and a handle is only contacted once. Follow up messages and stopping on reply are not built yet.

Automating Instagram this way is against Instagram's terms and can get an account restricted; Meta can also act against an app linked to it. Cold marketing messages to individuals need consent in the UK and EU. Use a separate outreach account where you can.

Conversation starters that stay inside Meta's rules are under Outreach, Conversation starters: comment to DM replies, trackable `ig.me` chat links with their own greeting, and click to message ads. They use the official connection, so they need Instagram connected, and comment replies need the `instagram_business_manage_comments` permission and the `comments` webhook field.

Tunable defaults live in `web/lib/outreach-defaults.json`. Tests: `node extension/test/run-tests.js`, `node extension/test/run-browser-tests.js`, and the full chain in `extension/test/e2e`.

## Connect your own Instagram

1. The Instagram account must be a Business or Creator account.
2. developers.facebook.com, My Apps, Create app (Other, then Business).
3. Add the Instagram product, open "API setup with Instagram login".
4. Under "Generate access tokens" add your account, approve messaging, Generate token.
5. Paste the token in Settings, Meta connection, then press Run backfill.

No public address is needed: while the inbox is open the app polls Meta every 20 seconds. Webhooks (instant delivery) and the login screen for other people's accounts need a public https address, `META_APP_ID` and `META_APP_SECRET`.

With no keys it starts on demo conversations and a demo reply engine, so every screen can be clicked through.

| Key | Unlocks |
|---|---|
| `ANTHROPIC_API_KEY` | Real replies, tagging, summaries and inbox analysis (Claude Haiku 5.5; the playbook builder uses Claude Sonnet 5.5) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Supabase as the database |
| `META_APP_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN`, `APP_BASE_URL` | Connect Instagram by login, live webhooks |
| Dataset ID and token (entered in Settings) | Conversions API stage events |

## How the three history sources fit together

Meta's API returns only the 20 most recent messages per conversation. Deeper history comes from:

1. **Data export import** (Settings or onboarding step 6). The user's own "Download your information" JSON. Complete history, fully within Meta's rules.
2. **Chrome extension capture.** Reads threads from the owner's open inbox at a human pace.
3. **Webhooks.** Every message from the moment the account connects, including replies typed by hand in the Instagram app.

All three land in the same conversations and are de-duplicated.

## Tagging and pipeline

One stage per lead, any number of labels, as in Business Suite. Stages move on their own:

| Trigger | Stage |
|---|---|
| Lead messages first | Inbound message |
| You message first | Outbound message |
| Both sides have spoken | In conversation |
| AI judges the breakdown was sent | Business model sent |
| AI judges the lead a fit | Qualified |
| A configured link appears in a sent message | Link sent |
| Booking webhook | Booked call, Showed, No show |
| Payment webhook | Won |
| AI or human, with a reason | Disqualified, Nurture, Lost |

Getting tags into Meta: Messenger uses the official Page label API. Instagram has no label API, so the app queues label changes and the extension applies them in the Business Suite inbox. Stage events go to Meta through the Conversions API (Qualified to `QualifiedLead`, Booked call to `LeadSubmitted`, Won to `Purchase`).

## How the AI talks

Every reply is written to read like a person texting, for every business that uses the setter. The rules live in `web/lib/style.ts` and go into every draft, whether it comes from Autopilot, the Suggest button or the helper.

- **Mirrors the lead.** Before each reply the app reads the lead's recent messages: how many they send in a row, how long each one is, lowercase or sentence case, full stops, emoji and laughter. A lead who sends three short lines gets short lines back, one who writes a paragraph gets a fuller single reply, and the reply is never several times longer than what they sent. The shape mirrors the lead; the words stay the owner's (from their messages and the playbook).
- **Sounds human.** It reacts to what they said before anything else, asks one question at most (sometimes none), never stacks two questions, avoids bot and salesy phrases ("Great question", "I appreciate you sharing", "touch base"), and uses no dashes, lists or sign offs.
- **Rapport first, then the path.** Connect (two or three exchanges about them, no money talk or links), Discover (situation, goal, what is in the way, one light question at a time), Bridge (reflect it back, then the breakdown message), Invite (asks before sending the call, video, webinar or community link). A lead who asks for the link, the price or how to join skips ahead.
- **Gets to know them first, no assumptions.** Until a chat has at least the set number of messages (default 10, half from the lead, set in the brief) and the lead's situation, goal and what is in the way are all clear from their own words, the AI only listens and asks: no offer, breakdown, link, call or money questions, and it never guesses who they are or what they want. A chat that went quiet for a month starts this over, since what they said may be out of date. If the lead asks what you do, the price or for the link, it answers that briefly and turns back to them. A draft that breaks the rule is held for review, never sent (`web/lib/discovery.ts`).
- **Owner's choices, in the brief (Voice and rules):** *About me and my story* is the only personal material it may share, one line when it relates. *Slang you are happy to use* is the only slang it may use, and only with casual leads. It never swears.
- **Code checks after the AI writes:** dashes become commas, any second question is dropped, extra messages are merged so it never sends more than the lead would, emoji are removed for leads who use none, messages are capitalised for leads who write in sentence case, and trailing full stops are dropped for leads who never use them.

## Autopilot rules

The AI sends on its own only when all of these hold: master switch on, the conversation is set to Autopilot, Meta's 24 hour window is open, the AI did not ask for a human, the lead is not marked do not contact, the stage is still the setter's (up to Link sent), and the thread is connected through the official API. Otherwise it leaves a draft. Any link in a draft must match a configured conversion link or the draft is held.

## Not done yet

- Runs as a single server with its working copy in memory. Needs a rework before serverless or multi server hosting, and one workspace per install.
- Reply delays run on an in-process timer. Needs a job queue before hosting at scale.
- Supabase and GoHighLevel pass against local stand-ins that follow their documented APIs. Neither has run against a live account yet.
- Connect by token, backfill, polling, sending and the human agent tag pass against a local stand-in for Meta's API, not yet against Meta itself. OAuth login, webhooks, Messenger labels and Conversions API are untested.
- Claude calls have not produced a reply yet: both Anthropic keys on this machine have no credit. The app falls back to a basic draft and summary and says why.
- The AI moves leads only through the built in stages; custom stages are moved by hand.
- Keyword replies answer direct messages. Comment to DM needs a further Meta permission and is not built.
- Shortcuts work in the app's reply boxes, not yet inside Instagram itself through the extension.
- Facebook Page (Messenger) login flow is not built; only Instagram Login is.
- Extension DOM selectors are unverified against a live inbox. See `extension/README.md`.

## Get connected (first time setup)

Open the app and go to **Get connected** in the menu. It walks through three steps and ticks each one by itself:

1. **Add the helper to Chrome.** The page gives the two things to paste (`chrome://extensions` and the helper's folder) with copy buttons. Once the helper is added it links itself to the app: there is no address or token to enter. Adding the helper also opens this page if the app is not already open.
2. **Sign in to Instagram** in the same Chrome. The helper reads which account is signed in and outreach is tied to it.
3. **Send one test message** to a username you choose. It goes straight away, without a campaign, in "I press send" or "send it" mode.

The same page shows whether the AI key, the official Instagram inbox connection and the CRM are working, in plain words.

Where the app runs on the same Mac as the browser, step 1 has a button that opens Chrome's add on page and copies the helper's folder, because a web page is not allowed to link to that page. Step 2 links straight to Instagram's sign in page.

Under **Connect the rest**, the same screen connects the Instagram inbox, the AI and the CRM. Every link goes to the exact page needed (Meta's create app page, the app's own Instagram and basic settings pages once the app ID is pasted, Anthropic keys and billing). When `META_APP_ID` and `META_APP_SECRET` are saved and the app has an https address, the inbox block becomes a single **Continue with Instagram** button, which sends the person to Instagram's own sign in and approval screen and back (`/api/meta/connect?back=connect`). On a local copy it connects with a token pasted from the Meta app instead, because Instagram only redirects to registered https addresses.

How the linking works: `extension/src/pair-content.js` runs only on the app's own pages, the app page hands it the workspace key, and the helper keeps it only after the app has accepted it (`/api/ext/ping`). The helper then reports in once a minute (`/api/ext/hello`). Chrome only lets a person add an unpacked helper by hand, so step 1 stays three clicks until the helper is published in the Chrome Web Store. Test: `extension/test/e2e/connect.mjs` (14 checks).

## Video guides

**Welcome walkthrough.** The first time each person is in the app, a three minute walkthrough of the whole tool plays in a popup (`components/WelcomeVideo.tsx`, video id `welcome`). Watching to the end or closing it records `welcomeSeenAt` on their account (on the workspace while sign in is off), so it does not come back; Watch later hides it for that browser session. It is also first in Video guides.

Narration voice: Kokoro `af_heart` (American female) at 0.95 speed; set `SETTER_VOICE` / `SETTER_VOICE_SPEED` to change it. `SAY_AS` in `build-videos.mjs` fixes pronunciation (Ainable is said "A I enable"); captions show the normal spelling. A stand-in for Calendly (`scripts/calendly-standin.mjs`) lets the videos show real looking free times.

**Video guides** in the menu (`/learn`) also holds eight short narrated videos: three for set up (get connected, connect the inbox, AI and CRM, the business brief), four for daily use (inbox, teaching the AI, outreach, leads and results) and one for settings. Each has captions and a clickable list of what it covers, and the Get connected screen links to the matching one.

They are built from the real screens: `npm run videos` starts the app on throwaway demo data, photographs each scene in headless Chrome with one part spotlit, voices it with the house voice (Kokoro "Fable") and writes `web/public/videos/`. The scenes and the narration are in `scripts/video-modules.mjs`. After a change to a screen, run `npm run videos:shots` to check the pictures, then `npm run videos <id>` to rebuild that module. Needs ffmpeg and the Kokoro voice at `~/.cache/eod-walkthrough-voice`.

## Questions the AI cannot answer

When a lead asks something, or pushes back in a way, that the business brief, the playbook and the taught answers do not cover, the AI does not guess. It sends nothing, tags the conversation Needs human, and parks the question under Playbook, "Waiting for your answer". The Playbook menu item shows how many are waiting.

A person answers in one of two places:

- In the conversation. The inbox shows the question above the reply box. Reply as normal and the reply is kept as the answer. Untick the box to reply without teaching it. A reply typed in the Instagram app counts too.
- On the Playbook screen. Type the answer once. Every conversation held on that question is picked back up by the AI, which now replies with the answer (sent on autopilot, drafted otherwise).

The answer then goes into the AI's instructions on every reply, so the same question is handled without a person from then on. With Claude available, a reply sent to one lead is rewritten into a general answer with that lead's details removed, and a holding line such as "let me check" is recognised and not learned. The same question from several leads is one entry. Taught answers can be edited, switched off, removed or added by hand, up to 400.

Code: `web/lib/knowledge.ts` (data), `web/lib/live.ts` (`aiTurn`, `onAnswered`, `onHumanReply`), `web/app/api/knowledge/route.ts`, `web/components/Knowledge.tsx`.

## Weekly update scan

A scheduled job checks whether the things this system is modelled on have moved, and fits the system to them when they have.

What it checks, with one polite request per source and no sign in anywhere:

- **ColdDMs extension.** Asks the Chrome Web Store update service for the current version. A newer one is downloaded, unpacked into `research/colddms/source/extension-<version>/` and compared with the last snapshot: files added, removed and changed, new permissions, and new or removed Instagram component names, selectors, URLs and pacing numbers.
- **ColdDMs web app.** Reads the main bundle name from the sign in page. A new name means the bundle and its lazy chunks are saved to `research/colddms/source/webapp-<date>/` and compared the same way (routes, endpoints, advice and pricing copy).
- **Meta platform.** Hashes the text of ten developer doc pages (Graph API changelog, Messenger and Instagram changelogs, messaging policy, private replies, send messages, ig.me links, click to Instagram ads, Instagram overview) and records the latest Graph API version next to the one this project uses.

When something changed it writes a brief to `research/colddms/watch/changes/<date>.md`, backs up the files that may be touched to `research/colddms/watch/backups/`, and runs Claude Code headless with a narrow set of permissions to update `research/colddms/kb/`, `web/lib/outreach-defaults.json` and `extension/src/selectors.js`. It then runs `node extension/test/run-tests.js` and `npx tsc --noEmit` in `web/`. If a check fails, or sending volume was raised above `pacing.hardMax`, the files are put back and the failure is recorded. If the checks were already failing before the update, nothing is edited and the brief waits for the next run. The scan never rebuilds or restarts the app; when a restart is needed it says so in the changelog.

Where to look:

| File | What it holds |
|---|---|
| `research/colddms/watch/SCAN-LOG.md` | One entry per run, including "No changes" |
| `research/colddms/watch/CHANGELOG.md` | What an update changed in this project, and any restart that is needed |
| `research/colddms/watch/changes/` | Change briefs and the full diff as JSON |
| `research/colddms/watch/state.json` | Versions, hashes, last run, last change, queued briefs |
| `research/colddms/watch/launchd.log` | Console output of the scheduled runs |

Run it by hand:

```bash
npm run scan:updates:dry                      # detect and report only, writes nothing
npm run scan:updates                          # scan, and apply when something changed
node scripts/update-scan.mjs --no-apply       # scan and write the brief, leave it queued
node scripts/update-scan.mjs --no-apply --force-change webapp   # test: pretend a change (extension, webapp or meta)
```

Exit codes: 0 no change, 10 change found but not applied, 11 applied, 20 update failed or skipped, 30 a source could not be read, 3 another scan is running.

Schedule: the LaunchAgent `com.ainable.setter.update-scan` runs it every Monday at 07:30.

```bash
scripts/install-update-scan.sh daily          # switch to every day at 07:30
scripts/install-update-scan.sh weekly         # back to Mondays
scripts/install-update-scan.sh weekly --no-apply   # keep scanning but never edit anything
scripts/uninstall-update-scan.sh              # turn it off (state and logs are kept)
launchctl print gui/$(id -u)/com.ainable.setter.update-scan   # confirm it is loaded
```

## Calendar (Calendly)

Connect Calendly in Settings, Calendar (or on Get connected) by pasting a personal access token from https://calendly.com/integrations/api_webhooks.

- When a lead reaches the point of proposing the call, the AI reads the free times of the chosen meeting type and offers two to four of them by name, spread over different days, instead of sending a bare booking link.
- When the lead picks one, the AI sends the Calendly link that opens on that exact time. The call is booked once the lead confirms their details there.
- A draft that offers a time the calendar did not list is held for a person.
- When a call appears in Calendly at the time a lead was sent, the lead moves to Booked call (checked every few minutes while the app is open, or with Check for new bookings).
- Settings: meeting type, how many times to offer, how far ahead to look, shortest notice, on or off.
- The app only reads from Calendly. Code is in `web/lib/calendar.ts` and `web/app/api/calendar/route.ts`. `CALENDLY_API_BASE` points it at a stand-in for tests.
