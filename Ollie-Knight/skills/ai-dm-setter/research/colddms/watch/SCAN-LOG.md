# Update scan log

One entry per run of scripts/update-scan.mjs, newest at the bottom.

## 2026-10-11 16:48 (init)

**State initialised from the saved snapshots.**

- Extension: 6.14.8, no change.
- Web app: main bundle index.132db58e.js, no change.
- Meta: 9 of 10 pages read, 9 recorded as baseline, no page changed, unreadable: messenger-changelog (only 53 characters of text, looks like a shell). Latest Graph API v26.0, project uses v25.0 (behind, owner decision).

## 2026-10-11 16:50 (no apply)

**No changes.**

- Extension: 6.14.8, no change.
- Web app: main bundle index.132db58e.js, no change.
- Meta: 10 of 10 pages read, 1 seen for the first time (baseline recorded), no page changed. Latest Graph API v26.0, project uses v25.0 (behind, owner decision).

## 2026-10-11 16:51 (forced extension test, no apply)

**Forced extension change. Brief written, nothing applied, state kept.**

- Extension: CHANGED 6.14.8 to 6.14.8 (forced). 0 added, 0 removed, 0 changed files.
- Web app: main bundle index.132db58e.js, no change.
- Meta: 10 of 10 pages read, no page changed. Latest Graph API v26.0, project uses v25.0 (behind, owner decision).
- Brief: research/colddms/watch/changes/2026-10-11-forced-extension.md

## 2026-10-11 16:52 (forced webapp test, no apply)

**Forced webapp change. Brief written, nothing applied, state kept.**

- Extension: 6.14.8, no change.
- Web app: CHANGED index.132db58e.js to index.132db58e.js (forced). 132 chunks fetched. 1 added, 0 removed, 0 changed files.
- Meta: 10 of 10 pages read, no page changed. Latest Graph API v26.0, project uses v25.0 (behind, owner decision).
- Brief: research/colddms/watch/changes/2026-10-11-forced-webapp.md

## 2026-10-11 16:53 (forced meta test, no apply)

**Forced meta change. Brief written, nothing applied, state kept.**

- Extension: 6.14.8, no change.
- Web app: main bundle index.132db58e.js, no change.
- Meta: 10 of 10 pages read, CHANGED: messaging-policy (forced). Latest Graph API v26.0, project uses v25.0 (behind, owner decision).
- Brief: research/colddms/watch/changes/2026-10-11-forced-meta.md

## 2026-10-11 16:55 (no apply)

**No changes.**

- Extension: 6.14.8, no change.
- Web app: main bundle index.132db58e.js, no change.
- Meta: 10 of 10 pages read, no page changed. Latest Graph API v26.0, project uses v25.0 (behind, owner decision).

## 2026-10-12 07:30 (full)

**No changes.**

- Extension: 6.14.8, no change.
- Web app: main bundle index.132db58e.js, no change.
- Meta: 10 of 10 pages read, no page changed. Latest Graph API v26.0, project uses v25.0 (behind, owner decision).

## 2026-10-19 07:30 (full)

**Update applied, 3 files changed, checks passed**

- Extension: 6.14.8, no change.
- Web app: main bundle index.132db58e.js, no change.
- Meta: 10 of 10 pages read, CHANGED: messenger-changelog, instagram-overview. Latest Graph API v26.0, project uses v25.0 (behind, owner decision).
- Brief: research/colddms/watch/changes/2026-10-19.md
- Backup: research/colddms/watch/backups/20261019-073005.tar.gz
- Claude output: research/colddms/watch/apply-logs/20261019-073005.log
- Files changed: research/colddms/kb/05-public-research.md, research/colddms/kb/README.md, research/colddms/watch/CHANGELOG.md (new)

## 2026-10-26 07:32 (full)

**Update skipped: checks already failing before the update (node extension/test/run-tests.js). Nothing was edited. The brief stays queued for the next run.**

- Extension: 6.14.8, no change.
- Web app: main bundle index.132db58e.js, no change.
- Meta: 7 of 10 pages read, CHANGED: instagram-changelog, ig-private-replies, instagram-overview, unreadable: messenger-changelog (fetch failed), messaging-policy (timed out), click-to-instagram-ads (timed out). Latest Graph API v26.0, project uses v25.0 (behind, owner decision).
- Brief: research/colddms/watch/changes/2026-10-26.md
- Files changed: none

## 2026-11-02 07:55 (full)

**Update failed and restored: claude exited with code 1**

- Extension: 6.14.8, no change.
- Web app: could not check (The operation was aborted due to timeout).
- Meta: 9 of 10 pages read, CHANGED: messenger-changelog, instagram-changelog, ig-private-replies, igm-private-replies, ig-send-messages, ig-me-links, click-to-instagram-ads, instagram-overview, unreadable: messaging-policy (timed out). Latest Graph API v26.0, project uses v25.0 (behind, owner decision).
- Brief: research/colddms/watch/changes/2026-11-02.md
- Backup: research/colddms/watch/backups/20261102-075549.tar.gz
- Claude output: research/colddms/watch/apply-logs/20261102-075549.log
- Files changed: none
