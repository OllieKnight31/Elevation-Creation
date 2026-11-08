# Weekly update changelog

## 2026-10-19

Brief: research/colddms/watch/changes/2026-10-19.md (Meta platform page text changed: messenger-changelog, instagram-overview). No ColdDMs extension or web app change.

What the brief says, read as data:
- messenger-changelog: new top entry. Conversation Routing (Messenger and Instagram) now covers threads owned by Meta Business AI. The setting "Take control of conversations with your Business AI" is off by default. While it is off, untagged Send API requests to such a thread fail (Instagram: error 100, subcode 2534037; Messenger: error 10, subcode 2018300). Meta says to wait for a messaging_handovers webhook with pass_thread_control before replying. The "Sep 28, 2026" date line now shows above the 7 day ad window entry, which confirms that date from Meta's own page.
- instagram-overview: one heading renamed ("Which API is right for my app?" to "Which API setup is right for my app?"). Wording only, no limit changed.

Files changed:
- research/colddms/kb/05-public-research.md: research date line notes the 2026-10-19 update; new row in 2.5 for error 100 / 2534037 and error 10 / 2018300 (Business AI owns the thread, not a restriction); new row in 2.7 for the Business AI routing change; 28 Sep 2026 ad window date upgraded from vendor to official in 2.7 and in the alternatives table. Evidence and inference are marked in each row.
- research/colddms/kb/README.md: added a "Last updated" line and a "Not yet known (Meta)" line (exact date of the Business AI entry; whether HUMAN_AGENT tagged sends pass).
- research/colddms/watch/CHANGELOG.md: created, this entry.

Values changed: none. pacing (dailyMin 35, dailyMax 45, hardMax 50, hours 8 to 22, minGapSeconds 240, ramp 10 +5), typing, detect and privateReply (750 per hour, 7 days) all stay as they are. extension/src/selectors.js unchanged.

Checks:
- node extension/test/run-tests.js: 45 passed, 0 failed.
- node web/node_modules/typescript/bin/tsc --noEmit -p web/tsconfig.json: no errors.

Chosen not to change, with reasons:
- web/lib/outreach-defaults.json: nothing in the brief touches volume, hours, typing, private reply limits or the Instagram web UI. Block detection phrases are for the Instagram web page that the extension reads; the new codes come from the Graph API, so they do not belong there.
- extension/src/selectors.js: no DOM or page change in the brief.
- web/lib/meta.ts and web/lib/engine.ts: when Business AI owns a thread, sendMessage already throws Meta's error and deliver() stops, so nothing is sent and no volume rises. Code change is not clearly required. Suggested follow up for the owner: (1) in sendMessage, turn Instagram error 100 subcode 2534037 into a plain message such as "Meta Business AI is handling this thread. Turn on 'Take control of conversations with your Business AI' or wait for it to pass the thread."; (2) consider subscribing to messaging_handovers and holding AI replies until pass_thread_control arrives. Note that owner replies outside the 24 hour window go out with the HUMAN_AGENT tag; whether tagged sends pass is not confirmed.
- Graph API version: project uses v25.0, latest seen v26.0. Not changed here, per instructions. The owner should move META_GRAPH_VERSION (or the "v25.0" fallback in web/lib/meta.ts) to v26.0 after checking the v26.0 changelog.
- No build or restart: no web code or JSON tunable changed, so the web build output is not stale.

## 2026-10-19 07:30 scan check

- Briefs: research/colddms/watch/changes/2026-10-19.md
- Checks after the update: node extension/test/run-tests.js passed, npx tsc --noEmit in web/ passed
- Files changed: research/colddms/kb/05-public-research.md, research/colddms/kb/README.md, research/colddms/watch/CHANGELOG.md (new)
- Backup: research/colddms/watch/backups/20261019-073005.tar.gz

## 2026-11-02 07:55 update failed, files restored

- Briefs: research/colddms/watch/changes/2026-10-26.md, research/colddms/watch/changes/2026-11-02.md
- Problem: claude exited with code 1
- Files that were put back: none
- Backup: research/colddms/watch/backups/20261102-075549.tar.gz
- Claude output: research/colddms/watch/apply-logs/20261102-075549.log
- Needs a person to look at the brief and apply it by hand.
