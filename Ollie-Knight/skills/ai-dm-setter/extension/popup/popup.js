/*
 * popup.js
 * Connection status, the run buttons, the last run summary, the selector
 * health check and the outreach master switch. The popup does no DOM work on
 * any page itself. It sends a command to the content script in the active tab,
 * or a message to the service worker.
 */
(function () {
  'use strict';

  var INBOX_HOSTS = ['www.instagram.com', 'business.facebook.com'];
  var tab = null;

  function $(id) {
    return document.getElementById(id);
  }

  function box(id, kind, text) {
    var n = $(id);
    n.className = 'box ' + kind;
    n.textContent = text;
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  /* ---------------------------- talking to the tab ---------------------------- */

  function tabIsInboxHost() {
    try {
      return !!tab && INBOX_HOSTS.indexOf(new URL(tab.url).hostname) >= 0;
    } catch (e) {
      return false;
    }
  }

  function inject() {
    var files = chrome.runtime.getManifest().content_scripts[0].js;
    return chrome.scripting.executeScript({ target: { tabId: tab.id }, files: files });
  }

  // Sends a command to the content script. If the tab was open before the
  // extension was installed, the content script is injected first.
  function sendCmd(cmd) {
    if (!tab || !tabIsInboxHost()) {
      return Promise.resolve({ ok: false, error: 'Open instagram.com/direct, an Instagram profile or the Business Suite inbox in this tab first.' });
    }
    var msg = { type: 'aidm:cmd', cmd: cmd };
    return chrome.tabs.sendMessage(tab.id, msg).catch(function () {
      return inject()
        .then(function () {
          return chrome.tabs.sendMessage(tab.id, msg);
        })
        .catch(function (err) {
          return { ok: false, error: 'Could not reach the page (' + err.message + '). Reload the tab and try again.' };
        });
    });
  }

  /* ---------------------------- rendering ---------------------------- */

  function renderLastRun(run) {
    if (!run) return box('lastRun', 'info', 'Nothing has run yet.');
    var names = { 'capture-thread': 'Capture this thread', 'capture-recent': 'Capture recent threads', 'sync-labels': 'Label sync' };
    var lines = [];
    lines.push((names[run.kind] || run.kind) + ' on ' + (run.site === 'instagram' ? 'Instagram' : 'Business Suite'));
    lines.push('Outcome: ' + run.outcome + (run.finishedAt ? ' at ' + new Date(run.finishedAt).toLocaleString() : ''));
    if (run.kind === 'sync-labels') {
      lines.push('Queue: ' + run.queueSize + ', labelled: ' + run.itemsOk + ', failed: ' + run.itemsFailed + ', labels added: ' + run.labelsApplied);
    } else {
      lines.push('Threads: ' + run.threads + ', messages read: ' + run.messagesSeen + ', new in the app: ' + run.messagesAdded);
      if (run.skippedUnread) lines.push('Unread threads skipped: ' + run.skippedUnread);
    }
    if (run.detail) lines.push(run.detail);
    (run.warnings || []).forEach(function (w) {
      lines.push('Warning: ' + w);
    });
    var kind = run.outcome === 'done' && !run.itemsFailed ? 'ok' : run.outcome === 'halted' || run.outcome === 'error' ? 'error' : 'info';
    box('lastRun', kind, lines.join('\n'));
  }

  function renderSync(s) {
    if (!s || !s.at) return;
    var ago = Math.round((Date.now() - s.at) / 1000);
    var when = ago < 60 ? ago + ' seconds ago' : Math.round(ago / 60) + ' minutes ago';
    if (s.ok) box('syncStatus', 'ok', 'On. Last read ' + when + (s.added ? ', copied in ' + s.added + ' message' + (s.added === 1 ? '' : 's') + '.' : ', nothing new.'));
    else box('syncStatus', 'error', 'Last try ' + when + ' failed: ' + s.error + ' It tries again by itself.');
  }

  function renderHealth(report) {
    $('healthWrap').classList.remove('hidden');
    var list = $('health');
    list.textContent = '';
    var missing = 0;
    var softMissing = 0;
    report.results.forEach(function (r) {
      var good = r.expectAbsent ? !r.found : r.found;
      var cls = good ? 'found' : r.optional || r.transient || !r.scopeFound ? 'soft' : 'missing';
      if (!good && cls === 'missing') missing++;
      if (!good && cls === 'soft') softMissing++;
      var tag = r.expectAbsent ? (r.found ? 'PRESENT' : 'absent') : r.found ? 'found' : 'NOT FOUND';
      var li = el('li', cls);
      li.appendChild(el('span', 'tag', tag));
      li.appendChild(el('code', '', r.key));
      var extra = [];
      if (r.optional) extra.push('optional');
      if (r.transient) extra.push('only present while a picker or dialog is open');
      if (r.scope && !r.scopeFound) extra.push('not checked, its container ' + r.scope + ' was not found');
      li.appendChild(el('div', 'muted', r.desc + (extra.length ? ' (' + extra.join(', ') + ')' : '')));
      var details = el('details');
      details.appendChild(el('summary', 'muted', 'selectors'));
      r.selectors.forEach(function (s) {
        var row = el('div');
        row.appendChild(el('code', '', s.count + ' x  ' + s.selector));
        details.appendChild(row);
      });
      li.appendChild(details);
      list.appendChild(li);
    });
    var summary = report.results.length - missing - softMissing + ' of ' + report.results.length + ' targets fine on ' + report.site + ', ' +
      missing + ' required missing, ' + softMissing + ' optional or unchecked.';
    if (report.halt) summary += ' HALT TEXT ON PAGE: "' + report.halt + '". Runs will refuse to start.';
    summary += ' Some targets only exist with a conversation, a dialog or the label picker open.';
    $('healthSummary').textContent = summary;
  }

  function note(kind, text) {
    var n = $('note');
    n.className = 'box ' + kind + (text ? '' : ' hidden');
    n.textContent = text || '';
  }

  function refreshStatus() {
    return sendCmd('status').then(function (res) {
      var onInbox = !!(res && res.ok && res.site);
      var running = !!(res && res.ok && res.running);
      var onProfile = !onInbox && !!(res && res.ok && res.canHealthCheck);
      $('page').textContent = onProfile
        ? 'This tab: an Instagram page outside the inbox. The health check here covers the outreach selectors (open a profile first).'
        : onInbox
        ? 'This tab: ' + (res.site === 'instagram' ? 'Instagram direct' : 'Business Suite inbox') + (res.thread ? ', open thread: ' + res.thread : '') +
          (running ? '. A run is in progress.' : '')
        : 'This tab is not an Instagram direct or Business Suite inbox page.';
      $('captureThread').disabled = !onInbox || running;
      $('captureRecent').disabled = !onInbox || running;
      $('syncLabels').disabled = !onInbox || running || res.site !== 'businessSuite';
      $('healthCheck').disabled = !onInbox && !(res && res.ok && res.canHealthCheck);
      $('stop').classList.toggle('hidden', !running);
      return res;
    });
  }

  function run(cmd, startedText) {
    note('info', 'Starting...');
    sendCmd(cmd).then(function (res) {
      if (res && res.ok) note('ok', startedText);
      else note('error', (res && res.error) || 'Could not start.');
      refreshStatus();
    });
  }

  /* ---------------------------- outreach ---------------------------- */

  function worker(message) {
    return new Promise(function (resolve) {
      chrome.runtime.sendMessage(message, function (res) {
        if (chrome.runtime.lastError) return resolve({ ok: false, error: 'Background is not reachable: ' + chrome.runtime.lastError.message });
        resolve(res || { ok: false, error: 'Background gave no answer.' });
      });
    });
  }

  function when(ms) {
    return ms ? new Date(ms).toLocaleTimeString() : '';
  }

  function renderOutreach(st) {
    $('outreachSwitch').checked = !!st.enabled;
    $('outreachWord').textContent = st.enabled ? 'on' : 'off';
    var lines = [];
    var kind = 'info';
    lines.push(st.enabled ? 'On in this browser.' : 'Off in this browser. Nothing is sent.');
    if (st.note) {
      lines.push(st.note);
      kind = 'error';
    }
    var sv = st.server;
    if (sv) {
      lines.push('App: ' + (sv.enabled ? 'enabled' : 'disabled') + ', mode ' + (sv.mode === 'auto' ? 'auto (types and sends)' : 'assisted (types, you press send)') +
        (sv.account ? ', account @' + sv.account : ''));
      lines.push('Sent today: ' + (Number(sv.sentToday) || 0) + ' of ' + (Number(sv.capToday) || 0) + (sv.inWindow === false ? '. Outside the sending window.' : ''));
      if (sv.paused) {
        lines.push('PAUSED by the app' + (sv.pauseReason ? ': ' + sv.pauseReason : '.'));
        kind = 'error';
      }
      if (sv.nextAt) lines.push('Next send: ' + new Date(sv.nextAt).toLocaleString());
    } else if (st.serverError) {
      lines.push('App status unavailable: ' + st.serverError);
    }
    if (st.running) lines.push('Working on @' + st.running.handle + ' (' + st.running.mode + '), stage: ' + st.running.stage + '.');
    if (st.hold) lines.push('WAITING FOR YOU: the message for @' + st.hold.handle + ' is typed in the pinned outreach tab. Read it and press send there.');
    if (st.enabled && !st.running && st.poll && st.poll.reason) {
      lines.push('No task: ' + st.poll.reason + (st.poll.nextAt ? ' (asking again after ' + when(st.poll.nextAt) + ')' : ''));
    }
    if (st.enabled && kind === 'info' && sv && sv.enabled && !sv.paused) kind = 'ok';
    box('outreachStatus', kind, lines.join('\n'));

    var list = $('outreachLog');
    list.textContent = '';
    $('outreachLogWrap').classList.toggle('hidden', !(st.log && st.log.length));
    (st.log || []).forEach(function (r) {
      var good = r.status === 'sent' || r.status === 'typed';
      var li = el('li', good ? 'found' : r.status === 'skipped' || r.status === 'not_found' || r.status === 'unreachable' ? 'soft' : 'missing');
      li.appendChild(el('span', 'tag', r.status));
      li.appendChild(el('code', '', '@' + r.handle));
      var bits = [when(r.at)];
      if (r.keystrokes) bits.push(Math.round((r.typedMs || 0) / 1000) + ' s typing, ' + r.keystrokes + ' keys, ' + (r.typos || 0) + ' typos');
      li.appendChild(el('div', 'muted', bits.join(', ')));
      if (r.detail) li.appendChild(el('div', 'muted', r.detail));
      list.appendChild(li);
    });
  }

  function refreshOutreach() {
    return worker({ type: 'aidm:outreach-status' }).then(function (res) {
      if (res.ok) renderOutreach(res.data);
      else box('outreachStatus', 'error', res.error || 'Outreach status failed.');
    });
  }

  $('outreachSwitch').addEventListener('change', function () {
    var on = $('outreachSwitch').checked;
    $('outreachSwitch').disabled = true;
    worker({ type: 'aidm:outreach-toggle', enabled: on }).then(function (res) {
      $('outreachSwitch').disabled = false;
      if (!res.ok) box('outreachStatus', 'error', res.error || 'Could not switch outreach.');
      refreshOutreach();
    });
  });

  /* ---------------------------- wiring ---------------------------- */

  $('captureThread').addEventListener('click', function () {
    run('capture-thread', 'Started. Progress and a Stop button are shown on the page. You can close this popup.');
  });
  $('captureRecent').addEventListener('click', function () {
    run('capture-recent', 'Started. It works through one thread at a time with pauses, so it is slow on purpose. Progress and Stop are on the page.');
  });
  $('syncLabels').addEventListener('click', function () {
    run('sync-labels', 'Started. Progress and a Stop button are shown on the page.');
  });
  $('stop').addEventListener('click', function () {
    sendCmd('stop').then(function (res) {
      note(res && res.ok ? 'info' : 'error', res && res.ok ? 'Stop requested.' : (res && res.error) || 'Could not stop.');
      setTimeout(refreshStatus, 600);
    });
  });
  $('healthCheck').addEventListener('click', function () {
    sendCmd('health-check').then(function (res) {
      if (res && res.ok) {
        note('', '');
        renderHealth(res.report);
      } else {
        note('error', (res && res.error) || 'Health check failed.');
      }
    });
  });
  $('openOptions').addEventListener('click', function (ev) {
    ev.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === 'local' && changes.syncStatus) renderSync(changes.syncStatus.newValue);
    if (area === 'local' && changes.lastRun) {
      renderLastRun(changes.lastRun.newValue);
      refreshStatus();
    }
    if (area === 'local' && (changes.outreach || changes.outreachTask || changes.outreachLog || changes.outreachPoll || changes.outreachHold)) {
      refreshOutreach();
    }
  });

  /* ---------------------------- setup checklist ---------------------------- */

  // Every step has a button that opens the exact page it needs, so nobody has to look for an address.
  var LIVE_APP = 'https://ainable-setter.vercel.app';
  var IG_LOGIN = 'https://www.instagram.com/accounts/login/';
  var IG_INBOX = 'https://www.instagram.com/direct/inbox/';

  function open(url) {
    chrome.tabs.create({ url: url });
    window.close();
  }

  function isLocal(url) {
    try {
      return /^(localhost|127\.0\.0\.1)$/.test(new URL(url).hostname);
    } catch (e) {
      return false;
    }
  }

  function step(n, done, title, text, label, url) {
    var li = el('li', done ? 'done' : '');
    li.appendChild(el('span', 'n', done ? '\u2713' : String(n)));
    var t = el('div', 't');
    t.appendChild(el('b', '', title));
    t.appendChild(el('span', 'muted', text));
    if (label) {
      var b = el('button', done ? 'ghost' : '', label);
      b.type = 'button';
      b.addEventListener('click', function () {
        open(url);
      });
      t.appendChild(el('br'));
      t.appendChild(b);
    }
    li.appendChild(t);
    return li;
  }

  function renderSetup(s, ig) {
    var app = isLocal(s.baseUrl) ? LIVE_APP : (s.baseUrl || LIVE_APP).replace(/\/+$/, '');
    var linked = !!s.token && !isLocal(s.baseUrl);
    var signedIn = !!(ig && ig.handle && Date.now() - ig.at < 24 * 3600 * 1000);
    var list = $('setup');
    list.textContent = '';
    list.appendChild(
      linked
        ? step(1, true, 'Linked to Ainable Setter', 'This helper sends your threads to your account.', '', '')
        : step(1, false, 'Link this helper to Ainable Setter',
            s.token ? 'It is linked to a test copy on this computer. Open the live app and it relinks by itself.' : 'Open the app and it links by itself. Nothing to copy.',
            'Link to Ainable Setter', app + '/connect')
    );
    list.appendChild(
      signedIn
        ? step(2, true, 'Signed in to Instagram as @' + ig.handle, 'Messages are read and sent from this account.', 'Open Instagram', 'https://www.instagram.com/')
        : step(2, false, 'Sign in to Instagram in this Chrome', 'Sign in the way you normally do. Your password stays with Instagram.', 'Open Instagram sign in', IG_LOGIN)
    );
    list.appendChild(
      step(3, false, 'Open your Instagram inbox', 'Your DMs come into Ainable Setter while the inbox is open. Then press "Capture recent threads" below.', 'Open my Instagram inbox', IG_INBOX)
    );
    $('openApp').onclick = function () {
      open(app + '/inbox');
    };
    $('openGuide').onclick = function () {
      open(app + '/connect');
    };
  }

  $('openManage').addEventListener('click', function (e) {
    e.preventDefault();
    open('chrome://extensions/?id=' + chrome.runtime.id);
  });

  chrome.storage.local.get(['lastRun', 'settings', 'igAccount', 'syncStatus']).then(function (data) {
    renderLastRun(data.lastRun);
    renderSync(data.syncStatus);
    var s = globalThis.AIDMCore.mergeSettings(data.settings);
    renderSetup(s, data.igAccount);
    if (!s.token || isLocal(s.baseUrl)) {
      box('conn', 'error', s.token ? 'Linked to a test copy on this computer, not your live account. Use step 1 below.' : 'Not linked to the app yet. Use step 1 below.');
      return;
    }
    chrome.runtime.sendMessage({ type: 'aidm:api', call: 'ping' }, function (res) {
      if (chrome.runtime.lastError) return box('conn', 'error', 'Background is not reachable: ' + chrome.runtime.lastError.message);
      if (res && res.ok) box('conn', 'ok', 'Connected to "' + (res.data.workspace || 'unnamed') + '" at ' + s.baseUrl);
      else box('conn', 'error', (res && res.error) || 'Connection failed.');
    });
  });

  refreshOutreach();

  chrome.tabs.query({ active: true, currentWindow: true }).then(function (tabs) {
    tab = tabs[0] || null;
    refreshStatus();
  });
})();
