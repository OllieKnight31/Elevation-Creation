/*
 * background.js (MV3 service worker)
 *
 * The ONLY place that talks to the web app. Content scripts and the popup send
 * it a message, it calls the app with the stored base URL and token, and
 * returns the result. The base URL always comes from storage, never from a
 * message, so a page cannot redirect data anywhere else.
 *
 * It also hosts the outreach runner (src/outreach/outreach-runner.js): the
 * alarm that polls the app for the next outreach task, and the two messages
 * the popup uses to switch outreach on or off and to read its status. This
 * file itself holds no sending code.
 */
'use strict';

importScripts('/src/selectors.js', '/src/lib/core.js', '/src/lib/api.js', '/src/lib/typing.js', '/src/outreach/outreach-runner.js', '/src/faces.js');

var Core = self.AIDMCore;
var Api = self.AIDMApi;

var Typing = self.AIDMTyping;
var OutreachLib = self.AIDMOutreach;

var INBOX_HOSTS = ['www.instagram.com', 'business.facebook.com'];
// Calls a content script or the popup may ask for. The outreach calls are
// deliberately not in this list: only the outreach runner makes them.
var API_CALLS = ['live', 'ping', 'ingest', 'conversation', 'suggest', 'labelQueue', 'labelAck'];
var OUTREACH_CALLS = ['outreachStatus', 'outreachNext', 'outreachResult'];
var FACES_CALLS = ['facesNeeded', 'faceResult'];

// Keep the token out of reach of content scripts. They get settings through
// the "aidm:settings" message, which never includes the token.
function lockStorage() {
  try {
    if (chrome.storage.local.setAccessLevel) {
      chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
    }
  } catch (e) {
    /* older Chrome: storage stays readable by content scripts */
  }
}
lockStorage();
chrome.runtime.onInstalled.addListener(lockStorage);
chrome.runtime.onStartup.addListener(lockStorage);

function getSettings() {
  return chrome.storage.local.get('settings').then(function (data) {
    return Core.mergeSettings(data.settings);
  });
}

function publicSettings(s) {
  return {
    baseUrl: s.baseUrl,
    configured: !!s.token,
    captureCap: s.captureCap,
    showPanel: s.showPanel,
    applyLabels: s.applyLabels,
    skipUnread: s.skipUnread,
    limits: Core.LIMITS
  };
}

function fail(message, code) {
  var e = new Error(message);
  e.code = code || null;
  return e;
}

// Resolves when the extension holds host permission for the app origin.
function ensureOriginPermission(baseUrl) {
  var patterns = Api.originPatterns(baseUrl);
  var checks = patterns.map(function (p) {
    return chrome.permissions.contains({ origins: [p] }).catch(function () {
      return false;
    });
  });
  return Promise.all(checks).then(function (results) {
    if (results.some(Boolean)) return;
    throw fail(
      'The extension has no permission for ' + baseUrl + '. Open the extension options and press Save to grant it.',
      'NO_HOST_PERMISSION'
    );
  });
}

function callApi(call, arg) {
  if (API_CALLS.indexOf(call) < 0) return Promise.reject(fail('Unknown API call: ' + call, 'BAD_CALL'));
  return getSettings().then(function (s) {
    var client = Api.createApiClient({ baseUrl: s.baseUrl, token: s.token });
    if (!s.token) throw fail('Workspace token is not set. Open the extension options.', 'NO_TOKEN');
    if (call === 'ingest') {
      var problem = Core.validateIngestBody(arg);
      if (problem) throw fail('Refusing to send a malformed ingest body: ' + problem, 'BAD_BODY');
    }
    if (call === 'labelQueue' && !s.applyLabels) {
      throw fail('"Apply labels in Business Suite" is switched off in the options.', 'LABELS_OFF');
    }
    return ensureOriginPermission(client.baseUrl).then(function () {
      return client[call](arg || {});
    });
  });
}

