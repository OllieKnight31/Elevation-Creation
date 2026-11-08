/*
 * run-browser-tests.js
 * Runs the real content scripts in headless Google Chrome against the
 * fixture pages in test/fixture, with virtual time so the pauses do not take
 * real minutes. Run with:  node test/run-browser-tests.js
 *
 * Only Google Chrome is ever started, and it only ever loads local files or
 * this script's own server on 127.0.0.1. Nothing here contacts Instagram.
 *
 * The fixtures imitate a GUESSED page structure. Passing proves the capture,
 * label, panel, outreach and safety code paths work end to end against that
 * guess. It does not verify a single selector against the real Instagram or
 * Business Suite pages.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const CHROME = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!fs.existsSync(CHROME)) {
  console.log('SKIP  Google Chrome not found at ' + CHROME + ' (set CHROME_BIN)');
  process.exit(0);
}

// Chrome prints the DOM once the virtual time budget is spent but does not
// always exit afterwards, so the process is stopped as soon as the dump ends.
const BUDGET_MS = 1500000;
const REAL_TIMEOUT_MS = 240000;

// `file` is a fixture file name, or an http://127.0.0.1 URL of the local server.
function runFixture(file) {
  const target = /^http:\/\/127\.0\.0\.1:/.test(file) ? file : pathToFileURL(path.join(__dirname, 'fixture', file)).href;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'aidm-fixture-'));
  return new Promise((resolve, reject) => {
    const child = spawn(
      CHROME,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--allow-file-access-from-files',
        '--window-size=1200,900',
        '--user-data-dir=' + profile,
        '--virtual-time-budget=' + BUDGET_MS,
        '--dump-dom',
        target
      ],
      { stdio: ['ignore', 'pipe', 'ignore'] }
    );
    let out = '';
    let settled = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill('SIGKILL');
      setTimeout(() => fs.rmSync(profile, { recursive: true, force: true }), 500);
      if (err) return reject(err);
      const m = /<pre id="results">([\s\S]*?)<\/pre>/.exec(out);
      if (!m) return reject(new Error(file + ': the fixture did not finish inside the virtual time budget (no results block in the dumped DOM)'));
      const json = m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
      if (process.env.DUMP) console.log(json);
      resolve(JSON.parse(json));
    };
    const timer = setTimeout(() => finish(new Error(file + ': Chrome printed nothing within ' + REAL_TIMEOUT_MS / 1000 + ' s')), REAL_TIMEOUT_MS);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (d) => {
      out += d;
      if (out.includes('</html>')) finish();
    });
    child.on('error', finish);
    child.on('exit', () => finish());
  });
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const pacedOk = (pauses) => pauses.length > 0 && pauses.every((p) => p >= 4000 && p <= 9000);
const texts = (ingests) => ingests.flatMap((b) => b.messages.map((m) => m.text));

/* ---------------------------- live sync fixture ---------------------------- */

let sy;
test('live sync fixture runs to the end', async () => {
  sy = await runFixture('sync.html');
  assert.deepEqual(sy.errors, []);
});

test('live sync: first look sends the open chat and recent list entries, never old ones or photos', () => {
  const kinds = sy.first.threads.map((t) => t.kind + ':' + t.thread.name);
  assert.ok(kinds.includes('thread:Jane Doe'), kinds.join(','));
  const open = sy.first.threads.find((t) => t.kind === 'thread');
  assert.equal(open.thread.handle, 'jane.doe');
  assert.match(open.thread.avatar, /^https:\/\/scontent/);
  assert.equal(open.messages.length, 30);
  assert.deepEqual(open.messages.slice(-2), [{ direction: 'in', text: 'old message 29' }, { direction: 'out', text: 'old message 30' }]);
  const bob = sy.first.threads.find((t) => t.thread.name === 'Bob Stone');
  assert.deepEqual(bob && bob.messages, [{ direction: 'in', text: 'see you then', ageSec: 10800 }]);
  assert.equal(bob.thread.avatar, 'https://scontent-lhr8-1.cdninstagram.com/v/t51/bob.jpg', 'the list picture goes with it');
  const jane = sy.first.threads.find((t) => t.kind === 'preview' && t.thread.name === 'Jane Doe');
  assert.deepEqual(jane && jane.messages, [{ direction: 'out', text: 'old message 30', ageSec: 120 }]);
  assert.ok(!kinds.includes('preview:Old Friend'), 'two weeks old is history');
  const pic = sy.first.threads.find((t) => t.thread.name === 'Pic Sender');
  assert.ok(pic && pic.messages.length === 0 && /pic\.jpg$/.test(pic.thread.avatar), 'a photo preview is not copied as a message, but its picture is: ' + JSON.stringify(pic));
});

