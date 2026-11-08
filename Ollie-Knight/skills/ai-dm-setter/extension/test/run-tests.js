/*
 * run-tests.js
 * Node tests, no dependencies. Run with:  node test/run-tests.js
 *
 * Covers what can be checked without a logged-in Meta session:
 *   1. Static checks: manifest, referenced files, syntax, and the hard rules
 *      (single click path, no keyboard events, no network code in content
 *      scripts) for everything except the outreach sender, plus the exact
 *      shape of the outreach carve out.
 *   2. Pure logic in src/lib/core.js.
 *   3. The human typing planner in src/lib/typing.js.
 *   4. The API client against a local stub of the app contract.
 *   5. The service worker message handling, loaded in a vm with a fake chrome.
 *   6. The outreach runner against a fake tab with a virtual clock.
 *
 * It does NOT check any selector against the real Instagram or Business Suite
 * pages. Nothing here can.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const Core = require(path.join(ROOT, 'src/lib/core.js'));
const Api = require(path.join(ROOT, 'src/lib/api.js'));
const SELECTORS = require(path.join(ROOT, 'src/selectors.js'));
const Typing = require(path.join(ROOT, 'src/lib/typing.js'));
const Outreach = require(path.join(ROOT, 'src/outreach/outreach-runner.js'));

// The one file that is allowed to send, and the only one with keyboard events.
const SENDER = path.join('src', 'outreach', 'outreach-content.js');

const results = [];
function test(name, fn) {
  results.push({ name, fn });
}

function walk(dir) {
  let out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(walk(full));
    else out.push(full);
  }
  return out;
}
const rel = (f) => path.relative(ROOT, f);
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const allFiles = walk(ROOT);
const shipped = allFiles.filter((f) => !rel(f).startsWith('test' + path.sep));
const shippedJs = shipped.filter((f) => f.endsWith('.js'));

/* ------------------------------------------------------------------ */
/* 1. Static checks                                                    */
/* ------------------------------------------------------------------ */

test('manifest.json is valid MV3 JSON with the required keys', () => {
  const m = JSON.parse(read('manifest.json'));
  assert.equal(read('src/background.js').match(/var CODE_VERSION = '([^']+)'/)[1], m.version, 'CODE_VERSION in background.js matches the manifest');
  assert.equal(m.manifest_version, 3);
  for (const p of ['storage', 'scripting', 'activeTab', 'alarms']) assert.ok(m.permissions.includes(p), 'permission ' + p);
  // declarativeNetRequestWithHostAccess: only to mark the helper's own anonymous profile preview reads (src/faces.js).
  assert.deepEqual(m.permissions.slice().sort(), ['activeTab', 'alarms', 'declarativeNetRequestWithHostAccess', 'scripting', 'storage'], 'outreach added alarms, pictures added the preview rule, nothing else');
  for (const h of ['https://www.instagram.com/*', 'https://business.facebook.com/*', 'http://localhost:3000/*']) {
    assert.ok(m.host_permissions.includes(h), 'host permission ' + h);
  }
  assert.ok(Array.isArray(m.optional_host_permissions) && m.optional_host_permissions.length > 0);
  assert.ok(m.background.service_worker);
  assert.ok(!('webRequest' in m) && !m.permissions.includes('webRequest') && !m.permissions.includes('debugger'));
  assert.deepEqual(m.content_scripts[0].matches.slice().sort(), ['https://business.facebook.com/*', 'https://www.instagram.com/*']);
});