// The app client for the outreach runner. Same stored base URL, same token,
// same host permission check as every other call.
function outreachApi(call, arg) {
  if (OUTREACH_CALLS.indexOf(call) < 0) return Promise.reject(fail('Unknown outreach call: ' + call, 'BAD_CALL'));
  return getSettings().then(function (s) {
    if (!s.token) throw fail('Workspace token is not set. Open the extension options.', 'NO_TOKEN');
    var client = Api.createApiClient({ baseUrl: s.baseUrl, token: s.token });
    return ensureOriginPermission(client.baseUrl).then(function () {
      return client[call](arg || {});
    });
  });
}

var Outreach = OutreachLib.createRunner({ chrome: chrome, api: outreachApi, Typing: Typing });

// Profile pictures Meta will not share, read anonymously from each lead's public profile preview (src/faces.js).
function facesApi(call, arg) {
  if (FACES_CALLS.indexOf(call) < 0) return Promise.reject(fail('Unknown faces call: ' + call, 'BAD_CALL'));
  return getSettings().then(function (s) {
    if (!s.token) throw fail('Not linked to the app yet.', 'NO_TOKEN');
    var client = Api.createApiClient({ baseUrl: s.baseUrl, token: s.token });
    return client[call](arg || {});
  });
}
var Faces = self.AIDMFaces.createFaces({ chrome: chrome, api: facesApi });
Faces.init().catch(function () {});

function startOutreach() {
  Outreach.init().catch(function () {
    /* the alarm is created again on the next start */
  });
}
chrome.alarms.onAlarm.addListener(function (alarm) {
  if (alarm && alarm.name === 'aidm-hello') return hello();
  if (alarm && alarm.name === self.AIDMFaces.ALARM) return Faces.onAlarm(alarm);
  return Outreach.onAlarm(alarm);
});
chrome.tabs.onRemoved.addListener(function (tabId) {
  Outreach.onTabRemoved(tabId);
});
chrome.runtime.onInstalled.addListener(startOutreach);
chrome.runtime.onStartup.addListener(startOutreach);
startOutreach();

/* ---------------------------- linking to the app ---------------------------- */

// The app's own pages may link this helper to the app, read whether it is
// linked, and switch outreach on or off. Nothing else. The origins allowed are
// the one in the manifest and whichever app this helper is already linked to.
var DEFAULT_APP_ORIGIN = 'https://ainable-setter.vercel.app';
var APP_PAGE = '/connect';

// The app addresses whose pages carry the linking script (manifest), for example the live app and a copy on this computer.
function appOrigins() {
  var out = [];
  (chrome.runtime.getManifest().content_scripts || []).forEach(function (c) {
    if ((c.js || []).indexOf('src/pair-content.js') < 0) return;
    (c.matches || []).forEach(function (m) {
      try {
        out.push(new URL(m.replace(/\*$/, '')).origin);
      } catch (e) {}
    });
  });
  return out;
}

function appOriginOf(sender) {
  if (!sender || sender.id !== chrome.runtime.id || !sender.tab || sender.frameId !== 0) return Promise.resolve('');
  var origin = '';
  try {
    origin = new URL(sender.url || sender.tab.url || '').origin;
  } catch (e) {
    return Promise.resolve('');
  }
  return getSettings().then(function (s) {
    var linked = '';
    try {
      linked = s.token ? new URL(s.baseUrl).origin : '';
    } catch (e) {
      linked = '';
    }
    return origin === DEFAULT_APP_ORIGIN || origin === linked || appOrigins().indexOf(origin) >= 0 ? origin : '';
  });
}

function outreachLocal() {
  return chrome.storage.local.get('outreach').then(function (d) {
    var o = (d && d.outreach) || {};
    return { enabled: o.enabled === true, account: typeof o.account === 'string' ? o.account : '', note: typeof o.note === 'string' ? o.note : '' };
  });
}

function olderThan(a, b) {
  var x = String(a).split('.').map(Number);
  var y = String(b).split('.').map(Number);
  for (var i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0);
  return false;
}