test('live sync: quiet page sends nothing, a new message in the open chat goes within seconds', () => {
  assert.equal(sy.quietCount, 1);
  const t = sy.afterIncoming.threads;
  assert.equal(t.length, 1);
  assert.equal(t[0].kind, 'thread');
  assert.deepEqual(t[0].messages[t[0].messages.length - 1], { direction: 'in', text: 'can we talk tomorrow?' });
});

test('live sync: a new message in another chat is sent from its list entry alone', () => {
  assert.deepEqual(sy.afterRow.threads, [{ kind: 'preview', thread: { name: 'Bob Stone', avatar: 'https://scontent-lhr8-1.cdninstagram.com/v/t51/bob.jpg' }, messages: [{ direction: 'in', text: 'actually can we move it to 4pm?', ageSec: 0 }] }]);
});

test('live sync: a chat scrolled up to old messages is not read, and errors back off', () => {
  assert.ok(sy.whileScrolled.every((b) => b.threads.every((t) => t.kind !== 'thread')), JSON.stringify(sy.whileScrolled));
  assert.ok(sy.failedTries >= 1 && sy.failedTries <= 3, 'tries while failing: ' + sy.failedTries);
});

/* ---------------------------- Instagram fixture ---------------------------- */

let ig;
test('instagram fixture runs to the end', async () => {
  ig = await runFixture('instagram.html');
  assert.deepEqual(ig.errors, []);
});

test('panel: shows name, handle, stage, labels, window, AI mode and bubbles', () => {
  assert.equal(ig.panelLoaded, true);
  for (const s of ['Jane Doe', '@jane.doe', 'Qualified', 'Hot lead', 'Open', 'suggest', 'Hey there, thanks for reaching out', 'Want me to send the link?', 'Asked about price']) {
    assert.ok(ig.panelText.includes(s), 'panel shows ' + s);
  }
});

test('health check: every required selector hits on the fixture, no halt text', () => {
  assert.deepEqual(ig.healthMissingRequired, []);
  assert.equal(ig.healthLoginFormFound, 0);
  assert.equal(ig.healthHalt, null);
});

test('insert: fills the composer, refuses to overwrite, never clicks send', () => {
  assert.equal(ig.afterInsert, 'Hey there, thanks for reaching out');
  assert.equal(ig.insertRefusedWhenFull, true);
  assert.equal(ig.afterRefusedInsert, 'Hey there, thanks for reaching out');
  assert.ok(ig.afterInsertAll.includes('Hey there, thanks for reaching out') && ig.afterInsertAll.includes('Want me to send the link?'));
  assert.equal(ig.sendGuard, 'SafetyError');
  assert.equal(ig.sendClicks, 0);
  assert.equal(ig.newSuggestion, true);
});

test('capture this thread: full lazy-loaded history, right order, direction, timestamps', () => {
  assert.equal(ig.captureStarted.ok, true);
  assert.equal(ig.progressShown, true, 'progress box with a Stop button is visible');
  assert.equal(ig.secondRunRefused, true, 'one run at a time');
  assert.equal(ig.captureRun.outcome, 'done');
  assert.deepEqual(ig.captureRun.warnings, []);
  assert.equal(ig.captureIngests.length, 1);
  const body = ig.captureIngests[0];
  assert.equal(body.platform, 'instagram');
  assert.equal(body.complete, true);
  assert.equal(body.thread.name, 'Jane Doe');
  assert.equal(body.thread.handle, 'jane.doe');
  assert.match(body.thread.externalId, /^h_[0-9a-f]{8}$/, 'no id in a file URL, so the handle hash is used');
  assert.equal(body.messages.length, 70);
  body.messages.forEach((m, i) => {
    const n = i + 1;
    assert.equal(m.order, i);
    assert.equal(m.direction, n % 3 === 0 ? 'out' : 'in', 'direction of message ' + n);
    const want = n === 4 ? 'thanks for the link you sent' : n % 7 === 0 ? 'ok' : 'Jane message ' + n;
    assert.equal(m.text, want);
    const day = String(1 + Math.floor((n - 1) / 10)).padStart(2, '0');
    assert.equal(m.sentAt, '2026-09-' + day + 'T10:00:00.000Z', 'timestamp of message ' + n);
  });
  assert.equal(ig.captureRun.messagesSeen, 70);
  assert.equal(ig.captureRun.messagesAdded, 70);
});

