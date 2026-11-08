/*
 * core.js
 * Pure logic with no DOM and no chrome.* calls, so it runs in the content
 * script, in the service worker and under Node for tests.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AIDMCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var LIMITS = Object.freeze({
    CAP_MIN: 1,
    CAP_MAX: 150,
    CAP_DEFAULT: 40,
    PAUSE_MIN_MS: 4000,
    PAUSE_MAX_MS: 9000,
    CHUNK_SIZE: 200,
    MAX_SCROLL_STEPS: 300,
    STABLE_STEPS_FOR_TOP: 2,
    MIN_OVERLAP: 2
  });

  var DEFAULT_SETTINGS = Object.freeze({
    baseUrl: 'https://ainable-setter.vercel.app',
    token: '',
    captureCap: LIMITS.CAP_DEFAULT,
    showPanel: true,
    applyLabels: true,
    skipUnread: true
  });

  var PLATFORMS = ['instagram', 'messenger'];

  /* ---------------------------- errors ---------------------------- */

  function StopError(reason) {
    var e = new Error(reason || 'Stopped by user');
    e.name = 'StopError';
    return e;
  }

  function HaltError(marker) {
    var e = new Error(
      'Halted: the page shows "' + marker + '". Nothing else was done. Check the account in the browser before running again.'
    );
    e.name = 'HaltError';
    e.marker = marker;
    return e;
  }

  /* ---------------------------- settings ---------------------------- */

  function clampCap(value) {
    var n = Math.floor(Number(value));
    if (!isFinite(n)) return LIMITS.CAP_DEFAULT;
    if (n < LIMITS.CAP_MIN) return LIMITS.CAP_MIN;
    if (n > LIMITS.CAP_MAX) return LIMITS.CAP_MAX;
    return n;
  }

  function mergeSettings(stored) {
    var s = stored || {};
    return {
      baseUrl: typeof s.baseUrl === 'string' && s.baseUrl.trim() ? s.baseUrl.trim() : DEFAULT_SETTINGS.baseUrl,
      token: typeof s.token === 'string' ? s.token.trim() : '',
      captureCap: clampCap(s.captureCap === undefined ? DEFAULT_SETTINGS.captureCap : s.captureCap),
      showPanel: s.showPanel === undefined ? DEFAULT_SETTINGS.showPanel : !!s.showPanel,
      applyLabels: s.applyLabels === undefined ? DEFAULT_SETTINGS.applyLabels : !!s.applyLabels,
      skipUnread: s.skipUnread === undefined ? DEFAULT_SETTINGS.skipUnread : !!s.skipUnread
    };
  }

  /* ---------------------------- pacing ---------------------------- */

  // Random pause in milliseconds. The 4 second floor is hard: a caller cannot
  // ask for anything faster.
  function randomPause(rng, min, max) {
    var lo = Math.max(LIMITS.PAUSE_MIN_MS, Number(min) || LIMITS.PAUSE_MIN_MS);
    var hi = Math.max(lo, Number(max) || LIMITS.PAUSE_MAX_MS);
    var r = (typeof rng === 'function' ? rng : Math.random)();
    if (!(r >= 0)) r = 0;
    if (r > 1) r = 1;
    return Math.round(lo + r * (hi - lo));
  }

  function createStopToken() {
    var listeners = [];
    var token = {
      stopped: false,
      reason: null,
      stop: function (reason) {
        if (token.stopped) return;
        token.stopped = true;
        token.reason = reason || 'Stopped by user';
        var copy = listeners.slice();
        listeners.length = 0;
        copy.forEach(function (fn) {
          try {
            fn();
          } catch (e) {
            /* listener errors must not block the stop */
          }
        });
      },
      onStop: function (fn) {
        if (token.stopped) {
          fn();
          return function () {};
        }
        listeners.push(fn);
        return function () {
          var i = listeners.indexOf(fn);
          if (i >= 0) listeners.splice(i, 1);
        };
      },
      throwIfStopped: function () {
        if (token.stopped) throw StopError(token.reason);
      }
    };
    return token;
  }

  // Sleep that rejects with StopError the moment the token is stopped.
  function sleep(ms, token) {
    return new Promise(function (resolve, reject) {
      if (token && token.stopped) return reject(StopError(token.reason));
      var off = null;
      var id = setTimeout(function () {
        if (off) off();
        resolve();
      }, ms);
      if (token) {
        off = token.onStop(function () {
          clearTimeout(id);
          reject(StopError(token.reason));
        });
      }
    });
  }

  /* ---------------------------- text and ids ---------------------------- */

  function normaliseText(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/\r\n?/g, '\n')
      .replace(/[\u00a0\u202f\u2007]/g, ' ')
      .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
      .split('\n')
      .map(function (line) {
        return line.replace(/[ \t]+/g, ' ').trim();
      })
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function foldText(value) {
    return normaliseText(value).replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').toLowerCase();
  }

  // FNV-1a, 32 bit, hex. Stable across runs and machines.
  function hashString(value) {
    var s = String(value);
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('00000000' + h.toString(16)).slice(-8);
  }

  function instagramThreadIdFromUrl(url) {
    var m = /\/direct\/t\/([^/?#]+)/.exec(String(url || ''));
    return m ? decodeURIComponent(m[1]) : null;
  }

  function queryParamFromUrl(url, names) {
    try {
      var u = new URL(String(url));
      for (var i = 0; i < names.length; i++) {
        var v = u.searchParams.get(names[i]);
        if (v) return v;
      }
    } catch (e) {
      /* not a URL */
    }
    return null;
  }

  function cleanHandle(value) {
    if (!value) return null;
    var h = String(value).trim().replace(/^@/, '').toLowerCase();
    return /^[a-z0-9._]{1,30}$/.test(h) ? h : null;
  }

  // Handle from a profile link such as /some.handle/ or https://www.instagram.com/some.handle
  function handleFromProfileHref(href) {
    if (!href) return null;
    var path = String(href);
    try {
      path = new URL(path, 'https://www.instagram.com').pathname;
    } catch (e) {
      /* keep as given */
    }
    var first = path.split('/').filter(Boolean)[0];
    var reserved = ['direct', 'explore', 'reels', 'p', 'accounts', 'stories', 'reel', 'tv'];
    if (!first || reserved.indexOf(first.toLowerCase()) >= 0) return null;
    return cleanHandle(first);
  }

  // externalId rule from the API contract: the thread id from the URL when there
  // is one, else a stable hash of the handle, else a stable hash of the name.
  function stableExternalId(input) {
    var urlId = input && input.urlId ? String(input.urlId).trim() : '';
    if (urlId) return urlId;
    var handle = cleanHandle(input && input.handle);
    if (handle) return 'h_' + hashString('handle:' + handle);
    var name = foldText(input && input.name);
    if (name) return 'n_' + hashString('name:' + name);
    throw new Error('Cannot build a thread id: no id in the URL, no handle and no name.');
  }

  /* ---------------------------- messages ---------------------------- */

  function sameMessage(a, b) {
    return a.direction === b.direction && normaliseText(a.text) === normaliseText(b.text);
  }

  function messageKey(m) {
    return m.direction + '\u0001' + normaliseText(m.text);
  }

  /*
   * De-duplication. Each scroll step yields a snapshot: the messages currently
   * rendered, oldest first. Consecutive snapshots overlap. Instead of dropping
   * "duplicates" by text (which would lose a genuine second "ok"), the snapshot
   * is aligned against what is already collected and only the parts outside the
   * overlap are added.
   *
   * Returns { messages, added, gap }. gap is true when no alignment was found,
   * in which case the snapshot is kept as older history and the caller must
   * treat the capture as incomplete.
   */
  function mergeSnapshots(acc, snap) {
    acc = acc || [];
    snap = snap || [];
    if (!snap.length) return { messages: acc.slice(), added: 0, gap: false };
    if (!acc.length) return { messages: snap.map(cloneMessage), added: snap.length, gap: false };

    var need = Math.min(LIMITS.MIN_OVERLAP, snap.length, acc.length);
    var best = null;
    // d is the index in acc where snap[0] lands. Negative means snap starts earlier.
    for (var d = -(snap.length - 1); d <= acc.length - 1; d++) {
      var from = Math.max(0, d);
      var to = Math.min(acc.length, d + snap.length);
      var overlap = to - from;
      if (overlap < need) continue;
      if (best && overlap <= best.overlap) continue;
      var ok = true;
      for (var j = from; j < to; j++) {
        if (!sameMessage(acc[j], snap[j - d])) {
          ok = false;
          break;
        }
      }
      if (ok) best = { d: d, overlap: overlap };
    }

    if (!best) {
      return { messages: snap.map(cloneMessage).concat(acc), added: snap.length, gap: true };
    }

    var older = best.d < 0 ? snap.slice(0, -best.d).map(cloneMessage) : [];
    var tailStart = acc.length - best.d;
    var newer = tailStart < snap.length ? snap.slice(tailStart).map(cloneMessage) : [];
    var middle = acc.map(function (m, j) {
      var s = snap[j - best.d];
      if (!s) return m;
      // Keep whichever copy carries a timestamp.
      return m.sentAt ? m : { direction: m.direction, text: m.text, sentAt: s.sentAt || null };
    });
    return { messages: older.concat(middle, newer), added: older.length + newer.length, gap: false };
  }

  function cloneMessage(m) {
    return { direction: m.direction, text: m.text, sentAt: m.sentAt || null };
  }

  // Drops empty or malformed entries and assigns order, oldest first.
  function finaliseMessages(list) {
    var out = [];
    (list || []).forEach(function (m) {
      if (!m || (m.direction !== 'in' && m.direction !== 'out')) return;
      var text = normaliseText(m.text);
      if (!text) return;
      out.push({ direction: m.direction, text: text, sentAt: m.sentAt || null, order: out.length });
    });
    return out;
  }

  function chunk(list, size) {
    var n = Math.floor(Number(size));
    if (!(n >= 1)) throw new Error('chunk size must be 1 or more');
    var out = [];
    for (var i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
    return out;
  }

  /*
   * Builds the POST /api/ext/ingest bodies. Messages go in chunks of 200 with
   * order preserved across chunks. complete is true only on the LAST chunk and
   * only when the capture reached the start of the thread without gaps.
   */
  function buildIngestPayloads(input) {
    var messages = finaliseMessages(input.messages);
    var size = input.chunkSize || LIMITS.CHUNK_SIZE;
    var thread = {
      externalId: String(input.thread.externalId),
      name: String(input.thread.name || ''),
      handle: input.thread.handle || null,
      avatar: input.thread.avatar || null,
      url: String(input.thread.url || '')
    };
    var parts = chunk(messages, size);
    return parts.map(function (part, i) {
      return {
        platform: input.platform,
        thread: thread,
        messages: part,
        complete: !!input.complete && i === parts.length - 1
      };
    });
  }

  // Returns null when the body matches the contract, else a description of the problem.
  function validateIngestBody(body) {
    if (!body || typeof body !== 'object') return 'body is not an object';
    if (PLATFORMS.indexOf(body.platform) < 0) return 'platform must be instagram or messenger';
    var t = body.thread;
    if (!t || typeof t.externalId !== 'string' || !t.externalId) return 'thread.externalId is missing';
    if (typeof t.name !== 'string') return 'thread.name is missing';
    if (!(t.handle === null || typeof t.handle === 'string')) return 'thread.handle must be a string or null';
    if (typeof t.url !== 'string') return 'thread.url is missing';
    if (!Array.isArray(body.messages)) return 'messages is not an array';
    if (body.messages.length > LIMITS.CHUNK_SIZE) return 'more than ' + LIMITS.CHUNK_SIZE + ' messages in one request';
    for (var i = 0; i < body.messages.length; i++) {
      var m = body.messages[i];
      if (!m || (m.direction !== 'in' && m.direction !== 'out')) return 'messages[' + i + '].direction is invalid';
      if (typeof m.text !== 'string' || !m.text) return 'messages[' + i + '].text is empty';
      if (!(m.sentAt === null || typeof m.sentAt === 'string')) return 'messages[' + i + '].sentAt is invalid';
      if (typeof m.order !== 'number') return 'messages[' + i + '].order is missing';
    }
    if (typeof body.complete !== 'boolean') return 'complete must be a boolean';
    return null;
  }

  /* ---------------------------- halt detection ---------------------------- */

  function detectHalt(text, markers) {
    var t = foldText(text);
    if (!t) return null;
    for (var i = 0; i < markers.length; i++) {
      if (t.indexOf(foldText(markers[i])) >= 0) return markers[i];
    }
    return null;
  }

  function detectHaltUrl(url, parts) {
    var u = String(url || '').toLowerCase();
    for (var i = 0; i < parts.length; i++) {
      if (u.indexOf(String(parts[i]).toLowerCase()) >= 0) return parts[i];
    }
    return null;
  }

  /* ---------------------------- timestamps ---------------------------- */

  var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  var DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

  function parseClock(s) {
    var m = /(\d{1,2})[:.](\d{2})(?::\d{2})?\s*([ap])\.?\s?m\b\.?/i.exec(s);
    if (!m) m = /(\d{1,2}):(\d{2})/.exec(s);
    if (!m) return null;
    var h = Number(m[1]);
    var min = Number(m[2]);
    var ap = m[3] ? m[3].toLowerCase() : null;
    if (ap && (h < 1 || h > 12)) return null;
    if (ap === 'p' && h < 12) h += 12;
    if (ap === 'a' && h === 12) h = 0;
    if (h > 23 || min > 59) return null;
    return { h: h, min: min };
  }

  /*
   * Turns whatever the DOM exposes into an ISO string, or null when the value
   * cannot be read with confidence. Ambiguous numeric dates such as 03/04/2026
   * return null on purpose. `now` is injectable for tests.
   */
  function parseTimestamp(raw, now) {
    if (raw === null || raw === undefined) return null;
    var s0 = String(raw).replace(/[\u00a0\u202f]/g, ' ').trim();
    if (!s0) return null;
    now = now instanceof Date ? now : new Date();

    if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}.*)?$/.test(s0)) {
      var iso = new Date(s0);
      return isNaN(iso.getTime()) ? null : iso.toISOString();
    }
    if (/^\d{13}$/.test(s0)) return new Date(Number(s0)).toISOString();
    if (/^\d{10}$/.test(s0)) return new Date(Number(s0) * 1000).toISOString();

    var s = s0.toLowerCase();
    var clock = parseClock(s);
    var base = null;
    var midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (/\btoday\b/.test(s)) {
      base = midnight;
    } else if (/\byesterday\b/.test(s)) {
      base = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    } else {
      var mm = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?/.exec(s);
      if (mm) {
        var month = MONTHS.indexOf(mm[1]);
        var before = /(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/.exec(s);
        var after = /(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b(?![:.]\d)/.exec(s);
        var day = before ? Number(before[1]) : after ? Number(after[1]) : null;
        if (!day || day > 31) return null;
        var ym = /\b(20\d{2})\b/.exec(s);
        var year = ym ? Number(ym[1]) : now.getFullYear();
        base = new Date(year, month, day);
        if (base.getMonth() !== month) return null;
        if (!ym && base.getTime() > now.getTime() + 86400000) base = new Date(year - 1, month, day);
      } else {
        var dm = /\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/.exec(s);
        if (dm) {
          var diff = (now.getDay() - DAYS.indexOf(dm[1]) + 7) % 7;
          if (diff === 0) diff = 7;
          base = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
        } else if (clock && /^\d{1,2}[:.]\d{2}(:\d{2})?\s*([ap]\.?\s?m\.?)?$/.test(s)) {
          base = midnight;
        }
      }
    }

    if (!base) return null;
    var out = new Date(base.getFullYear(), base.getMonth(), base.getDate(), clock ? clock.h : 0, clock ? clock.min : 0);
    return isNaN(out.getTime()) ? null : out.toISOString();
  }

  /* ---------------------------- labels ---------------------------- */

  // Labels wanted but not yet applied. Case-insensitive, keeps the wanted spelling.
  function missingLabels(wanted, applied) {
    var have = {};
    (applied || []).forEach(function (l) {
      have[foldText(l)] = true;
    });
    var seen = {};
    var out = [];
    (wanted || []).forEach(function (l) {
      var k = foldText(l);
      if (!k || have[k] || seen[k]) return;
      seen[k] = true;
      out.push(normaliseText(l));
    });
    return out;
  }

  // Returns null when a label queue item is usable, else the reason it is not.
  function validateQueueItem(item) {
    if (!item || typeof item !== 'object') return 'item is not an object';
    if (typeof item.id !== 'string' || !item.id) return 'item.id is missing';
    if (typeof item.name !== 'string' || !normaliseText(item.name)) return 'item.name is empty';
    if (!Array.isArray(item.labels) || !item.labels.length) return 'item.labels is empty';
    for (var i = 0; i < item.labels.length; i++) {
      var l = item.labels[i];
      if (typeof l !== 'string' || !normaliseText(l)) return 'item.labels[' + i + '] is empty';
      if (l.length > 100) return 'item.labels[' + i + '] is longer than 100 characters';
    }
    return null;
  }

  return {
    LIMITS: LIMITS,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    PLATFORMS: PLATFORMS,
    StopError: StopError,
    HaltError: HaltError,
    clampCap: clampCap,
    mergeSettings: mergeSettings,
    randomPause: randomPause,
    createStopToken: createStopToken,
    sleep: sleep,
    normaliseText: normaliseText,
    foldText: foldText,
    hashString: hashString,
    instagramThreadIdFromUrl: instagramThreadIdFromUrl,
    queryParamFromUrl: queryParamFromUrl,
    cleanHandle: cleanHandle,
    handleFromProfileHref: handleFromProfileHref,
    stableExternalId: stableExternalId,
    sameMessage: sameMessage,
    messageKey: messageKey,
    mergeSnapshots: mergeSnapshots,
    finaliseMessages: finaliseMessages,
    chunk: chunk,
    buildIngestPayloads: buildIngestPayloads,
    validateIngestBody: validateIngestBody,
    detectHalt: detectHalt,
    detectHaltUrl: detectHaltUrl,
    parseTimestamp: parseTimestamp,
    missingLabels: missingLabels,
    validateQueueItem: validateQueueItem
  };
});