// A helper loaded from the project folder ("Load unpacked") picks up new files only when it reloads.
// When the app says a newer version exists, it reloads itself once for that version. If the folder does
// not hold the newer files (a downloaded copy), the attempt is remembered and never repeated.
function selfUpdate(latest) {
  if (typeof latest !== 'string' || !olderThan(chrome.runtime.getManifest().version, latest)) return null;
  // Loaded from a folder ("Load unpacked") when the manifest has no store update address. This needs no extra
  // permission, unlike chrome.management, which is not available to this helper.
  if (chrome.runtime.getManifest().update_url) return null;
  return Promise.resolve().then(function () {
    return chrome.storage.local.get('reloadTried').then(function (d) {
      if (d && d.reloadTried === latest) return null;
      // Never mid send: try again shortly, once the step in progress is over.
      if (Outreach.isBusy && Outreach.isBusy()) {
        setTimeout(function () { selfUpdate(latest); }, 20000);
        return null;
      }
      return chrome.storage.local.set({ reloadTried: latest }).then(function () {
        chrome.runtime.reload();
        return null;
      });
    });
  });
}

// Heartbeat to the app. Silent when the helper is not linked or the app is not running.
// The version of this code. Chrome can keep running an old copy of the background code after an update while the
// manifest version moves on, so the app compares the two to spot that. Bump together with manifest.json.
var CODE_VERSION = '0.3.12';

function hello() {
  return Promise.all([getSettings(), outreachLocal(), chrome.storage.local.get('igAccount')])
    .then(function (r) {
      var s = r[0];
      if (!s.token) return null;
      var seen = r[2] && r[2].igAccount;
      var body = { version: chrome.runtime.getManifest().version, code: CODE_VERSION, outreachOn: r[1].enabled };
      return Faces.status().catch(function () { return null; }).then(function (faces) {
      if (faces) body.faces = faces;
      // Only a reading from the last day counts as "signed in".
      if (seen && Date.now() - seen.at < 24 * 3600 * 1000) body.account = seen.handle;
      return Api.createApiClient({ baseUrl: s.baseUrl, token: s.token }).hello(body).then(function (res) {
        return selfUpdate(res && res.latest);
      });
      });
    })
    .catch(function () {
      return null;
    });
}

function appStatus(origin) {
  return Promise.all([getSettings(), outreachLocal(), chrome.storage.local.get('igAccount')]).then(function (r) {
    var linked = false;
    try {
      linked = !!r[0].token && new URL(r[0].baseUrl).origin === origin;
    } catch (e) {
      linked = false;
    }
    var seen = r[2] && r[2].igAccount;
    return {
      version: chrome.runtime.getManifest().version,
      linked: linked,
      account: seen ? seen.handle : r[1].account,
      outreachOn: r[1].enabled,
      note: r[1].note
    };
  });
}

function handleApp(msg, origin) {
  if (msg.type === 'aidm:app-status') return appStatus(origin);
  // New chats loaded without pictures: start reading them now rather than on the next alarm.
  if (msg.type === 'aidm:app-faces') {
    Faces.wake().catch(function () {});
    return Faces.status();
  }
  // The app saw that a newer helper is available: reload from the folder now (never mid send).
  if (msg.type === 'aidm:app-update') return Promise.resolve(selfUpdate(msg.latest)).then(function () { return appStatus(origin); });
  if (msg.type === 'aidm:app-outreach') {
    return Outreach.setEnabled(msg.enabled === true).then(function () {
      hello();
      return appStatus(origin);
    });
  }
  if (msg.type === 'aidm:app-pair') {
    var token = String(msg.token || '').trim();
    if (!token) return Promise.reject(fail('The app did not send a token.', 'NO_TOKEN'));
    var client = Api.createApiClient({ baseUrl: origin, token: token });
    // The token is only kept once the app itself has accepted it.
    return ensureOriginPermission(client.baseUrl)
      .then(function () {
        return client.ping();
      })
      .then(function () {
        return chrome.storage.local.get('settings');
      })
      .then(function (d) {
        var next = Object.assign({}, (d && d.settings) || {}, { baseUrl: client.baseUrl, token: token });
        return chrome.storage.local.set({ settings: next });
      })
      .then(hello)
      .then(function () {
        return appStatus(origin);
      });
  }
  return Promise.reject(fail('Unknown message type: ' + msg.type, 'BAD_TYPE'));
}

