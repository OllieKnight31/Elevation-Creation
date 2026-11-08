/*
 * pair-content.js
 * Runs only on the Setter app's own pages. It lets the app link this
 * extension to itself, so nobody has to copy an address or a token:
 *
 *   app page  -> window.postMessage({ source: 'ainable-app', type: 'pair', token })
 *   this file -> service worker ('aidm:app-pair'), which checks the token
 *                against the app before saving it
 *   this file -> window.postMessage({ source: 'ainable-ext', type: 'status', ... })
 *
 * The address saved is always this tab's own origin, never one from a message.
 */
(function () {
  'use strict';
  if (globalThis.__ainablePair) return;
  globalThis.__ainablePair = true;

  var TYPES = { pair: 'aidm:app-pair', status: 'aidm:app-status', outreach: 'aidm:app-outreach', faces: 'aidm:app-faces', update: 'aidm:app-update' };

  function post(data) {
    data.source = 'ainable-ext';
    window.postMessage(data, location.origin);
  }

  function ask(msg) {
    try {
      chrome.runtime.sendMessage(msg, function (res) {
        if (chrome.runtime.lastError || !res) return post({ type: 'status', installed: true, stale: true });
        if (!res.ok) return post({ type: 'status', installed: true, error: res.error || 'The helper could not do that.' });
        var out = res.data || {};
        out.type = 'status';
        out.installed = true;
        post(out);
      });
    } catch (e) {
      // The extension was reloaded under this page. A page refresh reconnects it.
      post({ type: 'status', installed: true, stale: true });
    }
  }

  window.addEventListener('message', function (ev) {
    if (ev.source !== window || ev.origin !== location.origin) return;
    var d = ev.data;
    if (!d || d.source !== 'ainable-app' || !TYPES[d.type]) return;
    var msg = { type: TYPES[d.type] };
    if (d.type === 'pair') msg.token = String(d.token || '');
    if (d.type === 'outreach') msg.enabled = d.enabled === true;
    if (d.type === 'update') msg.latest = String(d.latest || '');
    ask(msg);
  });

  ask({ type: TYPES.status });
})();