test('capture recent threads: one at a time, cap respected, unread skipped, geometry direction', () => {
  assert.equal(ig.recentRun.outcome, 'done');
  assert.equal(ig.recentRun.threads, 3);
  assert.equal(ig.recentRun.skippedUnread, 1);
  assert.deepEqual(ig.recentOpened, ['jane', 'bob', 'cy'], 'the unread thread was never opened');
  assert.deepEqual(ig.recentIngests.map((b) => b.thread.name), ['Jane Doe', 'Bob Stone', 'Cy Short']);
  assert.deepEqual(ig.recentIngests.map((b) => b.messages.length), [70, 25, 3]);
  assert.ok(ig.recentIngests.every((b) => b.complete === true));
  const bob = ig.recentIngests[1];
  bob.messages.forEach((m, i) => assert.equal(m.direction, (i + 1) % 3 === 0 ? 'out' : 'in', 'Bob has no owner marker, side of the list decides'));
  assert.equal(texts([bob]).filter((t) => t === 'ok').length, 3, 'repeated "ok" messages all kept');
});

test('halt: rate-limit text stops the run within about a second and blocks the next one', () => {
  assert.equal(ig.haltRun.outcome, 'halted');
  assert.match(ig.haltRun.detail, /try again later/i);
  assert.ok(ig.haltMs < 4000, 'halted mid-pause, took ' + ig.haltMs + ' ms');
  assert.equal(ig.haltIngests, 0, 'nothing was sent after the halt');
  assert.equal(ig.runRefusedWhileHalted, 'halted');
  assert.equal(ig.haltIgnoresMessages, null, 'halt words inside a prospect message do not halt');
});

test('stop button: stops at once and sends nothing', () => {
  assert.equal(ig.stopRun.outcome, 'stopped');
  assert.ok(ig.stopMs < 1500, 'took ' + ig.stopMs + ' ms');
  assert.equal(ig.stopIngests, 0);
});

test('selector miss: loud error naming the selector, no clicks', () => {
  assert.equal(ig.missRun.outcome, 'error');
  assert.match(ig.missRun.detail, /Selector miss: instagram\.messageList/);
  assert.match(ig.missRun.detail, /Nothing was clicked/);
  assert.equal(ig.missOpened, 0);
});

test('pacing: every pause taken was between 4 and 9 seconds', () => {
  assert.ok(ig.pauses.length >= 20, ig.pauses.length + ' pauses recorded');
  assert.ok(pacedOk(ig.pauses), 'pauses: ' + ig.pauses.join(','));
});

/* ---------------------------- Business Suite fixture ---------------------------- */

let bs;
test('business suite fixture runs to the end', async () => {
  bs = await runFixture('business-suite.html');
  assert.deepEqual(bs.errors, []);
});

test('business suite: panel, health, textarea insert, send guard', () => {
  assert.equal(bs.panelLoaded, true);
  assert.deepEqual(bs.healthMissingRequired.sort(), ['businessSuite.createLabelOption', 'businessSuite.labelInput', 'businessSuite.labelOption'], 'only the picker targets are missing while the picker is closed');
  assert.equal(bs.afterInsert, 'Hey there, thanks for reaching out');
  assert.equal(bs.sendGuard, 'SafetyError');
  assert.equal(bs.sendClicks, 0);
});

