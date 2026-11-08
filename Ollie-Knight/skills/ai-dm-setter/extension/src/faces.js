/*
 * faces.js (runs in the service worker)
 *
 * Fills in lead profile pictures that Meta will not share. Meta's API gives a
 * lead's picture only after they have messaged since the account was
 * connected, and Instagram refuses the app's own servers, so the picture is
 * read from this computer instead.
 *
 * It reads the link preview of the lead's public profile, the same preview a
 * chat app shows when someone pastes a profile link. The request is anonymous:
 * no cookies, no login, nothing tied to the user's Instagram account, and no
 * tab opens. Only the page head is read. Three at a time, each pausing between
 * profiles, at most 2,400 an hour, and it backs off for 30 minutes as soon as Instagram stops
 * answering.
 */
(function (root) {
  'use strict';

  var ALARM = 'aidm-faces';
  var KEY = 'faces';
  var RULE_ID = 4101;
  var PER_HOUR = 2400;
  var GAP_MS = 900;
  var BATCH_MS = 25000; // one alarm's worth of work, shorter than the 30 second alarm
  var IDLE_MS = 6 * 3600 * 1000; // nothing left to do: look again after this long
  var BACKOFF_MS = 30 * 60 * 1000; // Instagram stopped answering: wait this long

  function createFaces(deps) {
    var chrome = deps.chrome;
    var api = deps.api; // function (name, body) -> Promise
    var fetchFn = deps.fetch || root.fetch.bind(root);
    var markers = function () {
      var S = root.AIDM_SELECTORS && root.AIDM_SELECTORS.instagramFaces && root.AIDM_SELECTORS.instagramFaces.preview;
      return S || null;
    };
    var busy = false;
    var ruleError = '';

    function now() {
      return Date.now();
    }
    function wait(ms) {
      return new Promise(function (r) {
        setTimeout(r, ms);
      });
    }
    function load() {
      return chrome.storage.local.get(KEY).then(function (d) {
        return Object.assign({ pauseUntil: 0, hour: 0, count: 0, done: 0, note: '' }, (d && d[KEY]) || {});
      });
    }
    function save(s) {
      var o = {};
      o[KEY] = s;
      return chrome.storage.local.set(o);
    }

    // Instagram gives the preview only to link preview readers, so this helper's own profile requests say they are
    // one. The rule covers requests made by this helper alone, never pages the user opens.
    function previewRule() {
      var S = markers();
      var dnr = chrome.declarativeNetRequest;
      if (!S || !dnr || !dnr.updateSessionRules) return Promise.resolve(false);
      return dnr
        .updateSessionRules({
          removeRuleIds: [RULE_ID],
          addRules: [
            {
              id: RULE_ID,
              priority: 1,
              action: {
                type: 'modifyHeaders',
                requestHeaders: [
                  { header: 'user-agent', operation: 'set', value: S.userAgent },
                  { header: 'cookie', operation: 'remove' }
                ]
              },
              condition: { urlFilter: '||www.instagram.com/', initiatorDomains: [chrome.runtime.id], resourceTypes: ['xmlhttprequest', 'other'] }
            }
          ]
        })
        .then(
          function () {
            return true;
          },
          function (e) {
            ruleError = e && e.message ? e.message : String(e);
            return false;
          }
        );
    }

    function unescape(s) {
      return s.replace(/&amp;/g, '&').replace(/&#x2F;/gi, '/').replace(/&#064;/g, '@');
    }

    // The picture address, '' for no picture or no such profile, null when Instagram did not answer properly.
    function lookup(handle) {
      var S = markers();
      if (!S) return Promise.resolve(null);
      return fetchFn('https://www.instagram.com/' + encodeURIComponent(handle) + '/', { credentials: 'omit', cache: 'no-store', redirect: 'follow' })
        .then(function (r) {
          if (r.status === 404) return '';
          if (!r.ok) return null;
          return r.text().then(function (html) {
            var head = html.slice(0, Math.max(html.indexOf('</head>'), 200000));
            var meta = function (name) {
              var m = head.match(new RegExp('<meta[^>]+property="' + name + '"[^>]+content="([^"]+)"'));
              return m ? unescape(m[1]) : '';
            };
            var page = meta(S.pageMeta).toLowerCase().replace(/\/$/, '');
            // No preview: a profile that does not exist, or else a login page or a block, which says nothing about it.
            if (!page) return html.indexOf(S.goneMarker) >= 0 && !S.loginTitle.test(html) ? '' : null;
            if (page.slice(-(handle.length + 1)) !== '/' + handle) return '';
            return meta(S.imageMeta);
          });
        })
        .catch(function () {
          return null;
        });
    }

    function tick() {
      if (busy) return Promise.resolve('busy');
      busy = true;
      var end = now() + BATCH_MS;
      return Promise.all([load(), previewRule()])
        .then(function (r) {
          var s = r[0];
          if (!r[1]) return 'no preview rule: ' + (ruleError || (chrome.declarativeNetRequest ? 'no selectors' : 'declarativeNetRequest missing'));
          if (now() < s.pauseUntil) return 'paused';
          var hour = Math.floor(now() / 3600000);
          if (s.hour !== hour) {
            s.hour = hour;
            s.count = 0;
          }
          return api('facesNeeded', {}).then(function (res) {
            var queue = (res && Array.isArray(res.handles) ? res.handles : []).filter(function (h) {
              return /^[a-z0-9._]{1,30}$/.test(h);
            });
            if (!queue.length) {
              s.pauseUntil = now() + IDLE_MS;
              s.note = 'Every chat has a picture or has been checked.';
              return save(s).then(function () {
                return 'nothing to do';
              });
            }
            var misses = 0;
            var stopped = false;
            function next() {
              if (stopped) return Promise.resolve('stopped');
              if (!queue.length || now() > end || s.count >= PER_HOUR) return save(s).then(function () { return 'batch done'; });
              var handle = queue.shift();
              s.count++;
              return lookup(handle).then(function (url) {
                if (url === null) {
                  misses++;
                  if (misses >= 3) {
                    stopped = true;
                    s.pauseUntil = now() + BACKOFF_MS;
                    s.note = 'Instagram stopped answering for now. Picture lookups resume in 30 minutes.';
                    return save(s).then(function () { return 'backing off'; });
                  }
                  return wait(GAP_MS).then(next);
                }
                misses = 0;
                s.done++;
                s.note = '';
                return api('faceResult', { handle: handle, url: url })
                  .catch(function () {})
                  .then(function () {
                    return wait(GAP_MS);
                  })
                  .then(next);
              });
            }
            // Three readers side by side, each with its own pause between profiles.
            return Promise.all([next(), wait(300).then(next), wait(600).then(next)]).then(function (outs) {
              return save(s).then(function () {
                return outs.indexOf('backing off') >= 0 ? 'backing off' : 'batch done';
              });
            });
          });
        })
        .catch(function (err) {
          return 'failed: ' + (err && err.message ? err.message : String(err));
        })
        .then(function (out) {
          busy = false;
          // Kept so the app can show what the picture reader last did.
          return chrome.storage.local.set({ facesLast: { out: String(out).slice(0, 200), at: now() } }).then(function () {
            return out;
          }, function () {
            return out;
          });
        });
    }

    function init() {
      return chrome.alarms.get(ALARM).then(function (a) {
        if (!a) return chrome.alarms.create(ALARM, { periodInMinutes: 0.5 });
        return null;
      });
    }

    function onAlarm(alarm) {
      return alarm && alarm.name === ALARM ? tick() : Promise.resolve('ignored');
    }

    // The app asked for pictures now (new chats just loaded): clear any idle wait and start at once.
    function wake() {
      return load()
        .then(function (s) {
          if (s.note.indexOf('stopped answering') < 0) s.pauseUntil = 0;
          return save(s);
        })
        .then(tick);
    }

    function status() {
      return Promise.all([load(), chrome.storage.local.get('facesLast')]).then(function (r) {
        var last = (r[1] && r[1].facesLast) || null;
        return { done: r[0].done, pausedUntil: r[0].pauseUntil, note: r[0].note, last: last ? last.out : '', lastAt: last ? last.at : 0 };
      });
    }

    return { tick: tick, init: init, onAlarm: onAlarm, wake: wake, status: status, lookup: lookup };
  }

  root.AIDMFaces = { createFaces: createFaces, ALARM: ALARM };
})(typeof self !== 'undefined' ? self : this);
