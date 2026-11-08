/*
 * main.js
 * Wires the panel, capture and label sync together, watches which
 * conversation is open, and answers commands from the popup.
 *
 * Inert unless the page is instagram.com/direct/* or the Business Suite inbox.
 * One run at a time. Every run has a visible progress bar and a Stop button,
 * and is halted the moment the page shows rate-limit, checkpoint or login text.
 */
(function () {
  'use strict';
  var AIDM = (globalThis.AIDM = globalThis.AIDM || {});
  if (AIDM.main) return;

  var Core = globalThis.AIDMCore;
  var dom = AIDM.dom;
  var panel = AIDM.panel;
  var capture = AIDM.capture;
  var labels = AIDM.labels;

  var state = {
    site: null,
    settings: null,
    run: null,
    threadKey: null,
    pendingKey: null,
    info: null,
    conv: null,
    seq: 0
  };

  var NOT_CONNECTED = 'Not linked yet. Open the Setter app and go to Get connected. It links itself.';

  /* ---------------------------- settings ---------------------------- */

  function loadSettings() {
    return AIDM.bg({ type: 'aidm:settings' }).then(function (s) {
      state.settings = s;
      panel.set({ showPanel: s.showPanel, status: s.configured ? '' : NOT_CONNECTED });
      return s;
    });
  }

  /* ---------------------------- open thread ---------------------------- */

  function currentThreadKey(siteKey) {
    var header = dom.find(siteKey, 'threadHeaderName');
    return location.pathname + location.search + '|' + (header ? dom.textOf(header) : '');
  }

  function threadLooksOpen(siteKey) {
    if (siteKey === 'instagram') return /\/direct\/t\//.test(location.pathname) || !!dom.find(siteKey, 'messageList');
    return !!dom.find(siteKey, 'messageList');
  }

  function refreshThread() {
    var siteKey = dom.site();
    if (!siteKey) return;
    var seq = ++state.seq;
    var info;
    try {
      info = capture.threadInfo(siteKey);
    } catch (err) {
      state.info = null;
      state.conv = null;
      panel.set({
        thread: null,
        conv: null,
        loading: false,
        message: threadLooksOpen(siteKey) ? { kind: 'error', text: err.message } : null
      });
      return;
    }
    state.info = info;
    state.conv = null;
    panel.set({ thread: { name: info.thread.name, handle: info.thread.handle }, conv: null, loading: true, message: null });

    loadSettings()
      .then(function (s) {
        if (!s.configured) return null;
        return AIDM.api('conversation', {
          platform: info.platform,
          externalId: info.thread.externalId,
          handle: info.thread.handle,
          name: info.thread.name,
          avatar: info.thread.avatar
        });
      })
      .then(
        function (conv) {
          if (seq !== state.seq) return;
          state.conv = conv;
          panel.set({ conv: conv, loading: false });
        },
        function (err) {
          if (seq !== state.seq) return;
          panel.set({ conv: null, loading: false, message: { kind: 'error', text: err.message } });
        }
      );
  }

  /* ---------------------------- insert ---------------------------- */

  // Fills the composer and stops. There is no code path from here to a send.
  function insertText(text) {
    var siteKey = dom.site();
    if (!siteKey || state.run) return;
    var composer;
    try {
      composer = dom.need(siteKey, 'composer');
    } catch (err) {
      panel.message('error', err.message);
      return;
    }
    dom.insertIntoComposer(composer, text).then(
      function (ok) {
        if (ok) panel.message('ok', 'Inserted. Read it, edit it, and press send yourself.');
        else {
          panel.message(
            'error',
            'Could not confirm the text landed in the message box (' + siteKey + '.composer). Nothing was sent. Copy the reply by hand.'
          );
        }
      },
      function (err) {
        panel.message('error', err.message);
      }
    );
  }

  function insertAll() {
    var s = state.conv && state.conv.suggestion;
    if (!s || !s.bubbles || !s.bubbles.length) return;
    insertText(s.bubbles.join('\n'));
  }

  function newSuggestion() {
    var conv = state.conv;
    if (!conv || !conv.conversationId || state.run) return;
    var seq = state.seq;
    panel.set({ busy: true, message: { kind: 'info', text: 'Asking the app for a new suggestion...' } });
    AIDM.api('suggest', { conversationId: conv.conversationId }).then(
      function (res) {
        if (seq !== state.seq) return panel.set({ busy: false });
        var next = Object.assign({}, conv, {
          suggestion: { bubbles: res.bubbles, reason: res.reason || '' },
          stage: res.stage !== undefined ? res.stage : conv.stage,
          labels: Array.isArray(res.labels) ? res.labels : conv.labels
        });
        state.conv = next;
        panel.set({ busy: false, conv: next, message: null });
      },
      function (err) {
        panel.set({ busy: false, message: { kind: 'error', text: err.message } });
      }
    );
  }

  /* ---------------------------- runs ---------------------------- */

  function summaryText(s) {
    var head = { done: 'Finished', stopped: 'Stopped', halted: 'HALTED', error: 'Failed' }[s.outcome] || s.outcome;
    var parts = [];
    if (s.kind === 'sync-labels') {
      parts.push(s.itemsOk + ' conversation(s) labelled, ' + s.itemsFailed + ' failed, ' + s.labelsApplied + ' label(s) added');
      if (s.queueSize > s.itemsOk + s.itemsFailed) parts.push(s.queueSize - s.itemsOk - s.itemsFailed + ' left in the queue');
    } else {
      parts.push(s.threads + ' thread(s), ' + s.messagesSeen + ' message(s) read, ' + s.messagesAdded + ' new in the app');
      if (s.skippedUnread) parts.push(s.skippedUnread + ' unread thread(s) skipped');
    }
    var text = head + ': ' + parts.join(', ') + '.';
    if (s.detail) text += '\n' + s.detail;
    if (s.warnings.length) text += '\n' + s.warnings.slice(0, 6).join('\n');
    if (s.warnings.length > 6) text += '\n(' + (s.warnings.length - 6) + ' more in the popup)';
    return text;
  }

  function startRun(kind, title, work) {
    var siteKey = dom.site();
    if (!siteKey) return { ok: false, error: 'Open instagram.com/direct or the Business Suite inbox first.' };
    if (state.run) return { ok: false, error: 'A run is already in progress. Press Stop in the panel first.' };

    var stop = Core.createStopToken();
    var run = { kind: kind, stop: stop, haltMarker: null, watcher: null };
    state.run = run;

    var summary = {
      kind: kind,
      site: siteKey,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      outcome: 'running',
      detail: '',
      threads: 0,
      messagesSeen: 0,
      messagesAdded: 0,
      skippedUnread: 0,
      queueSize: 0,
      itemsOk: 0,
      itemsFailed: 0,
      labelsApplied: 0,
      warnings: []
    };

    function progress(patch) {
      var cur = panel.get().progress || { title: title };
      panel.set({ progress: Object.assign({}, cur, patch) });
    }

    var ctx = {
      site: siteKey,
      stop: stop,
      summary: summary,
      cap: Core.LIMITS.CAP_DEFAULT,
      skipUnread: true,
      progress: progress,
      // The randomised 4 to 9 second pause, with a halt check on both sides.
      pause: function () {
        return Promise.resolve()
          .then(function () {
            dom.checkHalt(siteKey);
            return Core.sleep(Core.randomPause(), stop);
          })
          .then(function () {
            dom.checkHalt(siteKey);
          });
      }
    };

    panel.set({ progress: { title: title, detail: 'Starting', value: 0 }, message: null, runNote: null });

    // Checks the page once a second during a run, so a rate-limit or login
    // screen stops the run mid-pause instead of at the next step.
    run.watcher = setInterval(function () {
      var marker = null;
      try {
        marker = dom.site() === siteKey ? dom.haltMarker(siteKey) : 'left the inbox page';
      } catch (e) {
        marker = null;
      }
      if (marker && !stop.stopped) {
        run.haltMarker = marker;
        stop.stop('halt');
      }
    }, 1000);

    loadSettings()
      .then(function (s) {
        if (!s.configured) throw new Error(NOT_CONNECTED);
        ctx.cap = Core.clampCap(s.captureCap);
        ctx.skipUnread = s.skipUnread;
        ctx.applyLabels = s.applyLabels;
        return work(ctx);
      })
      .then(
        function () {
          summary.outcome = 'done';
        },
        function (err) {
          if (run.haltMarker) {
            summary.outcome = 'halted';
            summary.detail = Core.HaltError(run.haltMarker).message;
          } else if (err && err.name === 'HaltError') {
            summary.outcome = 'halted';
            summary.detail = err.message;
          } else if (err && err.name === 'StopError') {
            summary.outcome = 'stopped';
            summary.detail = 'Stopped before finishing. Anything not yet sent for the thread in progress was discarded.';
          } else {
            summary.outcome = 'error';
            summary.detail = err && err.message ? err.message : String(err);
          }
        }
      )
      .then(function () {
        clearInterval(run.watcher);
        state.run = null;
        summary.finishedAt = new Date().toISOString();
        var kindOfNote = summary.outcome === 'done' && !summary.itemsFailed ? 'ok' : summary.outcome === 'stopped' ? 'info' : summary.outcome === 'done' ? 'info' : 'error';
        panel.set({ progress: null, runNote: { kind: kindOfNote, text: summaryText(summary) } });
        AIDM.bg({ type: 'aidm:run-update', run: summary }).catch(function () {
          /* the summary is still shown in the panel */
        });
        state.threadKey = null;
        state.pendingKey = null;
      });

    return { ok: true, started: true };
  }

  function runCaptureThread() {
    return startRun('capture-thread', 'Capturing this thread', function (ctx) {
      return capture.captureOpenThread(ctx).then(function (res) {
        ctx.summary.threads = 1;
        ctx.summary.messagesSeen = res.seen;
        ctx.summary.messagesAdded = res.added;
        res.warnings.forEach(function (w) {
          ctx.summary.warnings.push(w);
        });
      });
    });
  }

  function runCaptureRecent() {
    return startRun('capture-recent', 'Capturing recent threads', function (ctx) {
      return capture.captureRecent(ctx);
    });
  }

  function runSyncLabels() {
    return startRun('sync-labels', 'Applying labels', function (ctx) {
      if (!ctx.applyLabels) throw new Error('"Apply labels in Business Suite" is switched off in the options.');
      return labels.syncLabels(ctx);
    });
  }

  function stopRun() {
    if (!state.run) return { ok: false, error: 'Nothing is running.' };
    var p = panel.get().progress;
    if (p) panel.set({ progress: Object.assign({}, p, { stopping: true, detail: 'Stopping' }) });
    state.run.stop.stop('Stopped by user');
    return { ok: true };
  }

  /* ---------------------------- commands from the popup ---------------------------- */

  // The outreach selectors (profile page and the thread it opens) are part of
  // the same health check. This file only reads them. It never uses them.
  var OUTREACH_SITE = 'instagramOutreach';

  function onInstagram() {
    return dom.site() === 'instagram' || location.hostname === 'www.instagram.com';
  }

  // Outreach targets that belong on the current kind of page: "thread" ones in
  // the direct inbox, "profile" ones elsewhere, untagged ones on both.
  function outreachHealth(inThread) {
    var report = dom.healthCheck(OUTREACH_SITE);
    report.results = report.results.filter(function (r) {
      var where = dom.getTarget(OUTREACH_SITE, r.key.slice(OUTREACH_SITE.length + 1)).where;
      return !where || where === (inThread ? 'thread' : 'profile');
    });
    return report;
  }

  function onCommand(cmd) {
    var siteKey = dom.site();
    switch (cmd) {
      case 'status':
        return {
          ok: true,
          site: siteKey,
          canHealthCheck: !!siteKey || onInstagram(),
          running: state.run ? state.run.kind : null,
          thread: state.info ? state.info.thread.name : null
        };
      case 'health-check':
        if (!siteKey && !onInstagram()) return { ok: false, error: 'Open instagram.com/direct, an Instagram profile or the Business Suite inbox first.' };
        if (!siteKey) return { ok: true, report: outreachHealth(false) };
        var report = dom.healthCheck(siteKey);
        if (siteKey === 'instagram') report.results = report.results.concat(outreachHealth(true).results);
        return { ok: true, report: report };
      case 'capture-thread':
        return runCaptureThread();
      case 'capture-recent':
        return runCaptureRecent();
      case 'sync-labels':
        if (siteKey && siteKey !== 'businessSuite') {
          return { ok: false, error: 'Label sync only runs in the Meta Business Suite inbox (business.facebook.com).' };
        }
        return runSyncLabels();
      case 'stop':
        return stopRun();
      default:
        return { ok: false, error: 'Unknown command: ' + cmd };
    }
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg || msg.type !== 'aidm:cmd') return false;
    if (!sender || sender.id !== chrome.runtime.id) return false;
    var res;
    try {
      res = onCommand(msg.cmd);
    } catch (err) {
      res = { ok: false, error: err && err.message ? err.message : String(err) };
    }
    sendResponse(res);
    return false;
  });

  /* ---------------------------- page watcher ---------------------------- */

  panel.on({
    insert: insertText,
    insertAll: insertAll,
    newSuggestion: newSuggestion,
    capture: function () {
      var res = runCaptureThread();
      if (!res.ok) panel.message('error', res.error);
    },
    stop: stopRun
  });

  // Instagram and Business Suite are single-page apps, so the URL and the open
  // conversation change without a page load. A one second poll keeps up
  // without touching the page's own history or network code.
  function tick() {
    var siteKey = dom.site();
    if (siteKey !== state.site) {
      state.site = siteKey;
      state.threadKey = null;
      state.pendingKey = null;
      if (siteKey) {
        panel.mount();
        loadSettings().catch(function (err) {
          panel.message('error', err.message);
        });
      } else {
        if (state.run) state.run.stop.stop('Left the inbox page');
        panel.unmount();
      }
    }
    if (!siteKey) return;
    if (!document.getElementById(panel.HOST_ID)) panel.mount();
    if (state.run) return;

    var key = currentThreadKey(siteKey);
    if (key !== state.pendingKey) {
      state.pendingKey = key; // wait until the header is stable for one tick
      return;
    }
    if (key !== state.threadKey) {
      state.threadKey = key;
      refreshThread();
    }
  }

  setInterval(tick, 1000);
  tick();

  AIDM.main = { state: state, onCommand: onCommand, refreshThread: refreshThread, tick: tick };
})();