// A fresh install links itself: app tabs that are already open get the pairing
// script, and if the app is not open yet its Get connected page is opened.
function linkOnInstall(details) {
  if (!details || details.reason !== 'install') return;
  linkToApp();
}

function linkToApp() {
  // Any open page of the app, live or a copy on this computer, so a person already on Get connected is linked where they are.
  var origins = [DEFAULT_APP_ORIGIN].concat(appOrigins()).filter(function (o, i, all) { return all.indexOf(o) === i; });
  chrome.tabs.query({ url: origins.map(function (o) { return o + '/*'; }) }).then(function (tabs) {
    if (!tabs.length) return chrome.tabs.create({ url: DEFAULT_APP_ORIGIN + APP_PAGE });
    tabs.forEach(function (t) {
      chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['src/pair-content.js'] }).catch(function () {});
    });
    // Take the person straight back to the app, which links the helper while they watch.
    var back = tabs.filter(function (t) { return (t.url || '').indexOf(APP_PAGE) >= 0; })[0] || tabs[0];
    chrome.tabs.update(back.id, { active: true }).catch(function () {});
    chrome.windows.update(back.windowId, { focused: true }).catch(function () {});
  }).catch(function () {});
}
chrome.runtime.onInstalled.addListener(linkOnInstall);

// A helper first linked to a copy of the app on this computer keeps pointing there after that copy is stopped,
// and every panel then says it cannot reach the app. When that copy is not running, the helper moves itself
// to the live app and opens it, which links it again within a few seconds.
function leaveDeadLocalCopy() {
  return getSettings().then(function (s) {
    var host = '';
    try {
      host = new URL(s.baseUrl).hostname;
    } catch (e) {
      return;
    }
    if (!/^(localhost|127\.0\.0\.1)$/.test(host)) return;
    // Only "cannot reach" counts. Any answer, even a refusal, means that copy is running.
    return Api.createApiClient({ baseUrl: s.baseUrl, token: s.token || 'none' })
      .ping()
      .then(function () {
        return false;
      })
      .catch(function (err) {
        return !!err && err.code === 'NETWORK';
      })
      .then(function (dead) {
        if (!dead) return;
        return chrome.storage.local.get('settings').then(function (d) {
          var next = Object.assign({}, (d && d.settings) || {}, { baseUrl: DEFAULT_APP_ORIGIN });
          delete next.token;
          return chrome.storage.local.set({ settings: next }).then(linkToApp);
        });
      });
  }).catch(function () {});
}
chrome.runtime.onInstalled.addListener(leaveDeadLocalCopy);
chrome.runtime.onStartup.addListener(leaveDeadLocalCopy);

// Every 15 minutes: often enough for the app to show the helper as connected, rare enough to let its database sleep.
// Created only when missing: Chrome restarts this worker about once a minute, and creating the alarm again each time
// would push it back 15 minutes, so it would never fire.
chrome.alarms.get('aidm-hello').then(function (a) {
  if (!a || a.periodInMinutes !== 15) chrome.alarms.create('aidm-hello', { periodInMinutes: 15 });
});
hello();

// True for the popup and the options page, false for any content script.
function senderIsExtensionPage(sender) {
  if (!sender || sender.id !== chrome.runtime.id) return false;
  if (!sender.tab) return true;
  var url = sender.url || '';
  return url.indexOf(chrome.runtime.getURL('')) === 0;
}

function senderIsAllowed(sender) {
  if (!sender || sender.id !== chrome.runtime.id) return false;
  if (!sender.tab) return true; // popup or options page
  var url = sender.url || (sender.tab && sender.tab.url) || '';
  if (url.indexOf(chrome.runtime.getURL('')) === 0) return true; // options opened in a tab
  try {
    return INBOX_HOSTS.indexOf(new URL(url).hostname) >= 0;
  } catch (e) {
    return false;
  }
}

