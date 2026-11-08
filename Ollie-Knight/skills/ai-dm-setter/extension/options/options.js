/*
 * options.js
 * Reads and writes the settings, asks Chrome for permission to reach the app
 * origin, and tests the connection through the service worker.
 */
(function () {
  'use strict';
  var Core = globalThis.AIDMCore;
  var Api = globalThis.AIDMApi;

  function $(id) {
    return document.getElementById(id);
  }

  function show(kind, text) {
    var box = $('status');
    box.className = 'box ' + kind;
    box.textContent = text;
  }

  function fill(s) {
    $('baseUrl').value = s.baseUrl;
    $('token').value = s.token;
    $('captureCap').value = s.captureCap;
    $('showPanel').checked = s.showPanel;
    $('applyLabels').checked = s.applyLabels;
    $('skipUnread').checked = s.skipUnread;
  }

  function readForm() {
    return Core.mergeSettings({
      baseUrl: Api.normaliseBaseUrl($('baseUrl').value),
      token: $('token').value,
      captureCap: $('captureCap').value,
      showPanel: $('showPanel').checked,
      applyLabels: $('applyLabels').checked,
      skipUnread: $('skipUnread').checked
    });
  }

  function hasOrigin(patterns) {
    return Promise.all(
      patterns.map(function (p) {
        return chrome.permissions.contains({ origins: [p] }).catch(function () {
          return false;
        });
      })
    ).then(function (r) {
      return r.some(Boolean);
    });
  }

  // Must run inside the click that triggered it, so Chrome shows its prompt.
  function ensureOrigin(baseUrl) {
    var patterns = Api.originPatterns(baseUrl);
    return hasOrigin(patterns).then(function (has) {
      if (has) return true;
      return chrome.permissions.request({ origins: [patterns[0]] }).catch(function () {
        return false;
      });
    });
  }

  function save() {
    var s;
    try {
      s = readForm();
    } catch (err) {
      show('error', err.message);
      return Promise.resolve(null);
    }
    return ensureOrigin(s.baseUrl).then(function (granted) {
      if (!granted) {
        show('error', 'Chrome did not grant access to ' + s.baseUrl + '. Nothing was saved. Press Save again and allow it.');
        return null;
      }
      return chrome.storage.local.set({ settings: s }).then(function () {
        fill(s);
        show('ok', 'Saved.');
        return s;
      });
    });
  }

  function test() {
    show('info', 'Saving, then calling the app...');
    save().then(function (s) {
      if (!s) return;
      chrome.runtime.sendMessage({ type: 'aidm:api', call: 'ping' }, function (res) {
        if (chrome.runtime.lastError) return show('error', 'Background is not reachable: ' + chrome.runtime.lastError.message);
        if (res && res.ok) show('ok', 'Connected to workspace "' + (res.data.workspace || 'unnamed') + '" at ' + s.baseUrl + '.');
        else show('error', (res && res.error) || 'Connection failed.');
      });
    });
  }

  $('save').addEventListener('click', save);
  $('test').addEventListener('click', test);

  chrome.storage.local.get('settings').then(function (data) {
    fill(Core.mergeSettings(data.settings));
  });
})();