test('every file referenced by the manifest and the HTML pages exists', () => {
  const m = JSON.parse(read('manifest.json'));
  const refs = [m.background.service_worker, m.action.default_popup, m.options_ui.page];
  m.content_scripts.forEach((cs) => refs.push(...cs.js));
  for (const page of [m.action.default_popup, m.options_ui.page]) {
    const html = read(page);
    const re = /(?:src|href)="([^"#][^"]*)"/g;
    let hit;
    while ((hit = re.exec(html))) {
      if (/^[a-z]+:/i.test(hit[1])) continue;
      refs.push(path.normalize(path.join(path.dirname(page), hit[1])));
    }
  }
  const sw = read(m.background.service_worker);
  const imp = /importScripts\(([^)]*)\)/.exec(sw);
  assert.ok(imp, 'service worker imports its libraries');
  imp[1].split(',').forEach((s) => refs.push(s.trim().replace(/^['"]\/?|['"]$/g, '')));
  refs.push(...Outreach.CONTENT_FILES);
  for (const r of refs) assert.ok(fs.existsSync(path.join(ROOT, r)), 'missing file: ' + r);
});

test('every .js file parses (node --check)', () => {
  for (const f of allFiles.filter((x) => x.endsWith('.js'))) {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  }
});

test('no em dash or en dash anywhere', () => {
  const dash = /[\u2013\u2014]/;
  for (const f of allFiles) {
    if (/\.(png|jpg|ico)$/.test(f)) continue;
    assert.ok(!dash.test(fs.readFileSync(f, 'utf8')), 'dash found in ' + rel(f));
  }
});

test('hard rule: one guarded click path for everything, plus one send click inside the outreach sender', () => {
  const hits = [];
  for (const f of shippedJs) {
    const src = fs.readFileSync(f, 'utf8');
    const n = (src.match(/\.click\(/g) || []).length;
    if (n) hits.push(rel(f) + ':' + n);
    assert.ok(!/dispatchEvent\(\s*new\s+(Mouse|Pointer)Event/.test(src), 'synthetic mouse event in ' + rel(f));
  }
  assert.deepEqual(hits.sort(), [path.join('src', 'content', 'dom.js') + ':1', SENDER + ':1']);
  const dom = read('src/content/dom.js');
  const body = dom.slice(dom.indexOf('function safeClick'), dom.indexOf('/* ---------------------------- text entry'));
  assert.ok(body.includes('looksLikeSend') && body.includes('el.click()'), 'the click sits behind the send guard');
  assert.ok(body.indexOf('looksLikeSend') < body.indexOf('el.click()'), 'guard runs before the click');
  // The send click: inside pressSend, after the composer text was compared with the expected text.
  const sender = read(SENDER);
  const send = sender.slice(sender.indexOf('function pressSend'), sender.indexOf('function lastBubbles'));
  assert.ok(send.includes('button.click()'), 'the send click sits in pressSend');
  assert.ok(send.indexOf('have !== expect') > 0 && send.indexOf('have !== expect') < send.indexOf('button.click()'), 'the text is verified before the click');
  assert.ok(send.indexOf('have !== expect') < send.indexOf("key(el, 'keydown')"), 'the text is verified before Enter');
});

test('hard rule: no keyboard events and no form submission outside the outreach sender', () => {
  const re = /KeyboardEvent|keydown|keypress|keyup|\.submit\(|requestSubmit/;
  for (const f of shippedJs) {
    if (rel(f) === SENDER) continue;
    assert.ok(!re.test(fs.readFileSync(f, 'utf8')), 'keyboard or submit code in ' + rel(f));
  }
  const sender = read(SENDER);
  assert.ok(!/\.submit\(|requestSubmit/.test(sender), 'the sender submits no form');
  assert.equal((sender.match(/new KeyboardEvent\(/g) || []).length, 1, 'one place builds a keyboard event');
  assert.ok(/key: 'Enter'/.test(sender), 'and it is Enter');
  const uses = sender.match(/\bkey\(el, '[a-z]+'\)/g) || [];
  assert.deepEqual(uses, ["key(el, 'keydown')", "key(el, 'keypress')", "key(el, 'keyup')"], 'Enter is pressed in exactly one place');
  const send = sender.slice(sender.indexOf('function pressSend'), sender.indexOf('function lastBubbles'));
  assert.ok(send.includes("key(el, 'keydown')"), 'that place is pressSend');
});

test('hard rule: content scripts hold no network code and no Meta endpoints', () => {
  const content = shippedJs.filter(
    (f) => rel(f).startsWith(path.join('src', 'content')) || rel(f) === path.join('src', 'selectors.js') || rel(f).startsWith(path.join('src', 'outreach')) || rel(f) === path.join('src', 'lib', 'typing.js')
  );
  assert.ok(content.length >= 9);
  for (const f of content) {
    const src = fs.readFileSync(f, 'utf8');
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource|webRequest/.test(src), 'network code in ' + rel(f));
  }
  for (const f of shippedJs) {
    const src = fs.readFileSync(f, 'utf8');
    assert.ok(!/graphql|\/api\/v1\/|i\.instagram\.com|graph\.facebook\.com|ajax\/bz/i.test(src), 'Meta endpoint in ' + rel(f));
  }
  const withFetch = shippedJs.filter((f) => /\bfetch\b/.test(fs.readFileSync(f, 'utf8'))).map(rel);
  assert.deepEqual(withFetch, [path.join('src', 'faces.js'), path.join('src', 'lib', 'api.js')]);
  // The one Instagram read: an anonymous profile preview. No cookies, profile pages only, rule limited to this helper.
  const faces = read('src/faces.js');
  assert.ok(/credentials:\s*'omit'/.test(faces), 'picture reads send no cookies');
  assert.ok(/'https:\/\/www\.instagram\.com\/' \+ encodeURIComponent\(handle\) \+ '\/'/.test(faces), 'picture reads only open profile pages');
  assert.ok(/initiatorDomains: \[chrome\.runtime\.id\]/.test(faces) && /header: 'cookie', operation: 'remove'/.test(faces), 'preview rule covers only this helper and strips cookies');
});

test('hard rule: nothing follows or likes, and no conversation is started except through a profile Message button', () => {
  for (const f of shippedJs.filter((x) => rel(x) !== path.join('src', 'selectors.js'))) {
    const src = fs.readFileSync(f, 'utf8').toLowerCase();
    assert.ok(!/unfollow|\bfollow\(|\blike\(|new message|compose new|direct\/new/.test(src), 'follow, like or compose code in ' + rel(f));
  }
  const sel = read('src/selectors.js').toLowerCase();
  assert.ok(!/follow|new message|direct\/new/.test(sel), 'follow or compose selector present');
  // The Message button is clicked in one place, through the guarded click helper.
  const users = shippedJs.filter((f) => /'messageButton'/.test(fs.readFileSync(f, 'utf8'))).map(rel);
  assert.deepEqual(users, [SENDER]);
  assert.ok(/dom\.safeClick\(SITE, buttons\[0\]/.test(read(SENDER)));
});

test('outreach carve out: sending lives in the outreach files only and the rest cannot reach it', () => {
  const m = JSON.parse(read('manifest.json'));
  const listed = m.content_scripts.flatMap((cs) => cs.js);
  assert.ok(!listed.some((f) => /outreach/.test(f)), 'the sender is not a manifest content script');
  assert.ok(!JSON.stringify(m.web_accessible_resources || []).includes('outreach'));
  // Only the runner names the sender file, to inject it (selectors.js mentions it in a comment).
  const naming = shipped.filter((f) => !f.endsWith('README.md') && /outreach-content/.test(fs.readFileSync(f, 'utf8'))).map(rel).sort();
  assert.deepEqual(naming, [SENDER, path.join('src', 'outreach', 'outreach-runner.js'), path.join('src', 'selectors.js')].sort());
  assert.ok(!/outreach-content/.test(read('src/selectors.js').replace(/\/\/.*$/gm, '')), 'in selectors.js it is only a comment');
  // Capture, labels, panel, dom and main never talk to the sender or use its commands.
  for (const f of shippedJs.filter((x) => rel(x).startsWith(path.join('src', 'content')))) {
    const src = fs.readFileSync(f, 'utf8');
    assert.ok(!/AIDM\.outreach|aidm:outreach|pressSend|planTyping|AIDMTyping/.test(src), 'sender reference in ' + rel(f));
  }
  // The only senders of an outreach command are the runner (to its own tab) and nobody else.
  const commanders = shippedJs.filter((f) => /'aidm:outreach'/.test(fs.readFileSync(f, 'utf8'))).map(rel).sort();
  assert.deepEqual(commanders, [path.join('src', 'background.js'), SENDER, path.join('src', 'outreach', 'outreach-runner.js')].sort());
  assert.ok(/msg\.type === 'aidm:outreach'\) return false/.test(read('src/background.js')), 'the worker only declines to handle that type');
  const sender = read(SENDER);
  assert.ok(/if \(sender\.tab\) return false;/.test(sender), 'the sender obeys the service worker only, never another tab or page');
  assert.ok(/sender\.id !== chrome\.runtime\.id/.test(sender));
  // The runner only touches the tab it created: no tab lookup of any kind.
  const runner = read('src/outreach/outreach-runner.js');
  assert.ok(!/tabs\.query|tabs\.getCurrent|lastFocusedWindow|currentWindow|windows\./.test(runner), 'the runner never looks for another tab');
  const tabCalls = Array.from(new Set(runner.match(/chrome\.tabs\.[a-zA-Z]+/g))).sort();
  assert.deepEqual(tabCalls, ['chrome.tabs.create', 'chrome.tabs.get', 'chrome.tabs.sendMessage', 'chrome.tabs.update']);
  assert.ok(/chrome\.tabs\.create\(\{ url: url, active: false, pinned: true \}\)/.test(runner), 'the tab is created pinned and in the background');
  // Out of scope by decision: no spoofing of visibility or focus state.
  for (const f of shippedJs) {
    const src = fs.readFileSync(f, 'utf8');
    assert.ok(!/defineProperty\([^)]*(visibilityState|hidden|hasFocus)|visibilitychange|new FocusEvent|dispatchEvent\(new Event\('(focus|blur)/.test(src), 'visibility or focus spoofing in ' + rel(f));
  }
  // Off by default, and only the popup can switch it.
  assert.ok(/enabled: s\.enabled === true/.test(runner), 'outreach is off unless it was switched on');
  const bg = read('src/background.js');
  assert.ok(!/API_CALLS = \[[^\]]*outreach/.test(bg), 'content scripts cannot make outreach calls to the app');
  assert.equal((bg.match(/senderIsExtensionPage\(sender\)\) return Promise\.reject/g) || []).length, 2);
});

test('selectors.js: every target has a description and several fallbacks, and is marked UNVERIFIED', () => {
  const src = read('src/selectors.js');
  for (const siteKey of ['instagram', 'businessSuite', 'instagramOutreach']) {
    const targets = SELECTORS[siteKey].targets;
    for (const key of Object.keys(targets)) {
      const t = targets[key];
      assert.ok(typeof t.desc === 'string' && t.desc.length > 5, siteKey + '.' + key + ' desc');
      const n = t.css.length + (t.text ? t.text.values.length : 0);
      assert.ok(t.css.length >= 2 && n >= 3, siteKey + '.' + key + ' has only ' + n + ' fallbacks');
      if (t.scope) assert.ok(targets[t.scope], siteKey + '.' + key + ' scope exists');
      const at = src.indexOf('        ' + key + ': {', src.indexOf('    ' + siteKey + ': {'));
      assert.ok(at > 0, 'found ' + key + ' in source');
      const before = src.slice(Math.max(0, at - 700), at);
      assert.ok(/\/\/ (UNVERIFIED|Checked live \d{4}-\d{2}-\d{2})\.[^{}]*$/.test(before), siteKey + '.' + key + ' lacks an UNVERIFIED or Checked live comment');
    }
  }
  assert.ok(SELECTORS.common.markers.haltTexts.length > 10);
  // Every outreach target the sender uses exists, and the health check can run on that site.
  const used = Array.from(new Set(read(SENDER).match(/\(SITE, '([A-Za-z]+)'/g).map((x) => x.slice(8, -1)))).sort();
  for (const key of used) assert.ok(SELECTORS.instagramOutreach.targets[key], 'instagramOutreach.' + key + ' is defined');
  for (const key of ['loginForm', 'messageList', 'threadList', 'composer']) assert.ok(SELECTORS.instagramOutreach.targets[key], 'health check needs ' + key);
  for (const t of Object.values(SELECTORS.instagramOutreach.targets)) assert.ok(!t.where || ['profile', 'thread'].includes(t.where));
  assert.ok(/outreachHealth/.test(read('src/content/main.js')), 'outreach selectors are part of the health check');
});

test('selectors live only in selectors.js (no role or aria selectors elsewhere)', () => {
  for (const f of shippedJs.filter((x) => rel(x) !== path.join('src', 'selectors.js'))) {
    const src = fs.readFileSync(f, 'utf8');
    assert.ok(!/\[(role|aria-[a-z]+|data-[a-z-]+|contenteditable|href)[\^*$]?=/.test(src), 'inline selector in ' + rel(f));
    assert.ok(!/querySelector(All)?\(\s*['"]/.test(src), 'literal querySelector in ' + rel(f));
  }
});

/* ------------------------------------------------------------------ */
/* 2. Pure logic                                                       */
/* ------------------------------------------------------------------ */

const M = (direction, text, sentAt) => ({ direction, text, sentAt: sentAt || null });
const seq = (from, to) => {
  const out = [];
  for (let i = from; i <= to; i++) out.push(M(i % 3 === 0 ? 'out' : 'in', 'message ' + i));
  return out;
};

test('pacing: pauses stay inside 4 to 9 seconds and the floor cannot be lowered', () => {
  for (let i = 0; i < 2000; i++) {
    const p = Core.randomPause();
    assert.ok(p >= 4000 && p <= 9000, 'pause ' + p);
  }
  assert.equal(Core.randomPause(() => 0), 4000);
  assert.equal(Core.randomPause(() => 1), 9000);
  assert.equal(Core.randomPause(() => 0.5), 6500);
  assert.equal(Core.randomPause(() => 0, 10, 20), 4000, 'a caller cannot go faster than 4 s');
  assert.equal(Core.randomPause(() => NaN), 4000);
  const seen = new Set();
  for (let i = 0; i < 50; i++) seen.add(Core.randomPause());
  assert.ok(seen.size > 20, 'pauses are randomised');
});

test('pacing: cap clamps to 1..150 with default 40', () => {
  assert.equal(Core.clampCap(undefined), 40);
  assert.equal(Core.clampCap('abc'), 40);
  assert.equal(Core.clampCap(0), 1);
  assert.equal(Core.clampCap(-5), 1);
  assert.equal(Core.clampCap(151), 150);
  assert.equal(Core.clampCap(100000), 150);
  assert.equal(Core.clampCap('75'), 75);
  assert.equal(Core.clampCap(12.9), 12);
  assert.equal(Core.mergeSettings({}).captureCap, 40);
  assert.equal(Core.mergeSettings({ captureCap: 999 }).captureCap, 150);
  assert.equal(Core.mergeSettings(undefined).baseUrl, 'https://ainable-setter.vercel.app');
});

test('stop token: sleep rejects at once when stopped', async () => {
  const token = Core.createStopToken();
  const started = Date.now();
  const p = Core.sleep(60000, token);
  setTimeout(() => token.stop('Stopped by user'), 20);
  await assert.rejects(p, (e) => e.name === 'StopError');
  assert.ok(Date.now() - started < 1000);
  await assert.rejects(Core.sleep(10, token), (e) => e.name === 'StopError');
  assert.throws(() => token.throwIfStopped(), (e) => e.name === 'StopError');
  await Core.sleep(5, Core.createStopToken());
});

test('de-dup: overlapping snapshots merge without loss or repeats', () => {
  const full = seq(1, 60);
  let acc = [];
  let r = Core.mergeSnapshots(acc, full.slice(40, 60));
  acc = r.messages;
  assert.equal(r.added, 20);
  r = Core.mergeSnapshots(acc, full.slice(20, 50)); // older page, overlaps 10
  acc = r.messages;
  assert.equal(r.added, 20);
  assert.equal(r.gap, false);
  r = Core.mergeSnapshots(acc, full.slice(0, 60)); // non-virtualised list: everything rendered
  acc = r.messages;
  assert.equal(r.added, 20);
  assert.deepEqual(acc.map((m) => m.text), full.map((m) => m.text));
  r = Core.mergeSnapshots(acc, full.slice(0, 60)); // nothing new
  assert.equal(r.added, 0);
  assert.equal(r.messages.length, 60);
});

test('de-dup: genuine repeated messages survive', () => {
  const thread = [M('in', 'ok'), M('in', 'ok'), M('out', 'great'), M('in', 'ok'), M('out', 'great'), M('in', 'thanks')];
  let acc = Core.mergeSnapshots([], thread.slice(2)).messages;
  acc = Core.mergeSnapshots(acc, thread.slice(0, 5)).messages;
  assert.deepEqual(acc, thread);
  acc = Core.mergeSnapshots(acc, thread).messages;
  assert.equal(acc.length, 6);
});

test('de-dup: a window inside what is already collected adds nothing', () => {
  const full = seq(1, 30);
  const r = Core.mergeSnapshots(full, full.slice(5, 15));
  assert.equal(r.added, 0);
  assert.equal(r.gap, false);
  assert.equal(r.messages.length, 30);
});

test('de-dup: new messages arriving at the bottom are appended', () => {
  const full = seq(1, 25);
  const r = Core.mergeSnapshots(full.slice(5, 20), full.slice(0, 25));
  assert.equal(r.added, 10);
  assert.deepEqual(r.messages.map((m) => m.text), full.map((m) => m.text));
});

test('de-dup: no overlap is reported as a gap, never silently merged', () => {
  const r = Core.mergeSnapshots(seq(50, 60), seq(1, 10));
  assert.equal(r.gap, true);
  assert.equal(r.messages.length, 21);
  assert.equal(r.messages[0].text, 'message 1');
});

test('de-dup: timestamps are kept from whichever copy has one', () => {
  const a = [M('in', 'hello'), M('out', 'hi there'), M('in', 'how much is it')];
  const b = [M('in', 'older'), M('in', 'hello', '2026-09-01T10:00:00.000Z'), M('out', 'hi there', '2026-09-01T10:00:00.000Z')];
  const r = Core.mergeSnapshots(a, b);
  assert.equal(r.added, 1);
  assert.equal(r.messages[1].sentAt, '2026-09-01T10:00:00.000Z');
  assert.equal(r.messages[3].sentAt, null);
});

test('de-dup: whitespace differences do not break the overlap', () => {
  const a = [M('in', 'hello   there'), M('out', 'line one\nline two')];
  const b = [M('in', 'first'), M('in', ' hello\u00a0there '), M('out', 'line one\r\nline two')];
  const r = Core.mergeSnapshots(a, b);
  assert.equal(r.gap, false);
  assert.equal(r.messages.length, 3);
});

test('chunking: 200 per request, order continuous, complete only on the last chunk', () => {
  assert.deepEqual(Core.chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(Core.chunk([], 200), []);
  assert.throws(() => Core.chunk([1], 0));
  const thread = { externalId: '123', name: 'Jane Doe', handle: 'jane.doe', url: 'https://www.instagram.com/direct/t/123/' };
  const payloads = Core.buildIngestPayloads({ platform: 'instagram', thread, messages: seq(1, 450), complete: true });
  assert.deepEqual(payloads.map((p) => p.messages.length), [200, 200, 50]);
  assert.deepEqual(payloads.map((p) => p.complete), [false, false, true]);
  const orders = payloads.flatMap((p) => p.messages.map((m) => m.order));
  assert.deepEqual(orders, Array.from({ length: 450 }, (_, i) => i));
  assert.equal(payloads[0].messages[0].text, 'message 1');
  payloads.forEach((p) => assert.equal(Core.validateIngestBody(p), null));
  const partial = Core.buildIngestPayloads({ platform: 'instagram', thread, messages: seq(1, 250), complete: false });
  assert.deepEqual(partial.map((p) => p.complete), [false, false]);
  assert.deepEqual(Object.keys(payloads[0]).sort(), ['complete', 'messages', 'platform', 'thread']);
  assert.deepEqual(Object.keys(payloads[0].messages[0]).sort(), ['direction', 'order', 'sentAt', 'text']);
  assert.deepEqual(Object.keys(payloads[0].thread).sort(), ['avatar', 'externalId', 'handle', 'name', 'url']);
});

test('chunking: empty and malformed messages are dropped before ordering', () => {
  const out = Core.finaliseMessages([M('in', '  '), M('sideways', 'x'), null, M('out', ' hi '), M('in', 'yo')]);
  assert.deepEqual(out, [
    { direction: 'out', text: 'hi', sentAt: null, order: 0 },
    { direction: 'in', text: 'yo', sentAt: null, order: 1 }
  ]);
});

test('ingest validation rejects bodies that break the contract', () => {
  const ok = {
    platform: 'messenger',
    thread: { externalId: 'x', name: 'A', handle: null, url: 'u' },
    messages: [{ direction: 'in', text: 'a', sentAt: null, order: 0 }],
    complete: false
  };
  assert.equal(Core.validateIngestBody(ok), null);
  assert.match(Core.validateIngestBody({ ...ok, platform: 'whatsapp' }), /platform/);
  assert.match(Core.validateIngestBody({ ...ok, thread: { ...ok.thread, externalId: '' } }), /externalId/);
  assert.match(Core.validateIngestBody({ ...ok, messages: [{ direction: 'in', text: '', sentAt: null, order: 0 }] }), /text/);
  assert.match(Core.validateIngestBody({ ...ok, messages: new Array(201).fill(ok.messages[0]) }), /more than 200/);
  assert.match(Core.validateIngestBody({ ...ok, complete: 'yes' }), /complete/);
});

test('thread ids: URL id first, then a stable hash of handle, then of name', () => {
  assert.equal(Core.instagramThreadIdFromUrl('https://www.instagram.com/direct/t/340282366841710300949128137443944319108/'), '340282366841710300949128137443944319108');
  assert.equal(Core.instagramThreadIdFromUrl('https://www.instagram.com/direct/t/123?x=1'), '123');
  assert.equal(Core.instagramThreadIdFromUrl('https://www.instagram.com/direct/inbox/'), null);
  assert.equal(Core.queryParamFromUrl('https://business.facebook.com/latest/inbox/all?asset_id=1&selected_item_id=999', ['selected_item_id']), '999');
  assert.equal(Core.queryParamFromUrl('not a url', ['a']), null);
  assert.equal(Core.stableExternalId({ urlId: '123', handle: 'jane', name: 'Jane' }), '123');
  const byHandle = Core.stableExternalId({ handle: '@Jane.Doe', name: 'Jane' });
  assert.equal(byHandle, Core.stableExternalId({ handle: 'jane.doe', name: 'Someone Else' }));
  assert.match(byHandle, /^h_[0-9a-f]{8}$/);
  const byName = Core.stableExternalId({ name: '  Jane   DOE ' });
  assert.equal(byName, Core.stableExternalId({ name: 'jane doe' }));
  assert.match(byName, /^n_[0-9a-f]{8}$/);
  assert.notEqual(byName, Core.stableExternalId({ name: 'jane roe' }));
  assert.throws(() => Core.stableExternalId({}));
  assert.equal(Core.hashString('hello'), '4f9f2cab'); // FNV-1a reference value
  assert.equal(Core.handleFromProfileHref('/jane.doe/'), 'jane.doe');
  assert.equal(Core.handleFromProfileHref('https://www.instagram.com/Jane_Doe?hl=en'), 'jane_doe');
  assert.equal(Core.handleFromProfileHref('/direct/inbox/'), null);
  assert.equal(Core.handleFromProfileHref('/has space/'), null);
});

test('halt detection: rate-limit, checkpoint and login text and URLs', () => {
  const texts = SELECTORS.common.markers.haltTexts;
  const urls = SELECTORS.common.markers.haltUrlParts;
  assert.ok(Core.detectHalt('Try Again Later', texts));
  assert.ok(Core.detectHalt('We restrict certain activity to protect our community.', texts));
  assert.ok(Core.detectHalt('Please wait a few minutes before you try again.', texts));
  assert.ok(Core.detectHalt('Confirm it\u2019s you to continue', texts));
  assert.ok(Core.detectHalt('Log in to continue', texts));
  assert.ok(Core.detectHalt('Your account is at a   checkpoint', texts));
  assert.equal(Core.detectHalt('Hey, loved your post about pricing', texts), null);
  assert.equal(Core.detectHalt('', texts), null);
  assert.ok(Core.detectHaltUrl('/accounts/login/?next=/direct/inbox/', urls));
  assert.ok(Core.detectHaltUrl('/challenge/action/abc/', urls));
  assert.ok(Core.detectHaltUrl('/checkpoint/1501092823525282/', urls));
  assert.equal(Core.detectHaltUrl('/direct/t/123/', urls), null);
  assert.equal(Core.detectHaltUrl('/latest/inbox/all', urls), null);
  assert.equal(Core.HaltError('try again later').name, 'HaltError');
});

test('timestamps: readable forms become ISO, ambiguous ones become null', () => {
  const now = new Date(2026, 9, 7, 15, 30); // Wed 7 Oct 2026, local time
  const iso = (y, mo, d, h, mi) => new Date(y, mo, d, h || 0, mi || 0).toISOString();
  assert.equal(Core.parseTimestamp('2026-09-03T14:05:00.000Z', now), '2026-09-03T14:05:00.000Z');
  assert.equal(Core.parseTimestamp('1759847400', now), new Date(1759847400000).toISOString());
  assert.equal(Core.parseTimestamp('Today 4:12 PM', now), iso(2026, 9, 7, 16, 12));
  assert.equal(Core.parseTimestamp('Yesterday 09:05', now), iso(2026, 9, 6, 9, 5));
  assert.equal(Core.parseTimestamp('4:12 PM', now), iso(2026, 9, 7, 16, 12));
  assert.equal(Core.parseTimestamp('12:05 AM', now), iso(2026, 9, 7, 0, 5));
  assert.equal(Core.parseTimestamp('Mon 4:12 PM', now), iso(2026, 9, 5, 16, 12));
  assert.equal(Core.parseTimestamp('Wednesday 10:00', now), iso(2026, 8, 30, 10, 0));
  assert.equal(Core.parseTimestamp('Sep 3, 2026, 4:12 PM', now), iso(2026, 8, 3, 16, 12));
  assert.equal(Core.parseTimestamp('3 Sep 2026, 16:12', now), iso(2026, 8, 3, 16, 12));
  assert.equal(Core.parseTimestamp('September 3 at 4:12\u202fpm', now), iso(2026, 8, 3, 16, 12));
  assert.equal(Core.parseTimestamp('Dec 24, 9:00 AM', now), iso(2025, 11, 24, 9, 0), 'a future date without a year means last year');
  assert.equal(Core.parseTimestamp('March 14', now), iso(2026, 2, 14));
  assert.equal(Core.parseTimestamp('03/04/2026', now), null);
  assert.equal(Core.parseTimestamp('Feb 31', now), null);
  assert.equal(Core.parseTimestamp('Seen', now), null);
  assert.equal(Core.parseTimestamp('', now), null);
  assert.equal(Core.parseTimestamp(null, now), null);
});

test('labels: missing labels are case-insensitive and de-duplicated; queue items are validated', () => {
  assert.deepEqual(Core.missingLabels(['Hot lead', 'VIP', 'vip', ' Booked '], ['vip', 'Other']), ['Hot lead', 'Booked']);
  assert.deepEqual(Core.missingLabels(['A'], ['a']), []);
  assert.deepEqual(Core.missingLabels([], ['a']), []);
  assert.equal(Core.validateQueueItem({ id: '1', platform: 'instagram', name: 'Jane', handle: null, externalId: 'x', labels: ['VIP'] }), null);
  assert.match(Core.validateQueueItem({ id: '1', name: 'Jane', labels: [] }), /labels/);
  assert.match(Core.validateQueueItem({ id: '1', name: ' ', labels: ['a'] }), /name/);
  assert.match(Core.validateQueueItem({ name: 'Jane', labels: ['a'] }), /id/);
  assert.match(Core.validateQueueItem({ id: '1', name: 'Jane', labels: ['x'.repeat(101)] }), /longer/);
});

/* ------------------------------------------------------------------ */
/* 3. Human typing planner                                             */
/* ------------------------------------------------------------------ */

// Small seeded generator, so every plan in these tests is reproducible.
function seeded(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PLAIN = 'Hey Sam, saw your post about pricing for coaches and thought it was spot on. Are you taking on new clients this quarter?';
const RICH =
  'Hi \u{1F44B}\u{1F3FD} love the page! Have a look at https://example.com/a?b=c or www.foo.io and tag @jane.doe_1 \u{1F64C}\n' +
  'Second line here \u{1F468}‍\u{1F469}‍\u{1F467} ok, mail me at ollie@example.org.\n\nCafé piñata, naıve é \u{1F1EC}\u{1F1E7} bye';
const TYPING_TEXTS = [
  PLAIN,
  RICH,
  '',
  'a',
  ' ',
  '\u{1F642}',
  'ok @x',
  '@handle.only',
  'https://only.a/url',
  'line one\nline two\r\nline three\n\n\nend',
  'ALL CAPS AND 12345 numbers!!! ... ???',
  'tabs\tand  double  spaces   here',
  '\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}\u{1F3F3}️‍\u{1F308}\u{1F44D}\u{1F3FF}',
  'lone surrogate \ud83d here and \udc4b there',
  '日本語のテキスト mixed with English words',
  'word '.repeat(120).trim()
];
const HEAVY = { wpmMin: 40, wpmMax: 70, typoRate: 0.12, rewriteRate: 1, pauseRate: 0.1 };

// Replays a plan while checking, step by step, the things replay() cannot see.
function auditPlan(text, steps) {
  const units = Typing.analyse(text);
  const buf = [];
  let typoSteps = 0;
  let open = false; // a mistake is in the buffer and not yet backspaced away
  const isPrefix = () => buf.every((b, k) => units[k] && units[k].s === b);
  for (const st of steps) {
    assert.ok(['type', 'back', 'pause'].includes(st.op), 'op ' + st.op);
    assert.ok(Number.isInteger(st.wait) && st.wait >= 0 && st.wait < 20000, 'wait ' + st.wait);
    if (st.op === 'type') {
      assert.ok(typeof st.ch === 'string' && st.ch.length > 0, 'type has a character');
      // never half of a surrogate pair, unless the text itself holds a lone one
      const first = st.ch.charCodeAt(0);
      const last = st.ch.charCodeAt(st.ch.length - 1);
      const lone = (first >= 0xdc00 && first <= 0xdfff) || (last >= 0xd800 && last <= 0xdbff);
      if (lone) assert.ok(units.some((u) => u.s === st.ch), 'a split surrogate pair was typed');
      const i = buf.length;
      const u = units[i];
      const prefixRight = isPrefix();
      if (st.typo) {
        typoSteps++;
        assert.ok(prefixRight && !open, 'a typo starts from a correct buffer, one mistake at a time');
        assert.ok(u && u.safe, 'typo at a protected or unsafe position: ' + JSON.stringify(u));
        open = true;
      }
      // with no mistake open, the only thing ever typed is the next correct unit
      if (!open) assert.equal(st.ch, u && u.s, 'an unannounced wrong character');
      if (st.ch.length > 1 || !/^[\x20-\x7E¡-ɏͰ-ϿЀ-ӿ‘-‟]$/.test(st.ch)) {
        assert.ok(prefixRight && u && u.s === st.ch, 'a composed or protected character is only typed in its right place');
      }
      buf.push(st.ch);
    } else if (st.op === 'back') {
      assert.ok(open || st.rewrite || (steps[steps.indexOf(st) - 1] || {}).op === 'back', 'a backspace belongs to a correction or a rewrite');
      assert.ok(buf.length > 0, 'backspace on an empty buffer');
      const gone = buf.pop();
      assert.equal(gone.length, 1, 'backspace removed a multi unit character: ' + JSON.stringify(gone));
      const idx = buf.length;
      const exact = buf.every((b, k) => units[k] && units[k].s === b) && units[idx] && units[idx].s === gone;
      if (exact) assert.ok(units[idx].safe, 'backspace removed a correctly typed protected character');
      if (open && isPrefix()) {
        // the correction is complete once the buffer is right again and the next key is not another backspace
        const next = steps[steps.indexOf(st) + 1];
        if (!next || next.op !== 'back') open = false;
      }
    }
  }
  assert.equal(buf.join(''), text);
  return typoSteps;
}

test('typing: replaying the plan gives exactly the target, over many seeds and texts', () => {
  let plans = 0;
  for (const text of TYPING_TEXTS) {
    for (let seed = 1; seed <= 150; seed++) {
      for (const profile of [HEAVY, undefined, { typoRate: 0.25, rewriteRate: 1, pauseRate: 0.5, wpmMin: 10, wpmMax: 200 }]) {
        const steps = Typing.planTyping(text, profile, seeded(seed * 7919 + text.length));
        assert.equal(Typing.replay(steps), text, 'seed ' + seed + ' text ' + JSON.stringify(text.slice(0, 30)));
        plans++;
      }
    }
  }
  assert.equal(plans, TYPING_TEXTS.length * 450);
  // default rng, and hostile rngs that return nonsense
  for (const rng of [undefined, () => 0, () => 1, () => 0.999999, () => NaN, () => -3, () => 'x']) {
    for (const text of TYPING_TEXTS) assert.equal(Typing.replay(Typing.planTyping(text, HEAVY, rng)), text);
  }
  assert.deepEqual(Typing.planTyping('', HEAVY, seeded(1)), []);
  assert.deepEqual(Typing.planTyping(null), []);
});

test('typing: no typo and no backspace ever touches a URL, a handle, an email, an emoji or a line break', () => {
  let typos = 0;
  for (const text of TYPING_TEXTS) {
    for (let seed = 1; seed <= 200; seed++) typos += auditPlan(text, Typing.planTyping(text, HEAVY, seeded(seed * 31 + 5)));
  }
  assert.ok(typos > 2000, 'the audit really saw typos: ' + typos);
  const units = Typing.analyse(RICH);
  const flat = (pred) => units.filter(pred).map((u) => u.s).join('');
  assert.ok(flat((u) => u.protected).includes('https://example.com/a?b=c'));
  assert.ok(flat((u) => u.protected).includes('www.foo.io'));
  assert.ok(flat((u) => u.protected).includes('@jane.doe_1'));
  assert.ok(flat((u) => u.protected).includes('ollie@example.org'));
  for (const u of units) {
    if (u.s.length > 1 || u.s === '\n') assert.equal(u.safe, false, 'unsafe: ' + JSON.stringify(u.s));
  }
  assert.equal(units.filter((u) => u.s === '\u{1F468}‍\u{1F469}‍\u{1F467}').length, 1, 'a joined emoji is one unit');
  assert.equal(units.filter((u) => u.s === '\u{1F1EC}\u{1F1E7}').length, 1, 'a flag is one unit');
  // the fallback splitter agrees with Intl.Segmenter on the hard cases
  for (const text of [RICH, TYPING_TEXTS[12], 'éa\r\nb']) {
    assert.deepEqual(Typing.fallbackGraphemes(text), Typing.splitGraphemes(text));
    assert.equal(Typing.fallbackGraphemes(text).join(''), text);
  }
});

test('typing: typos happen at about typoRate, of every kind, and each one is fixed by backspacing', () => {
  const eligible = (text) => {
    const u = Typing.analyse(text);
    return u.filter((x, i) => x.letter || (x.s === ' ' && i > 0 && u[i - 1].letter && u[i + 1] && u[i + 1].letter)).length;
  };
  for (const rate of [0.02, 0.05, 0.1]) {
    let typos = 0;
    let chances = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const steps = Typing.planTyping(PLAIN, { wpmMin: 50, wpmMax: 50, typoRate: rate, rewriteRate: 0, pauseRate: 0 }, seeded(seed));
      typos += Typing.summary(steps).typos;
      chances += eligible(PLAIN);
    }
    const seen = typos / chances;
    assert.ok(seen > rate * 0.85 && seen < rate * 1.15, 'typoRate ' + rate + ' gave ' + seen.toFixed(4));
  }
  const kinds = {};
  let fixes = 0;
  let typos = 0;
  const notice = [];
  for (let seed = 1; seed <= 600; seed++) {
    const steps = Typing.planTyping(PLAIN, { typoRate: 0.06, rewriteRate: 0, pauseRate: 0 }, seeded(seed));
    let sinceTypo = -1;
    steps.forEach((st, i) => {
      if (st.typo) {
        kinds[st.typo] = (kinds[st.typo] || 0) + 1;
        typos++;
        sinceTypo = 0;
      } else if (st.fix) {
        fixes++;
        assert.ok(st.wait >= 180, 'a noticing pause comes before the first backspace: ' + st.wait);
        if (sinceTypo >= 0) notice.push(sinceTypo);
        sinceTypo = -1;
        const nextBack = steps[i + 1];
        if (nextBack && nextBack.op === 'back') assert.ok(nextBack.wait <= 130, 'backspaces run at a quick cadence: ' + nextBack.wait);
      } else if (st.op === 'type' && sinceTypo >= 0) sinceTypo++;
    });
  }
  assert.deepEqual(Object.keys(kinds).sort(), ['adjacent', 'case', 'double', 'drop', 'space', 'transpose']);
  for (const k of Object.keys(kinds)) assert.ok(kinds[k] > 40, k + ' seen ' + kinds[k] + ' times');
  assert.ok(kinds.adjacent > kinds.double && kinds.adjacent > kinds.transpose, 'neighbouring keys are the most common slip');
  assert.ok(fixes >= typos * 0.97 && fixes <= typos, 'every typo that reached the box was backspaced: ' + fixes + ' of ' + typos);
  assert.ok(Math.min(...notice) <= 1 && Math.max(...notice) >= 6, 'noticed after 0 to 6 or more characters');
  assert.ok(notice.filter((n) => n <= 3).length > notice.length * 0.5, 'most are noticed quickly');
  // with no typos, no rewrite and no pauses the plan is the text, key by key
  const clean = Typing.planTyping(RICH, { typoRate: 0, rewriteRate: 0, pauseRate: 0 }, seeded(3));
  assert.ok(clean.every((st) => st.op === 'type' && !st.typo));
  assert.deepEqual(clean.map((st) => st.ch), Typing.analyse(RICH).map((u) => u.s));
  // adjacent keys really are neighbours on a QWERTY keyboard
  assert.deepEqual(Typing.neighbours('g').sort(), ['b', 'f', 'h', 't', 'v', 'y']);
  assert.deepEqual(Typing.neighbours('Q').sort(), ['a', 'w']);
  assert.deepEqual(Typing.neighbours('p').sort(), ['l', 'o']);
  assert.deepEqual(Typing.neighbours('1'), []);
});

test('typing: rewrites happen at rewriteRate, delete a few whole words and never a protected one', () => {
  let rewrites = 0;
  for (let seed = 1; seed <= 3000; seed++) {
    rewrites += Typing.summary(Typing.planTyping(PLAIN, { typoRate: 0, rewriteRate: 0.3, pauseRate: 0 }, seeded(seed * 7919))).rewrites;
  }
  assert.ok(rewrites > 810 && rewrites < 990, 'rewriteRate 0.3 gave ' + rewrites + ' in 3000');
  let none = 0;
  for (let seed = 1; seed <= 300; seed++) none += Typing.summary(Typing.planTyping(PLAIN, { typoRate: 0, rewriteRate: 0, pauseRate: 0 }, seeded(seed))).backspaces;
  assert.equal(none, 0, 'no typos and no rewrite means no backspace at all');
  for (let seed = 1; seed <= 300; seed++) {
    const steps = Typing.planTyping(PLAIN, { typoRate: 0, rewriteRate: 1, pauseRate: 0 }, seeded(seed));
    const sum = Typing.summary(steps);
    assert.equal(sum.rewrites, 1, 'exactly one rewrite per message at rate 1');
    const at = steps.findIndex((st) => st.rewrite);
    assert.equal(steps[at - 1].op, 'pause', 'a thinking pause comes before the deletion');
    let n = 0;
    while (steps[at + n] && steps[at + n].op === 'back') n++;
    assert.equal(n, sum.backspaces);
    assert.ok(n >= 4 && n <= 60, 'deleted ' + n + ' characters');
    assert.equal(steps[at + n].op, 'pause');
    const before = Typing.replay(steps.slice(0, at));
    const after = Typing.replay(steps.slice(0, at + n));
    assert.ok(PLAIN.startsWith(before) && PLAIN.startsWith(after), 'only correct text is deleted and retyped');
    const deleted = before.slice(after.length);
    assert.ok(deleted.trim().split(/\s+/).length <= 4, 'at most four words: ' + JSON.stringify(deleted));
    assert.ok(after === '' || after.endsWith(' ') , 'the deletion stops at a word start: ' + JSON.stringify(after.slice(-12)));
  }
  assert.equal(Typing.summary(Typing.planTyping('@a.b https://x.io/y \u{1F642}', { typoRate: 0, rewriteRate: 1, pauseRate: 0 }, seeded(1))).rewrites, 0, 'nothing but protected text: no rewrite');
});

test('typing: durations fit the words per minute, with a skewed, context aware rhythm', () => {
  const nominal = (text, wpm) => (Array.from(text).length * 12000) / wpm;
  // bare typing, no typos or pauses: close to the nominal time for the speed
  for (const wpm of [25, 45, 70, 110]) {
    let total = 0;
    for (let seed = 1; seed <= 200; seed++) {
      total += Typing.summary(Typing.planTyping(PLAIN, { wpmMin: wpm, wpmMax: wpm, typoRate: 0, rewriteRate: 0, pauseRate: 0 }, seeded(seed))).totalMs;
    }
    const ratio = total / 200 / nominal(PLAIN, wpm);
    assert.ok(ratio > 0.85 && ratio < 1.15, wpm + ' wpm bare ratio ' + ratio.toFixed(3));
  }
  // a full human profile: never faster than the top speed allows, never absurdly slow
  const profile = { wpmMin: 40, wpmMax: 60, typoRate: 0.04, rewriteRate: 0.15, pauseRate: 0.06 };
  let lo = Infinity;
  let hi = 0;
  let sum = 0;
  for (let seed = 1; seed <= 500; seed++) {
    const ms = Typing.summary(Typing.planTyping(PLAIN, profile, seeded(seed))).totalMs;
    lo = Math.min(lo, ms);
    hi = Math.max(hi, ms);
    sum += ms;
  }
  assert.ok(lo > nominal(PLAIN, 60) * 0.8, 'fastest plan ' + lo + ' ms against ' + nominal(PLAIN, 60));
  assert.ok(hi < nominal(PLAIN, 40) * 2.5, 'slowest plan ' + hi + ' ms against ' + nominal(PLAIN, 40));
  const mean = sum / 500;
  assert.ok(mean > nominal(PLAIN, 60) && mean < nominal(PLAIN, 40) * 1.5, 'mean ' + mean);
  // per message speed is drawn inside the range: faster settings give faster plans
  const at = (wpm) => {
    let t = 0;
    for (let seed = 1; seed <= 100; seed++) t += Typing.summary(Typing.planTyping(PLAIN, { wpmMin: wpm, wpmMax: wpm, typoRate: 0, rewriteRate: 0, pauseRate: 0 }, seeded(seed))).totalMs;
    return t;
  };
  assert.ok(at(30) > at(50) && at(50) > at(90));
  const speeds = new Set();
  for (let seed = 1; seed <= 40; seed++) speeds.add(Math.round(Typing.summary(Typing.planTyping(PLAIN, { wpmMin: 30, wpmMax: 90, typoRate: 0, rewriteRate: 0, pauseRate: 0 }, seeded(seed))).totalMs / 1000));
  assert.ok(speeds.size > 12, 'speed varies from message to message');

  // rhythm: gather the wait before each kind of key
  const waits = { common: [], other: [], afterSpace: [], afterSentence: [], capital: [], all: [] };
  for (let seed = 1; seed <= 300; seed++) {
    const steps = Typing.planTyping(PLAIN, { wpmMin: 50, wpmMax: 50, typoRate: 0, rewriteRate: 0, pauseRate: 0 }, seeded(seed));
    steps.forEach((st, i) => {
      if (i === 0) return;
      const prev = steps[i - 1].ch;
      const prev2 = i > 1 ? steps[i - 2].ch : '';
      waits.all.push(st.wait);
      if (prev === ' ' && /[.!?]/.test(prev2)) waits.afterSentence.push(st.wait);
      else if (prev === ' ') waits.afterSpace.push(st.wait);
      else if (/[A-Z]/.test(st.ch)) waits.capital.push(st.wait);
      else if (['th', 'he', 'in', 'er', 'an', 're', 'on', 'ou'].includes((prev + st.ch).toLowerCase())) waits.common.push(st.wait);
      else if (/[a-z]/.test(st.ch) && /[a-z]/.test(prev)) waits.other.push(st.wait);
    });
  }
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const median = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
  assert.ok(avg(waits.common) < avg(waits.other) * 0.9, 'common letter pairs are faster');
  assert.ok(avg(waits.afterSpace) > avg(waits.other) * 1.1, 'word starts are slower');
  assert.ok(avg(waits.afterSentence) > avg(waits.afterSpace) * 1.2, 'the start of a sentence is slower still');
  assert.ok(avg(waits.all) > median(waits.all) * 1.04, 'right skewed: the mean sits above the median');
  assert.ok(Math.max(...waits.all) > median(waits.all) * 4, 'with a long tail of slow keys');
  assert.ok(Math.min(...waits.all) >= 20, 'and no impossible key speeds');
  assert.ok(new Set(waits.all).size > 300, 'timing is not quantised');

  // thinking pauses follow pauseRate and prefer sentence starts
  const pauses = (rate) => {
    let n = 0;
    for (let seed = 1; seed <= 300; seed++) n += Typing.summary(Typing.planTyping(PLAIN, { typoRate: 0, rewriteRate: 0, pauseRate: rate }, seeded(seed))).pauses;
    return n / 300;
  };
  assert.equal(pauses(0), 0);
  const words = PLAIN.split(' ').length;
  assert.ok(pauses(0.05) > words * 0.05 * 0.7 && pauses(0.05) < words * 0.05 * 1.6, 'pauses per message at 0.05: ' + pauses(0.05));
  assert.ok(pauses(0.2) > pauses(0.05) * 2.5);
  // an emoji takes about as long as finding one, not one key
  const emoji = Typing.planTyping('ok \u{1F642}', { typoRate: 0, rewriteRate: 0, pauseRate: 0 }, seeded(2));
  assert.ok(emoji[emoji.length - 1].wait >= 450);
});

test('typing: profile values are clamped, summary adds up, canonical text is stable', () => {
  assert.deepEqual(Typing.normaliseProfile({ wpmMin: 500, wpmMax: 1, typoRate: 9, rewriteRate: -1, pauseRate: 'x' }), { wpmMin: 200, wpmMax: 200, typoRate: 0.25, rewriteRate: 0, pauseRate: 0.05 });
  assert.deepEqual(Typing.normaliseProfile(undefined), { wpmMin: 38, wpmMax: 62, typoRate: 0.03, rewriteRate: 0.12, pauseRate: 0.05 });
  const steps = Typing.planTyping(PLAIN, HEAVY, seeded(11));
  const sum = Typing.summary(steps);
  assert.equal(sum.steps, steps.length);
  assert.equal(sum.keystrokes, steps.filter((st) => st.op !== 'pause').length);
  assert.equal(sum.backspaces, steps.filter((st) => st.op === 'back').length);
  assert.equal(sum.totalMs, steps.reduce((a, st) => a + st.wait, 0));
  assert.equal(sum.keystrokes - 2 * sum.backspaces, Array.from(PLAIN).length, 'every extra key was taken back');
  assert.ok(sum.typos > 0 && sum.rewrites === 1 && sum.pauses > 0);
  assert.deepEqual(Typing.summary([]), { totalMs: 0, keystrokes: 0, typos: 0, backspaces: 0, pauses: 0, rewrites: 0, steps: 0 });
  assert.deepEqual(Typing.planTyping(PLAIN, HEAVY, seeded(11)), steps, 'same seed, same plan');
  assert.equal(Typing.canonical('  a b \r\nc\t d​ \n\n'), 'a b\nc  d');
  assert.equal(Typing.canonical('\u{1F468}‍\u{1F469}'), '\u{1F468}‍\u{1F469}', 'the zero width joiner of an emoji is kept');
  assert.equal(Typing.canonical(null), '');
  for (const text of TYPING_TEXTS) assert.equal(Typing.canonical(Typing.canonical(text)), Typing.canonical(text));
});

/* ------------------------------------------------------------------ */
/* 4. API client against a stub of the app contract                    */
/* ------------------------------------------------------------------ */

const TOKEN = 'test-token-abc';

function startStub() {
  const log = [];
  const state = { ingested: [], acks: [], total: 0, outreachQueue: [], outreachResults: [], nextBodies: [] };
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const url = new URL(req.url, 'http://x');
      const body = raw ? JSON.parse(raw) : null;
      log.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), headers: req.headers, body });
      const send = (status, obj, type) => {
        res.writeHead(status, { 'Content-Type': type || 'application/json' });
        res.end(typeof obj === 'string' ? obj : JSON.stringify(obj));
      };
      if (req.headers.authorization !== 'Bearer ' + TOKEN) return send(401, { error: 'bad token' });
      const route = req.method + ' ' + url.pathname;
      if (route === 'GET /api/ext/ping') return send(200, { ok: true, workspace: 'Acme Coaching' });
      if (route === 'POST /api/ext/ingest') {
        state.ingested.push(body);
        state.total += body.messages.length;
        return send(200, { conversationId: 'conv_1', added: body.messages.length, total: state.total });
      }
      if (route === 'GET /api/ext/conversation') {
        if (url.searchParams.get('externalId') === 'unknown') return send(200, { found: false });
        return send(200, {
          found: true,
          conversationId: 'conv_1',
          stage: 'Qualified',
          labels: ['Hot lead'],
          aiMode: 'suggest',
          windowOpen: true,
          suggestion: { bubbles: ['Hey Jane', 'Want the link?'], reason: 'Asked about price' }
        });
      }
      if (route === 'POST /api/ext/suggest') return send(200, { bubbles: ['New one'], reason: 'r', stage: 'Booked', labels: ['VIP'] });
      if (route === 'GET /api/ext/label-queue') {
        return send(200, { items: [{ id: 'q1', platform: 'instagram', name: 'Jane Doe', handle: 'jane.doe', externalId: '123', labels: ['VIP'] }] });
      }
      if (route === 'POST /api/ext/label-queue/ack') {
        state.acks.push(body);
        return send(200, { ok: true });
      }
      if (route === 'GET /api/ext/outreach/status') {
        return send(200, {
          enabled: true, mode: 'assisted', paused: false, pauseReason: null, sentToday: 3, capToday: 20, inWindow: true,
          nextAt: '2026-10-11T15:00:00.000Z', account: 'owner.acct', detect: { phrases: ['try again later'], urlParts: ['/challenge/'] }
        });
      }
      if (route === 'POST /api/ext/outreach/next') {
        state.nextBodies.push(body);
        const task = state.outreachQueue.shift();
        return send(200, task ? { task } : { task: null, reason: 'outside the sending window', retryInSec: 300 });
      }
      if (route === 'POST /api/ext/outreach/result') {
        state.outreachResults.push(body);
        return send(200, { ok: true, paused: body.status === 'blocked', pauseReason: body.status === 'blocked' ? 'block signal' : null });
      }
      if (route === 'GET /api/ext/html') return send(200, '<html>login</html>', 'text/html');
      return send(404, { error: 'no such route' });
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, log, state, base: 'http://127.0.0.1:' + server.address().port });
    });
  });
}

test('base URL handling', () => {
  assert.equal(Api.normaliseBaseUrl(' http://localhost:3000/ '), 'http://localhost:3000');
  assert.equal(Api.normaliseBaseUrl('https://app.example.com/dm///'), 'https://app.example.com/dm');
  assert.throws(() => Api.normaliseBaseUrl(''), /empty/);
  assert.throws(() => Api.normaliseBaseUrl('localhost:3000'), /http/);
  assert.throws(() => Api.normaliseBaseUrl('ftp://x.y'), /http/);
  assert.throws(() => Api.normaliseBaseUrl('https://user:pw@x.y'), /username/);
  assert.throws(() => Api.normaliseBaseUrl('https://x.y/?a=1'), /query/);
  assert.deepEqual(Api.originPatterns('http://localhost:3000'), ['http://localhost/*', 'http://localhost:3000/*']);
  assert.deepEqual(Api.originPatterns('https://app.example.com/dm'), ['https://app.example.com/*']);
});

test('API client: every contract call, with Bearer auth and JSON', async () => {
  const stub = await startStub();
  try {
    const client = Api.createApiClient({ baseUrl: stub.base + '/', token: TOKEN });

    assert.deepEqual(await client.ping(), { ok: true, workspace: 'Acme Coaching' });

    const thread = { externalId: '123', name: 'Jane Doe', handle: 'jane.doe', url: 'https://www.instagram.com/direct/t/123/' };
    const payloads = Core.buildIngestPayloads({ platform: 'instagram', thread, messages: seq(1, 450), complete: true });
    let added = 0;
    let last = null;
    for (const p of payloads) {
      last = await client.ingest(p);
      added += last.added;
    }
    assert.equal(added, 450);
    assert.deepEqual(last, { conversationId: 'conv_1', added: 50, total: 450 });
    assert.equal(stub.state.ingested.length, 3);
    assert.equal(stub.state.ingested[2].complete, true);
    assert.equal(stub.state.ingested[1].messages[0].order, 200);

    const conv = await client.conversation({ platform: 'instagram', externalId: '123', handle: null, name: 'Jane & Co' });
    assert.equal(conv.found, true);
    assert.deepEqual(conv.suggestion.bubbles, ['Hey Jane', 'Want the link?']);
    const convReq = stub.log.find((r) => r.path === '/api/ext/conversation');
    assert.deepEqual(convReq.query, { platform: 'instagram', externalId: '123', name: 'Jane & Co' }, 'null handle is left out, name is encoded');
    assert.equal((await client.conversation({ platform: 'instagram', externalId: 'unknown' })).found, false);

    const sug = await client.suggest({ conversationId: 'conv_1', extra: 'dropped' });
    assert.deepEqual(sug.bubbles, ['New one']);
    assert.deepEqual(stub.log.find((r) => r.path === '/api/ext/suggest').body, { conversationId: 'conv_1' });

    const queue = await client.labelQueue();
    assert.equal(queue.items[0].id, 'q1');
    await client.labelAck({ id: 'q1', ok: true, error: 'ignored when ok' });
    await client.labelAck({ id: 'q2', ok: false, error: 'Selector miss: businessSuite.labelSection' });
    assert.deepEqual(stub.state.acks, [
      { id: 'q1', ok: true },
      { id: 'q2', ok: false, error: 'Selector miss: businessSuite.labelSection' }
    ]);

    // outreach contract
    const st = await client.outreachStatus();
    assert.equal(st.mode, 'assisted');
    assert.equal(st.capToday, 20);
    assert.deepEqual(st.detect.urlParts, ['/challenge/']);
    assert.deepEqual(await client.outreachNext({ account: 'owner.acct', extra: 'dropped' }), { task: null, reason: 'outside the sending window', retryInSec: 300 });
    await client.outreachNext({});
    assert.deepEqual(stub.state.nextBodies, [{ account: 'owner.acct' }, { account: '' }]);
    stub.state.outreachQueue.push({ id: 't1', handle: 'lead.one', profileUrl: 'https://www.instagram.com/lead.one/', text: 'hi', mode: 'auto' });
    assert.equal((await client.outreachNext({ account: '' })).task.id, 't1');
    const posted = await client.outreachResult({ id: 't1', status: 'blocked', detail: 'x'.repeat(1500), typedMs: 1234.4, keystrokes: 10, typos: 1, secret: 'dropped' });
    assert.deepEqual(posted, { ok: true, paused: true, pauseReason: 'block signal' });
    assert.deepEqual(Object.keys(stub.state.outreachResults[0]).sort(), ['detail', 'id', 'keystrokes', 'status', 'typedMs', 'typos']);
    assert.equal(stub.state.outreachResults[0].detail.length, 1000);

    for (const r of stub.log) {
      assert.equal(r.headers.authorization, 'Bearer ' + TOKEN);
      assert.equal(r.headers.accept, 'application/json');
      if (r.method === 'POST') assert.equal(r.headers['content-type'], 'application/json');
      assert.ok(!r.headers.cookie, 'no cookies are sent');
    }
  } finally {
    stub.server.close();
  }
});

test('API client: clear errors for a bad token, a 404, non-JSON, no token and an unreachable app', async () => {
  const stub = await startStub();
  try {
    const bad = Api.createApiClient({ baseUrl: stub.base, token: 'wrong' });
    await assert.rejects(bad.ping(), (e) => e.name === 'ApiError' && e.status === 401 && /Check the workspace token/.test(e.message));
    const none = Api.createApiClient({ baseUrl: stub.base, token: '' });
    await assert.rejects(none.ping(), (e) => e.code === 'NO_TOKEN');
    const custom = Api.createApiClient({
      baseUrl: stub.base,
      token: TOKEN,
      fetchImpl: (url, init) => fetch(url.replace('/api/ext/ping', '/api/ext/html'), init)
    });
    await assert.rejects(custom.ping(), (e) => e.code === 'BAD_JSON');
    const missing = Api.createApiClient({
      baseUrl: stub.base,
      token: TOKEN,
      fetchImpl: (url, init) => fetch(url.replace('/api/ext/ping', '/api/ext/nope'), init)
    });
    await assert.rejects(missing.ping(), (e) => e.status === 404 && /no such route/.test(e.message));
  } finally {
    stub.server.close();
  }
  const dead = Api.createApiClient({ baseUrl: 'http://127.0.0.1:9', token: TOKEN });
  await assert.rejects(dead.ping(), (e) => e.code === 'NETWORK' && /Cannot reach the app/.test(e.message));
  const slow = Api.createApiClient({
    baseUrl: 'http://127.0.0.1:9',
    token: TOKEN,
    timeoutMs: 30,
    fetchImpl: (url, init) =>
      new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))))
  });
  await assert.rejects(slow.ping(), (e) => e.code === 'TIMEOUT');
});

/* ------------------------------------------------------------------ */
/* 5. Service worker in a vm with a fake chrome                        */
/* ------------------------------------------------------------------ */

function loadWorker(stored, granted) {
  const listeners = [];
  const store = Object.assign({}, stored);
  const calls = { accessLevel: null, alarms: [], alarmListeners: [], tabsCreated: [] };
  const session = {};
  const area = (obj) => ({
    get: async (key) => {
      const out = {};
      for (const k of Array.isArray(key) ? key : [key]) if (k in obj) out[k] = obj[k];
      return typeof key === 'string' || Array.isArray(key) ? out : Object.assign({}, obj);
    },
    set: async (o) => void Object.assign(obj, o),
    remove: async (k) => void delete obj[k]
  });
  const chrome = {
    runtime: {
      id: 'ext-id',
      getURL: (p) => 'chrome-extension://ext-id/' + p,
      onMessage: { addListener: (fn) => listeners.push(fn) },
      onInstalled: { addListener() {} },
      onStartup: { addListener() {} }
    },
    storage: {
      local: Object.assign(area(store), { setAccessLevel: (o) => void (calls.accessLevel = o.accessLevel) }),
      session: area(session)
    },
    alarms: {
      get: async (name) => calls.alarms.find((a) => a.name === name) || null,
      create: async (name, info) => void calls.alarms.push(Object.assign({ name }, info)),
      onAlarm: { addListener: (fn) => calls.alarmListeners.push(fn) }
    },
    tabs: {
      get: async () => {
        throw new Error('no tab');
      },
      create: async (o) => {
        calls.tabsCreated.push(o);
        return { id: 1 };
      },
      update: async () => ({}),
      sendMessage: async () => undefined,
      onRemoved: { addListener() {} }
    },
    scripting: { executeScript: async () => [] },
    permissions: { contains: async ({ origins }) => origins.some((o) => granted.includes(o)) }
  };
  const sandbox = { chrome, fetch, URL, AbortController, setTimeout, clearTimeout, Promise, console };
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.importScripts = (...files) => files.forEach((f) => vm.runInContext(read(f.replace(/^\//, '')), sandbox, { filename: f }));
  vm.createContext(sandbox);
  vm.runInContext(read('src/background.js'), sandbox, { filename: 'background.js' });
  const send = (msg, sender) =>
    new Promise((resolve, reject) => {
      const keepOpen = listeners[0](msg, sender || { id: 'ext-id' }, resolve);
      if (keepOpen !== true) setTimeout(() => reject(new Error('listener did not answer')), 50);
    });
  return { send, store, calls };
}

test('service worker: routes calls to the configured app only, hides the token, enforces permission', async () => {
  const stub = await startStub();
  try {
    const host = new URL(stub.base);
    const settings = { baseUrl: stub.base, token: TOKEN, captureCap: 500, showPanel: false };
    const w = loadWorker({ settings }, ['http://' + host.hostname + '/*']);
    assert.equal(w.calls.accessLevel, 'TRUSTED_CONTEXTS', 'storage is locked away from content scripts');

    const inboxTab = { id: 'ext-id', tab: { id: 1, url: 'https://www.instagram.com/direct/t/1/' }, url: 'https://www.instagram.com/direct/t/1/' };

    const pub = await w.send({ type: 'aidm:settings' }, inboxTab);
    assert.equal(pub.ok, true);
    assert.equal(pub.data.configured, true);
    assert.equal(pub.data.captureCap, 150);
    assert.equal(pub.data.showPanel, false);
    assert.ok(!('token' in pub.data) && !JSON.stringify(pub).includes(TOKEN), 'token never leaves the worker');

    const ping = await w.send({ type: 'aidm:api', call: 'ping' }, inboxTab);
    assert.deepEqual(JSON.parse(JSON.stringify(ping)), { ok: true, data: { ok: true, workspace: 'Acme Coaching' } });

    // A message cannot redirect the call to another address.
    const before = stub.log.length;
    await w.send({ type: 'aidm:api', call: 'ping', baseUrl: 'http://evil.example', arg: { baseUrl: 'http://evil.example' } }, inboxTab);
    assert.equal(stub.log.length, before + 1);

    const badBody = await w.send({ type: 'aidm:api', call: 'ingest', arg: { platform: 'instagram', messages: [] } }, inboxTab);
    assert.equal(badBody.ok, false);
    assert.equal(badBody.code, 'BAD_BODY');

    const unknown = await w.send({ type: 'aidm:api', call: 'deleteEverything' }, inboxTab);
    assert.equal(unknown.code, 'BAD_CALL');

    const otherSite = await w.send({ type: 'aidm:api', call: 'ping' }, { id: 'ext-id', tab: { id: 2, url: 'https://example.com/' }, url: 'https://example.com/' });
    assert.equal(otherSite.code, 'FORBIDDEN');
    const otherExt = await w.send({ type: 'aidm:api', call: 'ping' }, { id: 'someone-else' });
    assert.equal(otherExt.code, 'FORBIDDEN');

    const saved = await w.send({ type: 'aidm:run-update', run: { kind: 'capture-thread', outcome: 'done' } }, inboxTab);
    assert.equal(saved.ok, true);
    assert.equal(w.store.lastRun.outcome, 'done');

    const noPerm = loadWorker({ settings }, []);
    const denied = await noPerm.send({ type: 'aidm:api', call: 'ping' });
    assert.equal(denied.code, 'NO_HOST_PERMISSION');
    assert.equal(stub.log.filter((r) => r.path === '/api/ext/ping').length, 2, 'no request without host permission');

    const noToken = loadWorker({ settings: { baseUrl: stub.base } }, ['http://' + host.hostname + '/*']);
    assert.equal((await noToken.send({ type: 'aidm:api', call: 'ping' })).code, 'NO_TOKEN');

    const labelsOff = loadWorker({ settings: { ...settings, applyLabels: false } }, ['http://' + host.hostname + '/*']);
    assert.equal((await labelsOff.send({ type: 'aidm:api', call: 'labelQueue' })).code, 'LABELS_OFF');

    // Outreach: the alarm exists, it is off by default, only the popup can read or switch it.
    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(w.calls.alarms.slice().sort((a, b) => a.name.localeCompare(b.name)), [{ name: 'aidm-faces', periodInMinutes: 0.5 }, { name: 'aidm-hello', periodInMinutes: 15 }, { name: 'aidm-outreach', periodInMinutes: 1 }]);
    assert.equal(w.calls.alarmListeners.length, 1);
    for (const call of ['outreachNext', 'outreachResult', 'outreachStatus']) {
      assert.equal((await w.send({ type: 'aidm:api', call, arg: { account: '' } }, inboxTab)).code, 'BAD_CALL', 'a content script cannot call ' + call);
    }
    assert.equal((await w.send({ type: 'aidm:outreach-status' }, inboxTab)).code, 'FORBIDDEN');
    assert.equal((await w.send({ type: 'aidm:outreach-toggle', enabled: true }, inboxTab)).code, 'FORBIDDEN');
    assert.equal(w.store.outreach, undefined, 'a content script could not switch it on');

    const nextBefore = stub.state.nextBodies.length;
    await w.calls.alarmListeners[0]({ name: 'aidm-outreach' });
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(stub.state.nextBodies.length, nextBefore, 'off by default: the alarm asks the app for nothing');

    const status = await w.send({ type: 'aidm:outreach-status' });
    assert.equal(status.ok, true);
    assert.equal(status.data.enabled, false);
    assert.equal(status.data.server.sentToday, 3);
    assert.equal(status.data.server.mode, 'assisted');
    assert.deepEqual(JSON.parse(JSON.stringify(status.data.log)), []);
    assert.ok(!JSON.stringify(status).includes(TOKEN));

    const on = await w.send({ type: 'aidm:outreach-toggle', enabled: true });
    assert.equal(on.data.enabled, true);
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(stub.state.nextBodies.length, nextBefore + 1, 'switching on asks the app for a task at once');
    assert.equal(w.store.outreachPoll.reason, 'outside the sending window');
    await w.calls.alarmListeners[0]({ name: 'aidm-outreach' });
    await w.calls.alarmListeners[0]({ name: 'some-other-alarm' });
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(stub.state.nextBodies.length, nextBefore + 1, 'retryInSec is respected by later alarms');
    assert.equal(w.calls.tabsCreated.length, 0, 'no task, no tab');
    const off = await w.send({ type: 'aidm:outreach-toggle', enabled: 'yes' });
    assert.equal(off.data.enabled, false, 'anything but true switches it off');
  } finally {
    stub.server.close();
  }
});

/* ------------------------------------------------------------------ */
/* 6. Outreach runner against a fake tab, with a virtual clock         */
/* ------------------------------------------------------------------ */

// A fake of everything the runner touches: chrome.storage, chrome.tabs, the
// app, and a tab whose "page" applies the content commands to a plain buffer.
// Time is virtual: sleeping only moves the clock.
function makeWorld(opts) {
  opts = opts || {};
  const W = {
    clock: 1000000,
    store: Object.assign({}, opts.store),
    session: Object.assign({}, opts.session),
    queue: [],
    results: [],
    nextCalls: [],
    resultFails: 0,
    retryInSec: 60,
    page: { path: '/', view: 'none', buf: [], sent: [], steps: 0, cleared: 0, clicks: 0, notice: null },
    tabs: { created: [], navigated: [], exists: !!(opts.session && opts.session.outreachTabId) },
    hooks: {},
    flags: Object.assign({ block: null, noButton: false, notFound: false, composerNever: false, swallow: null, sendWorks: true, echo: true }, opts.flags)
  };
  const area = (obj) => ({
    get: async (key) => {
      const out = {};
      for (const k of Array.isArray(key) ? key : [key]) if (k in obj) out[k] = JSON.parse(JSON.stringify(obj[k]));
      return out;
    },
    set: async (o) => {
      for (const k of Object.keys(o)) obj[k] = JSON.parse(JSON.stringify(o[k]));
    },
    remove: async (k) => void delete obj[k]
  });
  const navigate = (url) => {
    W.tabs.navigated.push(url);
    W.page = { path: new URL(url).pathname, view: 'profile', buf: [], sent: W.page.sent, steps: 0, cleared: 0, clicks: 0, notice: null };
  };
  const text = () => W.page.buf.join('');
  const command = (msg) => {
    const p = W.page;
    const f = W.flags;
    if (W.hooks[msg.cmd]) W.hooks[msg.cmd](msg);
    switch (msg.cmd) {
      case 'probe':
        return {
          ok: true, url: 'https://www.instagram.com' + p.path, path: p.path,
          block: typeof f.block === 'function' ? f.block(W) : f.block,
          notFound: f.notFound ? "sorry, this page isn't available" : null,
          profile: p.view === 'profile', messageButtons: p.view === 'profile' && !f.noButton ? 1 : 0,
          composer: p.view === 'thread' && !f.composerNever, composerText: text(), sendButton: true, threadHandle: '', account: 'owner.acct'
        };
      case 'click-message':
        p.clicks++;
        p.view = 'thread';
        p.path = '/direct/t/1/';
        return { ok: true };
      case 'focus-composer':
        return { ok: true, text: text() };
      case 'step':
        p.steps++;
        if (msg.op === 'back') p.buf.pop();
        else if (msg.ch !== f.swallow) p.buf.push(msg.ch);
        return { ok: true, method: 'execCommand' };
      case 'read-composer':
        return { ok: true, found: true, text: text() };
      case 'clear-composer':
        p.cleared++;
        p.buf = [];
        return { ok: true, found: true, text: '' };
      case 'send':
        if (text() !== msg.expect) return { ok: false, code: 'MISMATCH', error: 'Refusing to send.' };
        if (f.sendWorks) {
          p.sent.push(text());
          p.buf = [];
        }
        return { ok: true, method: msg.method === 'enter' ? 'enter' : 'button' };
      case 'last-bubbles':
        return { ok: true, listFound: f.echo, texts: f.echo ? p.sent.slice(-3) : [], composerFound: true, composerText: text() };
      case 'notice':
        p.notice = msg.text || null;
        return { ok: true };
      default:
        return { ok: false, error: 'unknown ' + msg.cmd };
    }
  };
  W.chrome = {
    storage: { local: area(W.store), session: area(W.session) },
    tabs: {
      get: async (id) => {
        if (!W.tabs.exists || id !== 42) throw new Error('No tab with id ' + id);
        return { id: 42, status: 'complete', pinned: true };
      },
      create: async (o) => {
        W.tabs.created.push(o);
        W.tabs.exists = true;
        navigate(o.url);
        return { id: 42 };
      },
      update: async (id, o) => {
        assert.equal(id, 42, 'only the outreach tab is ever navigated');
        navigate(o.url);
        return { id };
      },
      sendMessage: async (id, msg) => {
        assert.equal(id, 42, 'only the outreach tab is ever messaged');
        assert.equal(msg.type, 'aidm:outreach');
        if (!W.tabs.exists) throw new Error('Receiving end does not exist');
        return command(msg);
      }
    },
    scripting: { executeScript: async (o) => void assert.deepEqual(o.target, { tabId: 42 }) },
    alarms: { get: async () => null, create: async () => {} },
    runtime: { getPlatformInfo: (cb) => cb({}) },
    action: { setBadgeText: async (o) => void (W.badge = o.text) }
  };
  W.api = async (call, arg) => {
    if (call === 'outreachNext') {
      W.nextCalls.push({ at: W.clock, account: arg.account });
      const task = W.queue.shift();
      return task ? { task } : { task: null, reason: 'nothing due', retryInSec: W.retryInSec };
    }
    if (call === 'outreachResult') {
      if (W.resultFails > 0) {
        W.resultFails--;
        throw new Error('Cannot reach the app');
      }
      W.results.push(JSON.parse(JSON.stringify(arg)));
      return { ok: true, paused: false, pauseReason: null };
    }
    if (call === 'outreachStatus') return { enabled: true, mode: 'auto', paused: false };
    throw new Error('unexpected ' + call);
  };
  W.runner = Outreach.createRunner({
    chrome: W.chrome,
    api: W.api,
    Typing,
    rng: seeded(opts.seed || 5),
    now: () => W.clock,
    sleep: async (ms) => void (W.clock += ms)
  });
  W.task = (over) =>
    Object.assign(
      {
        id: 'task_' + (W.results.length + W.queue.length + 1), handle: 'lead.one', profileUrl: 'https://www.instagram.com/lead.one/', text: PLAIN, mode: 'auto', readMs: 4000,
        typing: { wpmMin: 45, wpmMax: 65, typoRate: 0.05, rewriteRate: 0.3, pauseRate: 0.05 }, detect: { phrases: ['try again later'], urlParts: ['/challenge/'] }
      },
      over
    );
  W.enable = async () => {
    W.store.outreach = { enabled: true, account: '', note: '' };
  };
  W.last = () => W.results[W.results.length - 1];
  return W;
}

test('outreach runner: off by default, one task end to end in auto mode, exact result payload', async () => {
  const W = makeWorld();
  W.queue.push(W.task());
  assert.equal(await W.runner.tick(), 'done');
  assert.equal(W.nextCalls.length, 0, 'off by default');
  assert.equal(W.tabs.created.length, 0);

  await W.enable();
  const t0 = W.clock;
  assert.equal(await W.runner.tick(), 'done');
  assert.equal(W.results.length, 1);
  const r = W.last();
  assert.deepEqual(Object.keys(r).sort(), ['detail', 'id', 'keystrokes', 'status', 'typedMs', 'typos']);
  assert.equal(r.status, 'sent');
  assert.match(r.detail, /read back from the thread/);
  assert.deepEqual(W.page.sent, [PLAIN]);
  assert.equal(W.page.clicks, 1);
  assert.equal(r.keystrokes, W.page.steps);
  assert.ok(r.keystrokes >= PLAIN.length);
  const nominal = (PLAIN.length * 12000) / 55;
  assert.ok(r.typedMs > nominal * 0.6 && r.typedMs < nominal * 2.6, 'typing took ' + r.typedMs + ' ms on the clock');
  assert.ok(W.clock - t0 > r.typedMs + 4000, 'readMs and the page waits are on top of the typing time');
  assert.deepEqual(W.tabs.created, [{ url: 'https://www.instagram.com/lead.one/', active: false, pinned: true }]);
  assert.equal(W.store.outreachTask, undefined, 'the task was removed once reported');
  assert.equal(W.store.outreach.account, 'owner.acct', 'the logged in handle was stored');
  assert.equal(W.store.outreachLog[0].status, 'sent');
  assert.equal(W.session.outreachTabId, 42);

  // the next task reuses the same tab and sends the handle that was read
  W.queue.push(W.task({ handle: 'lead.two', profileUrl: 'https://www.instagram.com/lead.two/', mode: 'assisted' }));
  await W.runner.tick();
  assert.equal(W.tabs.created.length, 1, 'the tab is reused');
  assert.deepEqual(W.tabs.navigated, ['https://www.instagram.com/lead.one/', 'https://www.instagram.com/lead.two/']);
  assert.equal(W.nextCalls[1].account, 'owner.acct');
  assert.equal(W.last().status, 'typed');
  assert.equal(W.page.buf.join(''), PLAIN, 'assisted: the text stays in the box');
  assert.equal(W.page.sent.length, 1, 'assisted: nothing more was sent');
  assert.match(W.page.notice, /will not send it in assisted mode/);
  assert.equal(W.badge, 'SEND');
  // a mode the extension does not know is treated as assisted, never as auto
  const W2 = makeWorld();
  await W2.enable();
  W2.queue.push(W2.task({ mode: 'turbo' }));
  await W2.runner.tick();
  assert.equal(W2.last().status, 'typed');
  assert.deepEqual(W2.page.sent, []);
});

test('outreach runner: never two tasks at once, retryInSec respected, app errors back off', async () => {
  const W = makeWorld();
  await W.enable();
  W.queue.push(W.task(), W.task({ id: 'second' }));
  let overlapping = null;
  W.hooks.step = () => {
    if (overlapping === null) overlapping = W.runner.tick(); // an alarm fires in the middle of typing
  };
  await W.runner.tick();
  assert.equal(await overlapping, 'busy');
  assert.equal(W.nextCalls.length, 1, 'the second tick asked for nothing');
  assert.equal(W.results.length, 1);
  assert.equal(W.queue.length, 1);

  W.hooks = {};
  W.queue.length = 0;
  W.retryInSec = 300;
  await W.runner.tick();
  assert.equal(W.nextCalls.length, 2);
  assert.equal(W.store.outreachPoll.reason, 'nothing due');
  for (let i = 0; i < 4; i++) {
    W.clock += 60000;
    await W.runner.tick();
  }
  assert.equal(W.nextCalls.length, 2, 'four minute ticks inside a 300 second retry ask nothing');
  W.clock += 61000;
  await W.runner.tick();
  assert.equal(W.nextCalls.length, 3, 'asked again once retryInSec had passed');

  const realApi = W.api;
  const E = makeWorld();
  await E.enable();
  let calls = 0;
  const failing = Outreach.createRunner({ chrome: E.chrome, api: async () => { calls++; throw new Error('app is down'); }, Typing, now: () => E.clock, sleep: async (ms) => void (E.clock += ms) });
  await failing.tick();
  await failing.tick();
  assert.equal(calls, 1, 'a failed call backs off for a minute');
  assert.match(E.store.outreachPoll.reason, /app is down/);
  assert.ok(realApi);
});

test('outreach runner: block signals stop at once, report blocked and switch outreach off', async () => {
  for (const [when, flag, steps] of [
    ['on the profile page', () => 'dialog shows "try again later"', 0],
    ['while typing', (W) => (W.page.steps >= 40 ? 'page shows "try again later"' : null), 40],
    ['after clicking Message', (W) => (W.page.view === 'thread' ? 'URL contains /challenge/' : null), 0]
  ]) {
    const W = makeWorld({ flags: { block: flag } });
    await W.enable();
    W.queue.push(W.task());
    await W.runner.tick();
    assert.equal(W.last().status, 'blocked', when);
    assert.ok(W.last().detail.includes(when), W.last().detail);
    assert.equal(W.page.steps, steps, 'typing stopped at the first check');
    assert.equal(W.page.cleared, 0, 'a blocked page is left exactly as it is');
    assert.deepEqual(W.page.sent, []);
    assert.equal(W.store.outreach.enabled, false);
    assert.match(W.store.outreach.note, /block signal/);
    W.queue.push(W.task());
    await W.runner.tick();
    assert.equal(W.nextCalls.length, 1, 'nothing more is fetched');
  }
  // a block that appears only after send was pressed is still reported as blocked
  const W = makeWorld({ flags: { block: (w) => (w.page.sent.length ? 'dialog shows "try again later"' : null) } });
  await W.enable();
  W.queue.push(W.task());
  await W.runner.tick();
  assert.equal(W.last().status, 'blocked');
  assert.match(W.last().detail, /after pressing send.*does appear in the thread/);
});

test('outreach runner: statuses for missing button, missing profile, draft, wrong text and dead send', async () => {
  const run = async (flags, over, before) => {
    const W = makeWorld({ flags, store: before });
    await W.enable();
    W.queue.push(W.task(over));
    await W.runner.tick();
    return W;
  };
  let W = await run({ noButton: true });
  assert.equal(W.last().status, 'error');
  assert.match(W.last().detail, /Selector miss: instagramOutreach\.messageButton/);
  assert.match(W.last().detail, /never matched on the live site/);
  W = await run({ noButton: true }, {}, { outreachProven: { messageButton: true } });
  assert.equal(W.last().status, 'unreachable');
  W = await run({ notFound: true });
  assert.equal(W.last().status, 'not_found');
  W = await run({ composerNever: true });
  assert.equal(W.last().status, 'error');
  assert.match(W.last().detail, /Selector miss: instagramOutreach\.composer/);
  assert.equal(W.page.steps, 0);

  W = makeWorld();
  await W.enable();
  W.queue.push(W.task());
  let drafted = false;
  W.hooks.probe = () => {
    // the thread opens with a draft a person left there
    if (W.page.view === 'thread' && !drafted) {
      drafted = true;
      W.page.buf = Array.from('a draft');
    }
  };
  await W.runner.tick();
  assert.equal(W.last().status, 'skipped');
  assert.equal(W.page.buf.join(''), 'a draft', 'a draft is never typed over, cleared or sent');
  assert.equal(W.page.steps, 0);

  W = await run({ swallow: 'e' });
  assert.equal(W.last().status, 'error');
  assert.match(W.last().detail, /did not match the target after typing \(\d+ characters, expected 120, first difference at character 2\)/);
  assert.equal(W.page.cleared, 1);
  assert.deepEqual(W.page.sent, []);

  W = await run({ sendWorks: false });
  assert.equal(W.last().status, 'error');
  assert.match(W.last().detail, /Send was pressed \(button, then Enter\) but the text stayed/);
  assert.ok(W.page.cleared >= 1);

  W = await run({ echo: false });
  assert.equal(W.last().status, 'sent');
  assert.match(W.last().detail, /unconfirmed: the composer emptied/);

  for (const bad of [
    { profileUrl: 'https://evil.example/lead.one/' },
    { profileUrl: 'https://www.instagram.com/direct/inbox/' },
    { profileUrl: 'https://www.instagram.com/someone.else/' },
    { profileUrl: 'http://www.instagram.com/lead.one/' },
    { text: '   ' },
    { text: 'x'.repeat(2001) },
    { handle: '' }
  ]) {
    W = await run({}, bad);
    assert.equal(W.last().status, 'error', JSON.stringify(bad));
    assert.match(W.last().detail, /Malformed task/);
    assert.equal(W.tabs.navigated.length, 0, 'nothing was opened for ' + JSON.stringify(bad));
  }
  assert.equal(Outreach.profileUrlFor({ handle: '@Lead.One', profileUrl: '' }), 'https://www.instagram.com/Lead.One/');
  assert.equal(Outreach.profileUrlFor({ handle: 'lead.one', profileUrl: 'https://www.instagram.com/lead.one?hl=en' }), 'https://www.instagram.com/lead.one/');
});

test('outreach runner: hard timeout, switch off mid task, closed tab, three failures in a row', async () => {
  // every key takes five seconds to be acknowledged: the task cannot finish in six minutes
  let W = makeWorld();
  await W.enable();
  W.queue.push(W.task());
  W.hooks.step = () => (W.clock += 5000);
  const t0 = W.clock;
  await W.runner.tick();
  assert.equal(W.last().status, 'error');
  assert.match(W.last().detail, /Timed out: the task ran past its 6 minute limit during stage "typing"/);
  assert.ok(W.clock - t0 >= Outreach.TASK_TIMEOUT_MS && W.clock - t0 < Outreach.TASK_TIMEOUT_MS + 30000, 'stopped at ' + (W.clock - t0) + ' ms');
  assert.equal(W.page.cleared, 1, 'the half typed text was removed');
  assert.deepEqual(W.page.sent, []);

  // a long message that would not fit is typed faster instead of timing out
  W = makeWorld();
  await W.enable();
  W.queue.push(W.task({ text: ('This is a long message with many words in it. '.repeat(40)).trim(), typing: { wpmMin: 20, wpmMax: 20, typoRate: 0.02, rewriteRate: 0, pauseRate: 0.05 } }));
  await W.runner.tick();
  assert.equal(W.last().status, 'sent');
  assert.ok(W.last().typedMs < Outreach.TASK_TIMEOUT_MS);

  W = makeWorld();
  await W.enable();
  W.queue.push(W.task());
  let switched = null;
  W.hooks.step = () => {
    if (W.page.steps === 20 && !switched) switched = W.runner.setEnabled(false);
  };
  await W.runner.tick();
  await switched;
  assert.equal(W.last().status, 'skipped');
  assert.match(W.last().detail, /switched off during stage "typing"/);
  assert.equal(W.page.cleared, 1);
  assert.deepEqual(W.page.sent, []);
  assert.equal(W.store.outreach.enabled, false);

  W = makeWorld();
  await W.enable();
  W.queue.push(W.task());
  let closed = null;
  W.hooks.step = () => {
    if (W.page.steps === 10 && !closed) closed = W.runner.onTabRemoved(42);
  };
  await W.runner.tick();
  await closed;
  assert.equal(W.last().status, 'error');
  assert.match(W.last().detail, /outreach tab was closed during stage "typing"/);
  assert.equal(W.session.outreachTabId, undefined);

  W = makeWorld({ flags: { composerNever: true } });
  await W.enable();
  for (let i = 0; i < 3; i++) {
    W.queue.push(W.task({ id: 'f' + i }));
    await W.runner.tick();
    assert.equal(W.store.outreach.enabled, i < 2, 'after failure ' + (i + 1));
  }
  assert.match(W.store.outreach.note, /3 failed tasks in a row/);
});

test('outreach runner: a restarted service worker fails the stored task cleanly and still reports it', async () => {
  const stored = (over) =>
    Object.assign({ id: 'old', handle: 'lead.one', mode: 'auto', url: 'https://www.instagram.com/lead.one/', text: PLAIN, stage: 'typing', startedAt: 1, deadline: 2, tabId: 42, typedMs: 9000, keystrokes: 50, typos: 2, sendPressed: false, result: null }, over);

  // mid typing: the half typed text is cleared and an error is reported, before any new task
  let W = makeWorld({ store: { outreach: { enabled: true }, outreachTask: stored() }, session: { outreachTabId: 42 } });
  W.page.view = 'thread';
  W.page.buf = Array.from(PLAIN.slice(0, 50));
  W.queue.push(W.task());
  await W.runner.tick();
  assert.equal(W.results.length, 1);
  assert.equal(W.last().id, 'old');
  assert.equal(W.last().status, 'error');
  assert.match(W.last().detail, /service worker restarted during stage "typing"/);
  assert.deepEqual([W.last().typedMs, W.last().keystrokes, W.last().typos], [9000, 50, 2]);
  assert.equal(W.page.buf.length, 0);
  assert.equal(W.nextCalls.length, 0, 'recovery and a new task never share a tick');
  assert.equal(W.store.outreachTask, undefined);
  await W.runner.tick();
  assert.equal(W.nextCalls.length, 1);

  // after send was pressed: the page decides what is reported
  W = makeWorld({ store: { outreach: { enabled: true }, outreachTask: stored({ stage: 'confirm', sendPressed: true }) }, session: { outreachTabId: 42 } });
  W.page.view = 'thread';
  W.page.sent = [PLAIN];
  await W.runner.tick();
  assert.equal(W.last().status, 'sent');
  assert.match(W.last().detail, /restarted after send was pressed. The message appears in the thread/);

  W = makeWorld({ store: { outreach: { enabled: true }, outreachTask: stored({ stage: 'sending', sendPressed: true }) } });
  await W.runner.tick();
  assert.equal(W.last().status, 'error');
  assert.match(W.last().detail, /MAY have been sent/);

  // a result that could not be posted is kept and posted again, and blocks new tasks until then
  W = makeWorld();
  await W.enable();
  W.queue.push(W.task({ id: 'keep' }), W.task({ id: 'later' }));
  W.resultFails = 2;
  await W.runner.tick();
  assert.equal(W.results.length, 0);
  assert.equal(W.store.outreachTask.stage, 'report');
  assert.equal(W.store.outreachTask.result.status, 'sent');
  await W.runner.tick();
  assert.equal(W.results.length, 0);
  assert.equal(W.nextCalls.length, 1, 'no new task while a result is unreported');
  await W.runner.tick();
  assert.deepEqual(W.results.map((r) => r.id), ['keep']);
  assert.deepEqual(W.page.sent, [PLAIN], 'the message itself was sent once');
  await W.runner.tick();
  assert.deepEqual(W.results.map((r) => r.id), ['keep', 'later']);
});

test('outreach runner: assisted mode holds the tab until the person has sent or removed the text', async () => {
  const W = makeWorld();
  await W.enable();
  W.queue.push(W.task({ mode: 'assisted' }), W.task({ id: 'next', handle: 'lead.two', profileUrl: 'https://www.instagram.com/lead.two/' }));
  await W.runner.tick();
  assert.equal(W.last().status, 'typed');
  assert.equal(W.store.outreachHold.handle, 'lead.one');
  for (let i = 0; i < 3; i++) {
    W.clock += 60000;
    await W.runner.tick();
  }
  assert.equal(W.nextCalls.length, 1, 'held: no new task');
  assert.equal(W.page.path, '/direct/t/1/', 'held: the tab stays on the thread');
  W.page.sent.push(W.page.buf.join(''));
  W.page.buf = []; // the person pressed send
  await W.runner.tick();
  assert.equal(W.store.outreachHold, undefined);
  assert.equal(W.badge, '');
  assert.equal(W.last().id, 'next');
  assert.equal(W.last().status, 'sent');
  const st = await W.runner.status();
  assert.equal(st.enabled, true);
  assert.equal(st.server.mode, 'auto');
  assert.deepEqual(st.log.map((l) => l.status), ['sent', 'typed']);
});

/* ------------------------------------------------------------------ */

(async () => {
  let failed = 0;
  for (const t of results) {
    try {
      await t.fn();
      console.log('PASS  ' + t.name);
    } catch (err) {
      failed++;
      console.log('FAIL  ' + t.name + '\n      ' + String(err && err.stack ? err.stack : err).split('\n').join('\n      '));
    }
  }
  console.log('\n' + (results.length - failed) + ' passed, ' + failed + ' failed, ' + results.length + ' total');
  process.exit(failed ? 1 : 0);
})();