function handle(msg, sender) {
  switch (msg.type) {
    case 'aidm:outreach-status':
      if (!senderIsExtensionPage(sender)) return Promise.reject(fail('Only the popup may read the outreach status.', 'FORBIDDEN'));
      return Outreach.status();
    case 'aidm:outreach-toggle':
      if (!senderIsExtensionPage(sender)) return Promise.reject(fail('Only the popup may switch outreach.', 'FORBIDDEN'));
      return Outreach.setEnabled(msg.enabled === true);
    case 'aidm:ig-account': {
      // Reported by the Instagram tab: which account Chrome is signed in to. Empty means signed out.
      var handle = Core.cleanHandle(String(msg.handle || '')) || '';
      return chrome.storage.local.get('outreach').then(function (d) {
        var o = Object.assign({}, (d && d.outreach) || {});
        var jobs = [chrome.storage.local.set({ igAccount: { handle: handle, at: Date.now() } })];
        if (handle && o.account !== handle) {
          o.account = handle;
          jobs.push(chrome.storage.local.set({ outreach: o }));
        }
        return Promise.all(jobs);
      }).then(hello).then(function () {
        return { saved: true };
      });
    }
    case 'aidm:sync-claim': {
      // Only one Instagram tab reads the inbox at a time. A tab keeps the job while it keeps asking.
      var tabId = sender && sender.tab ? sender.tab.id : null;
      if (tabId === null) return Promise.reject(fail('Only an Instagram tab may read the inbox.', 'FORBIDDEN'));
      return chrome.storage.session.get('syncLeader').then(function (d) {
        var cur = d && d.syncLeader;
        var visible = msg.visible === true;
        // The tab in front takes over from one behind other tabs, so the chat you are looking at is the one read.
        var mine = !cur || cur.tabId === tabId || Date.now() - cur.at > 12000 || (visible && !cur.visible);
        if (!mine) return { leader: false };
        return chrome.storage.session.set({ syncLeader: { tabId: tabId, at: Date.now(), visible: visible } }).then(function () {
          return { leader: true };
        });
      });
    }
    case 'aidm:sync-status':
      if (!msg.status || typeof msg.status !== 'object') return Promise.reject(fail('status is missing', 'BAD_BODY'));
      return chrome.storage.local.set({ syncStatus: msg.status }).then(function () {
        return { saved: true };
      });
    case 'aidm:settings':
      return getSettings().then(publicSettings);
    case 'aidm:api':
      return callApi(msg.call, msg.arg);
    case 'aidm:run-update':
      if (!msg.run || typeof msg.run !== 'object') return Promise.reject(fail('run is missing', 'BAD_BODY'));
      return chrome.storage.local.set({ lastRun: msg.run }).then(function () {
        return { saved: true };
      });
    default:
      return Promise.reject(fail('Unknown message type: ' + msg.type, 'BAD_TYPE'));
  }
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || typeof msg.type !== 'string' || msg.type.indexOf('aidm:') !== 0) return false;
  if (msg.type === 'aidm:cmd' || msg.type === 'aidm:outreach') return false; // meant for content scripts
  if (msg.type.indexOf('aidm:app-') === 0) {
    appOriginOf(sender)
      .then(function (origin) {
        if (!origin) throw fail('Only the Setter app may link this helper.', 'FORBIDDEN');
        return handleApp(msg, origin);
      })
      .then(
        function (data) {
          sendResponse({ ok: true, data: data });
        },
        function (err) {
          sendResponse({ ok: false, error: err && err.message ? err.message : String(err), code: (err && err.code) || null });
        }
      );
    return true;
  }
  if (!senderIsAllowed(sender)) {
    sendResponse({ ok: false, error: 'Sender is not allowed.', code: 'FORBIDDEN' });
    return false;
  }
  Promise.resolve()
    .then(function () {
      return handle(msg, sender);
    })
    .then(
      function (data) {
        sendResponse({ ok: true, data: data });
      },
      function (err) {
        sendResponse({
          ok: false,
          error: err && err.message ? err.message : String(err),
          status: (err && err.status) || null,
          code: (err && err.code) || null
        });
      }
    );
  return true; // async response
});
