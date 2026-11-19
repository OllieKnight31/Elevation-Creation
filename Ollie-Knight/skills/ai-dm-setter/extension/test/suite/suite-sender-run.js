/*
 * suite-sender-run.js (test only, loaded by suite-sender.html)
 * Drives the real Business Suite sender (src/suite/suite-content.js) and its
 * real runner (src/suite/suite-runner.js) against the stand in inbox in
 * suite-sender.html. Chrome runs it with virtual time. It proves the code
 * paths against a GUESSED page. It verifies no selector against the real
 * Meta Business Suite.
 */
(async function () {
  'use strict';
  var T = window.__T;
  var F = window.__F;
  var Typing = window.AIDMTyping;
  var Suite = window.AIDMSuite;
  var R = { errors: [] };

  function seeded(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function cmd(name, arg) {
    return new Promise(function (resolve) {
      T.listeners[0](Object.assign({ type: 'aidm:suite', cmd: name }, arg || {}), { id: 'fixture-ext' }, resolve);
    });
  }
  function boxText() {
    var el = document.getElementById(F.textarea ? 'composerArea' : 'composer');
    return Typing.canonical(F.textarea ? el.value : el.innerText);
  }

  var TEXT = 'Hey Jane, just checking in on this. Still keen to go through the details together?';
  var RICH = 'Hi Jane 👋 here it is: https://example.com/a?b=c\nSecond line, tag @jane.doe ok.';
  var DETECT = { phrases: ['try again later', 'we restrict certain activity'], urlParts: ['/challenge/'] };
  var KNOWN = [{ text: 'Sounds good, send me the details when you can', partial: false }, { text: 'Want me to send the link?', partial: false }];

  try {
    /* ---------- A. the content commands on their own ---------- */
    F.reset({});
    F.navigate(Suite.INBOX_URL);
    R.probe = await cmd('probe', { detect: DETECT });
    R.rows = await cmd('rows', { detect: DETECT });
    R.threadAtLoad = await cmd('thread', { detect: DETECT });
    R.searched = await cmd('search', { term: 'jane.doe' });
    await T.sleep(900);
    R.rowsAfterSearch = await cmd('rows', { detect: DETECT });
    R.openMoved = await cmd('open-row', { index: 0, title: 'Bob Stone' });
    R.openedAfterMoved = F.opened.length;
    R.openOk = await cmd('open-row', { index: 0, title: 'Jane Doe' });
    await T.sleep(900);
    R.thread = await cmd('thread', { detect: DETECT });
    // send refuses anything but the exact expected text; the shared click helper refuses the send control
    await cmd('focus-composer');
    for (var c = 0; c < 5; c++) await cmd('step', { op: 'type', ch: 'hello'[c] });
    R.sendMismatch = await cmd('send', { expect: 'hello there' });
    R.sendNoExpect = await cmd('send', {});
    R.sentAfterRefusals = F.sent.length;
    R.clicksAfterRefusals = F.sendClicks;
    R.cleared = await cmd('clear-composer');
    try {
      window.AIDM.dom.safeClick('businessSuite', document.getElementById('send'), 'send button');
      R.sendGuard = 'CLICKED';
    } catch (e) {
      R.sendGuard = e.name;
    }
    R.clicksAfterGuard = F.sendClicks;
    // two send controls on the page: neither is pressed
    var twin = document.createElement('div');
    twin.setAttribute('role', 'button');
    twin.setAttribute('aria-label', 'Send');
    twin.textContent = 'Send';
    document.body.appendChild(twin);
    await cmd('focus-composer');
    await cmd('step', { op: 'type', ch: 'x' });
    R.sendAmbiguous = await cmd('send', { expect: 'x' });
    twin.remove();
    R.clicksAfterAmbiguous = F.sendClicks;
    await cmd('clear-composer');
    R.searchEmpty = await cmd('search', { term: 'nobody.at.all' });
    await T.sleep(900);
    R.rowsEmpty = await cmd('rows', { detect: DETECT });
    R.unknownCmd = await cmd('explode');
    // on any site but Business Suite every command is refused
    window.AIDM.siteOverride = 'instagram';
    R.wrongSite = await cmd('probe', { detect: DETECT });
    R.wrongSiteSend = await cmd('send', { expect: 'x' });
    window.AIDM.siteOverride = 'businessSuite';

    /* ---------- B. the real runner driving the real content commands ---------- */
    var TAB = 9;
    var store = {};
    var sess = {};
    function area(obj) {
      return {
        get: async function (key) {
          var out = {};
          (Array.isArray(key) ? key : [key]).forEach(function (k) {
            if (k in obj) out[k] = JSON.parse(JSON.stringify(obj[k]));
          });
          return out;
        },
        set: async function (o) {
          Object.keys(o).forEach(function (k) {
            obj[k] = JSON.parse(JSON.stringify(o[k]));
          });
        },
        remove: async function (k) {
          delete obj[k];
        }
      };
    }
    var tabLog = { created: [], updated: [], urls: [], messaged: {} };
    var tabExists = false;
    var RC = {
      storage: { local: area(store), session: area(sess) },
      tabs: {
        get: async function (id) {
          if (!tabExists || id !== TAB) throw new Error('No tab with id ' + id);
          return { id: TAB, status: 'complete', pinned: true };
        },
        create: async function (o) {
          tabLog.created.push(o);
          tabLog.urls.push(o.url);
          tabExists = true;
          F.navigate(o.url);
          return { id: TAB };
        },
        update: async function (id, o) {
          tabLog.updated.push(id);
          tabLog.urls.push(o.url);
          F.navigate(o.url);
          return { id: id };
        },
        sendMessage: function (id, msg) {
          tabLog.messaged[id] = (tabLog.messaged[id] || 0) + 1;
          return new Promise(function (resolve) {
            T.listeners[0](msg, { id: 'fixture-ext' }, resolve);
          });
        }
      },
      scripting: { executeScript: async function () {} },
      runtime: { getPlatformInfo: function (cb) { cb({}); } }
    };
    var app = { queue: [], results: [], asked: [] };
    function api(call, arg) {
      if (call === 'outreachNext') {
        app.asked.push(JSON.parse(JSON.stringify(arg)));
        var task = app.queue.shift();
        return Promise.resolve(task ? { task: task } : { task: null, reason: 'queue empty', retryInSec: 0 });
      }
      if (call === 'outreachResult') {
        app.results.push(JSON.parse(JSON.stringify(arg)));
        return Promise.resolve({ ok: true, paused: false, pauseReason: null });
      }
      return Promise.reject(new Error('unexpected call ' + call));
    }
    var runner = Suite.createRunner({ chrome: RC, api: api, Typing: Typing, rng: seeded(41) });

    var n = 0;
    function task(over) {
      n++;
      return Object.assign(
        {
          id: 'suite_' + n, channel: 'suite', handle: 'jane.doe', name: 'Jane Doe', text: TEXT, mode: 'auto', readMs: 1200,
          expect: { last: KNOWN }, typing: { wpmMin: 70, wpmMax: 90, typoRate: 0.06, rewriteRate: 0.5, pauseRate: 0.05 }, detect: DETECT
        },
        over || {}
      );
    }
    async function scenario(opts, tk, list) {
      F.reset(opts, list);
      app.results = [];
      app.queue = [tk];
      await runner.setEnabled(true);
      store.suitePoll = { nextAt: 0, reason: '' };
      await runner.tick();
      return {
        result: app.results.length ? app.results[app.results.length - 1] : null,
        results: app.results.length,
        sent: F.sent.slice(),
        sendClicks: F.sendClicks,
        opened: F.opened.slice(),
        searches: F.searches.slice(),
        composer: boxText(),
        stored: !!store.suiteTask,
        target: Typing.canonical(tk.text),
        noResultsShown: !document.getElementById('empty').hidden
      };
    }
    var jane = function (over) {
      return Object.assign({ name: 'Jane Doe', handle: 'jane.doe', platform: 'Instagram', texts: ['hi, how much is the programme', 'Want me to send the link?', 'Sounds good, send me the details when you can'], hidden: true }, over);
    };
    var bob = { name: 'Bob Stone', handle: 'bob.stone', platform: 'Instagram', texts: ['hello there', 'see you at four'] };

    // 0. off until the app setting is on
    app.queue = [task()];
    await runner.tick();
    R.askedWhileOff = app.asked.length;
    app.queue = [];

    // 1. the right chat: found by searching the username, matched, typed, sent, read back
    R.right = await scenario({}, task());
    // 2. the same with a plain text area for a reply box, emoji, a link, a username and a line break
    R.rightArea = await scenario({ textarea: true }, task({ text: RICH }));
    // 3. a chat with the same name that is somebody else: refused, nothing typed
    R.wrong = await scenario({}, task({ handle: '' }), [bob, { name: 'Jane Doe', handle: '', platform: 'Instagram', texts: ['where is my refund', 'I asked twice already'] }]);
    // 4. the entry opens another person's chat
    R.wrongOpens = await scenario({ opensInstead: 'Bob Stone' }, task());
    // 5. the search finds nobody
    R.none = await scenario({}, task(), [bob]);
    // 6. a warning appears while typing
    R.warned = await scenario({ blockAt: 12 }, task());
    // 7. signed out: a login form instead of the inbox
    R.login = await scenario({ loginForm: true }, task());
    // 8. Meta will not take a reply in this chat
    R.closed = await scenario({}, task(), [bob, jane({ closed: true })]);
    // 9. the lead writes while the helper is typing
    R.leadWrote = await scenario({ leadWritesAt: 20 }, task());
    // 10. a Messenger chat under the same name
    R.messenger = await scenario({}, task({ handle: '' }), [bob, { name: 'Jane Doe', handle: '', platform: 'Messenger', texts: ['Sounds good, send me the details when you can'] }]);
    // 11. send does nothing
    R.sendDead = await scenario({ sendDead: true }, task());

    R.tabLog = { created: tabLog.created, urls: Array.from(new Set(tabLog.urls)), updatedIds: Array.from(new Set(tabLog.updated)), messagedIds: Object.keys(tabLog.messaged) };
    R.asked = Array.from(new Set(app.asked.map(function (a) { return JSON.stringify(a); })));
    R.log = (await runner.localStatus()).log.map(function (l) {
      return l.status;
    });
  } catch (e) {
    R.errors.push(String(e && e.stack ? e.stack : e));
  }
  T.finish(R);
})();