test('business suite: capture reads the platform from the badge', () => {
  assert.equal(bs.captureRun.outcome, 'done');
  assert.equal(bs.captureIngests.length, 1);
  assert.equal(bs.captureIngests[0].platform, 'messenger');
  assert.equal(bs.captureIngests[0].thread.name, 'Bob Stone');
  assert.match(bs.captureIngests[0].thread.externalId, /^n_[0-9a-f]{8}$/);
  assert.deepEqual(bs.captureIngests[0].messages.map((m) => m.direction), ['in', 'out', 'in']);
});

test('label sync: adds missing labels, creates new ones, acks each item precisely', () => {
  assert.equal(bs.syncRun.outcome, 'done');
  const byId = Object.fromEntries(bs.acks.map((a) => [a.id, a]));
  assert.deepEqual(bs.acks.map((a) => a.id), ['q1', 'q2', 'q3', 'q4', 'q5', 'q6']);
  assert.deepEqual(byId.q1, { id: 'q1', ok: true });
  assert.equal(byId.q2.ok, false);
  assert.match(byId.q2.error, /"Nobody Here" was not found in the inbox, even after searching/);
  assert.equal(byId.q3.ok, false);
  assert.match(byId.q3.error, /2 conversations in the list are named "Sam Lee"\. Not clicking any of them/);
  assert.deepEqual(byId.q4, { id: 'q4', ok: true });
  assert.deepEqual(byId.q5, { id: 'q5', ok: true });
  assert.equal(byId.q6.ok, false);
  assert.match(byId.q6.error, /Invalid queue item/);

  assert.deepEqual(bs.labels['Jane Doe#0'], ['Hot lead', 'VIP', 'Webinar', 'Create']);
  assert.deepEqual(bs.labels['Bob Stone#1'], ['VIP'], 'existing label reused, not duplicated in another case');
  assert.deepEqual(bs.labels['Sam Lee#2'], []);
  assert.deepEqual(bs.labels['Sam Lee#3'], []);
  assert.deepEqual(bs.labels['Dee Late#4'], ['VIP'], 'found through the search box');
  assert.deepEqual(bs.created, ['Webinar', 'Create'], 'only the labels that did not exist were created');
  assert.deepEqual(bs.opened, ['Jane Doe', 'Bob Stone', 'Dee Late'], 'ambiguous and missing conversations were never clicked');
  assert.equal(bs.searchLeftEmpty, true);
  assert.equal(bs.syncRun.itemsOk, 3);
  assert.equal(bs.syncRun.itemsFailed, 3);
  assert.equal(bs.syncRun.labelsApplied, 5);
});

test('label sync: a missing Labels block acks ok false with the selector name', () => {
  assert.equal(bs.brokenRun.outcome, 'done');
  assert.equal(bs.brokenAcks.length, 1);
  assert.equal(bs.brokenAcks[0].ok, false);
  assert.match(bs.brokenAcks[0].error, /Selector miss: businessSuite\.labelSection/);
});

test('business suite pacing: every pause was between 4 and 9 seconds', () => {
  assert.ok(bs.pauses.length >= 6);
  assert.ok(pacedOk(bs.pauses), 'pauses: ' + bs.pauses.join(','));
  assert.equal(bs.sendClicks, 0);
});

/* ---------------------------- Outreach fixture ---------------------------- */

