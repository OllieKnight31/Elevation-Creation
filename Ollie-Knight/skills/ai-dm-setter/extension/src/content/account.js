/*
 * account.js
 * Tells the service worker which Instagram account this Chrome is signed in
 * to, so the app can show it and outreach can be tied to it without anyone
 * typing a handle. Reads the link to the account's own profile from the side
 * navigation. Reads nothing else and changes nothing on the page.
 */
(function () {
  'use strict';
  var AIDM = (globalThis.AIDM = globalThis.AIDM || {});
  if (AIDM.accountProbe || location.hostname !== 'www.instagram.com') return;
  AIDM.accountProbe = true;

  var Core = globalThis.AIDMCore;
  var last = null;

  function read() {
    if (/^\/accounts\/(login|signup|emailsignup|onetap)/.test(location.pathname)) return '';
    var link = null;
    try {
      link = AIDM.dom && AIDM.dom.find('instagramOutreach', 'selfProfileLink');
    } catch (e) {
      link = null;
    }
    if (!link) return null; // not known yet
    return Core.handleFromProfileHref(link.getAttribute('href') || '') || null;
  }

  function report() {
    var handle = read();
    if (handle === null || handle === last) return;
    last = handle;
    try {
      chrome.runtime.sendMessage({ type: 'aidm:ig-account', handle: handle }, function () {
        void chrome.runtime.lastError;
      });
    } catch (e) {
      /* the extension was reloaded; the next page load reports again */
    }
  }

  [1500, 5000, 12000, 30000].forEach(function (ms) {
    setTimeout(report, ms);
  });
})();
