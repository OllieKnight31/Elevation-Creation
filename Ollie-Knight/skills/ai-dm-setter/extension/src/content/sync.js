/*
 * Live inbox sync. Keeps the app's inbox in step with what Instagram shows,
 * both ways: messages you send from Instagram on any device, and messages
 * people send you.
 *
 * It reads the rendered page only, like everything else in this helper:
 * - the open chat, while it is scrolled to its newest message;
 * - the latest message each entry in the chat list shows.
 * It never opens a chat, so nobody is shown "Seen", and it calls no Instagram
 * address. Instagram updates its own page as messages arrive; this notices the
 * change within about two seconds and passes it to the app.
 *
 * Only one Instagram tab does this at a time, preferring the one in front.
 */
(function () {
  'use strict';
  var AIDM = window.AIDM;
  if (!AIDM || !AIDM.capture || window.top !== window) return;
  var SITE = 'instagram';
  var TICK_MS = 1500;
  var MAX_ROWS = 30;

  var state = {
    busy: false,
    leader: false,
    leaderAt: 0,
    configured: null,
    settingsAt: 0,
    openSig: '',
    rows: {}, // chat name -> last preview sent to the app
    failures: 0,
    pauseUntil: 0
  };

  function report(patch) {
    AIDM.bg({ type: 'aidm:sync-status', status: Object.assign({ at: Date.now() }, patch) }).catch(function () {});
  }

  function loadSettings() {
    if (Date.now() - state.settingsAt < 60000) return Promise.resolve(state.configured);
    return AIDM.bg({ type: 'aidm:settings' }).then(
      function (s) {
        state.settingsAt = Date.now();
        state.configured = !!(s && s.configured);
        return state.configured;
      },
      function () {
        state.settingsAt = Date.now();
        state.configured = false;
        return false;
      }
    );
  }

  function claim() {
    if (Date.now() - state.leaderAt < 5000) return Promise.resolve(state.leader);
    return AIDM.bg({ type: 'aidm:sync-claim', visible: !document.hidden }).then(
      function (r) {
        state.leaderAt = Date.now();
        state.leader = !!(r && r.leader);
        return state.leader;
      },
      function () {
        state.leaderAt = Date.now();
        state.leader = false;
        return false;
      }
    );
  }

  // The open chat, when it has changed since it was last sent.
  function openChat() {
    if (AIDM.dom.site() !== SITE || !AIDM.dom.find(SITE, 'messageList')) return null;
    if (!AIDM.capture.atNewest(SITE)) return null;
    var info, snap;
    try {
      info = AIDM.capture.threadInfo(SITE);
      snap = AIDM.capture.extractSnapshot(SITE, AIDM.dom.find(SITE, 'messageList'));
    } catch (e) {
      return null;
    }
    var messages = snap.messages.slice(-40).map(function (m) {
      return { direction: m.direction, text: m.text };
    });
    if (!messages.length) return null;
    var sig = info.thread.externalId + '|' + messages.map(function (m) { return m.direction + m.text; }).join('\n');
    if (sig === state.openSig) return null;
    return {
      sig: sig,
      body: {
        kind: 'thread',
        thread: { externalId: info.thread.externalId, name: info.thread.name, handle: info.thread.handle, avatar: info.thread.avatar },
        messages: messages
      }
    };
  }

  // Chat list entries whose latest message changed since they were last sent.
  function listChanges() {
    var out = [];
    var rows;
    try {
      rows = AIDM.capture.threadRows(SITE).slice(0, MAX_ROWS);
    } catch (e) {
      return out;
    }
    rows.forEach(function (row) {
      var p;
      try {
        p = AIDM.capture.rowPreview(SITE, row);
      } catch (e) {
        p = null;
      }
      if (!p) return;
      var key = p.direction + '|' + p.text + '|' + (p.avatar || '');
      if (state.rows[p.name] === key) return;
      // Only a text preview from the last day is a message to copy in. Anything else still brings the picture.
      var copy = p.text && !(p.ageSec !== null && p.ageSec > 86400);
      if (!copy && !p.avatar) {
        state.rows[p.name] = key;
        return;
      }
      var thread = { name: p.name };
      if (p.avatar) thread.avatar = p.avatar;
      out.push({ name: p.name, key: key, body: { kind: 'preview', thread: thread, messages: copy ? [{ direction: p.direction, text: p.text, ageSec: p.ageSec }] : [] } });
    });
    return out;
  }

  function tick() {
    if (state.busy || Date.now() < state.pauseUntil) return;
    var open = openChat();
    var rows = listChanges();
    if (!open && !rows.length) return;
    state.busy = true;
    loadSettings()
      .then(function (ok) {
        return ok ? claim() : false;
      })
      .then(function (leader) {
        if (!leader) return null;
        var threads = (open ? [open.body] : []).concat(rows.map(function (r) { return r.body; }));
        return AIDM.api('live', { threads: threads }).then(function (res) {
          if (open) state.openSig = open.sig;
          rows.forEach(function (r) {
            state.rows[r.name] = r.key;
          });
          state.failures = 0;
          report({ ok: true, added: res.added || 0, matched: res.matched || 0, error: '' });
        });
      })
      .catch(function (err) {
        state.failures++;
        state.pauseUntil = Date.now() + Math.min(5 * 60000, 5000 * Math.pow(2, state.failures));
        report({ ok: false, error: err && err.message ? err.message : String(err) });
      })
      .then(function () {
        state.busy = false;
      });
  }

  setInterval(tick, TICK_MS);

  AIDM.sync = { tick: tick, state: state, openChat: openChat, listChanges: listChanges };
})();