// The outreach fixture is served over http on 127.0.0.1, because it changes
// its own path the way the real site does (/handle/ then /direct/t/id/), which
// a file URL cannot do. Any path that is not under /__ext/ gets the fixture.
const ROOT = path.resolve(__dirname, '..');
function startFixtureServer() {
  const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json' };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    let file = path.join(__dirname, 'fixture', 'outreach.html');
    if (url.pathname.startsWith('/__ext/')) {
      file = path.normalize(path.join(ROOT, url.pathname.slice('/__ext/'.length)));
      if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file)) {
        res.writeHead(404);
        return res.end('not found');
      }
    }
    res.writeHead(200, { 'Content-Type': (types[path.extname(file)] || 'text/plain') + '; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, base: 'http://127.0.0.1:' + server.address().port })));
}

let out;
test('outreach fixture runs to the end', async () => {
  const srv = await startFixtureServer();
  try {
    out = await runFixture(srv.base + '/start/');
  } finally {
    srv.server.close();
  }
  assert.deepEqual(out.errors, []);
});

test('outreach commands: a planned message with typos and corrections lands exactly, in every editor mode', () => {
  assert.equal(out.direct.length, 36);
  for (const d of out.direct) {
    const tag = d.mode + ', text ' + d.text + ', seed ' + d.seed;
    assert.equal(d.focusOk, true, tag);
    assert.equal(d.stepError, null, tag);
    assert.equal(d.ok, true, tag + ' got: ' + JSON.stringify(d.got));
  }
  assert.ok(out.direct.reduce((a, d) => a + d.typos, 0) > 100, 'the plans really contained typos');
  assert.ok(out.direct.reduce((a, d) => a + d.backspaces, 0) > 500, 'the plans really contained backspaces');
  const methods = (mode) => Array.from(new Set(out.direct.filter((d) => d.mode === mode).flatMap((d) => d.methods))).sort();
  assert.deepEqual(methods('native'), ['execCommand'], 'a plain editor ignores the event, so the browser edit is used');
  assert.deepEqual(methods('mixed'), ['beforeinput', 'execCommand'], 'an editor that takes some edits itself and rebuilds its DOM still ends up exact');
  assert.deepEqual(methods('controlled, execCommand off'), ['beforeinput'], 'an editor that takes every edit itself needs nothing else');
});

test('outreach commands: send refuses anything but the exact text, the generic click still refuses send', () => {
  assert.equal(out.sendMismatch.ok, false);
  assert.equal(out.sendMismatch.code, 'MISMATCH');
  assert.equal(out.sendNoExpect.ok, false);
  assert.equal(out.sentAfterRefusals, 0);
  assert.equal(out.cleared.text, '');
  assert.equal(out.noInsert.ok, false, 'an editor that takes neither path is an error, not a guess');
  assert.equal(out.noInsert.code, 'NO_INSERT');
  assert.equal(out.sendGuard, 'SafetyError');
  assert.equal(out.sendClicksAfterGuard, 0);
  assert.equal(out.probeProfile.messageButtons, 1);
  assert.equal(out.probeProfile.profile, true);
  assert.equal(out.probeProfile.block, null);
  assert.equal(out.probeProfile.notFound, null);
  assert.equal(out.probeProfile.account, 'owner.acct');
  assert.equal(out.unknownCmd.ok, false);
});

const sentOnce = (s) => {
  assert.equal(s.result.status, 'sent', s.result.detail);
  assert.match(s.result.detail, /read back from the thread/);
  assert.equal(s.sent.length, 1);
  assert.equal(s.sent[0].text, s.target, 'the thread holds exactly the target text');
  assert.equal(s.composer, '');
  assert.equal(s.msgClicks, 1);
  assert.ok(s.result.keystrokes >= Array.from(s.target).length - 20, 'keystrokes: ' + s.result.keystrokes);
  assert.ok(s.result.typedMs > 5000, 'typing took ' + s.result.typedMs + ' ms');
  assert.equal(s.stored, false, 'no task left in storage');
};

test('outreach auto mode: profile, Message, composer, human typing, send, confirmed in the thread', () => {
  sentOnce(out.auto);
  assert.equal(out.auto.sent[0].via, 'button');
  assert.equal(out.auto.sendClicks, 1);
  assert.equal(out.accountAfterAuto, 'owner.acct', 'the logged in handle was read');
  const cps = out.auto.target.length / 5 / (out.auto.result.typedMs / 60000);
  assert.ok(cps > 30 && cps < 110, 'effective speed ' + cps.toFixed(1) + ' wpm for a 70 to 90 wpm profile');
  sentOnce(out.autoEnter);
  assert.equal(out.autoEnter.sent[0].via, 'enter', 'Enter is used when no send control is found');
  assert.ok(out.autoEnter.target.includes('\n') && out.autoEnter.target.includes('https://example.com/a?b=c'));
  sentOnce(out.autoBeforeInput);
});

test('outreach assisted mode: typed, never sent, notice shown, held until the person sends', () => {
  const a = out.assisted;
  assert.equal(a.result.status, 'typed');
  assert.equal(a.composer, a.target, 'the box holds exactly the target text');
  assert.deepEqual(a.sent, []);
  assert.equal(a.sendClicks, 0);
  assert.match(a.notice, /not sent/);
  assert.match(a.notice, /@lead\.one/);
  assert.equal(a.hold.handle, 'lead.one');
  assert.equal(out.heldNextCalls, 0, 'no new task is fetched while the typed text waits');
  assert.equal(out.heldPath, '/direct/t/999/', 'the tab was not navigated away');
  assert.equal(out.heldBadge, 'SEND');
  assert.equal(out.afterHold.result.status, 'sent');
  assert.equal(out.afterHold.hold, null);
  assert.equal(out.afterHoldBadge, '');
});

test('outreach block detection: a phrase or a challenge URL stops at once, reports blocked, switches off', () => {
  const b = out.blocked;
  assert.equal(b.result.status, 'blocked');
  assert.match(b.result.detail, /while typing: dialog shows "try again later"/i);
  assert.deepEqual(b.sent, []);
  assert.equal(b.sendClicks, 0);
  assert.ok(b.composer.length > 0 && b.composer.length < b.target.length, 'typing stopped part way and the page was left alone');
  assert.equal(b.enabled, false, 'outreach switched itself off');
  assert.match(b.note, /block signal/);
  assert.equal(out.nextCallsWhileOff, 0, 'nothing is fetched while switched off');
  assert.equal(out.blockedUrl.result.status, 'blocked');
  assert.match(out.blockedUrl.result.detail, /URL contains \/challenge\//);
  assert.equal(out.blockedUrl.result.keystrokes, 0);
});

test('outreach failures: precise status and detail, nothing wrong is ever sent', () => {
  assert.equal(out.missFirst.result.status, 'error');
  assert.match(out.missFirst.result.detail, /Selector miss: instagramOutreach\.messageButton/);
  assert.equal(out.missFirst.msgClicks, 0);
  assert.equal(out.missLater.result.status, 'unreachable', 'once the selector has matched for real, a missing button means unreachable');
  assert.equal(out.notFound.result.status, 'not_found');
  assert.equal(out.draft.result.status, 'skipped');
  assert.equal(out.draft.composer, 'half written by a person', 'a draft is left untouched');
  assert.equal(out.draft.result.keystrokes, 0);
  assert.equal(out.mangled.result.status, 'error');
  assert.match(out.mangled.result.detail, /did not match the target after typing/);
  assert.equal(out.mangled.composer, '', 'the wrong text was cleared');
  assert.equal(out.sendDead.result.status, 'error');
  assert.match(out.sendDead.result.detail, /stayed in the composer/);
  assert.equal(out.sendDead.composer, '');
  assert.equal(out.wrongThread.result.status, 'error');
  assert.match(out.wrongThread.result.detail, /belongs to @someone\.else/);
  assert.equal(out.badUrl.result.status, 'error');
  assert.match(out.badUrl.result.detail, /Malformed task/);
  assert.equal(out.badUrlNavs, 0);
  for (const k of ['missFirst', 'missLater', 'notFound', 'draft', 'mangled', 'sendDead', 'wrongThread', 'badUrl', 'blocked', 'blockedUrl']) {
    assert.deepEqual(out[k].sent, [], k + ' sent nothing');
    assert.equal(out[k].stored, false, k + ' left no task in storage');
  }
});

test('outreach tab: one pinned background tab, created once, the only tab ever touched', () => {
  assert.equal(out.tabLog.created.length, 1);
  assert.equal(out.tabLog.created[0].pinned, true);
  assert.equal(out.tabLog.created[0].active, false);
  assert.deepEqual(out.tabLog.updatedIds, [7]);
  assert.deepEqual(out.tabLog.messagedIds, ['7']);
  assert.deepEqual(out.accounts, ['', '', 'owner.acct'], 'the account handle is sent once it has been read');
});

/* ---------------------------- */

(async () => {
  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log('PASS  ' + t.name);
    } catch (err) {
      failed++;
      console.log('FAIL  ' + t.name + '\n      ' + String(err && err.stack ? err.stack : err).split('\n').slice(0, 6).join('\n      '));
    }
  }
  console.log('\n' + (tests.length - failed) + ' passed, ' + failed + ' failed, ' + tests.length + ' total');
  process.exit(failed ? 1 : 0);
})();
