/*
 * dom.js
 * Selector resolution, the guarded click helper, text insertion, halt
 * detection and the selector health check. Reads the rendered DOM only.
 * It never intercepts network traffic and never calls a Meta endpoint.
 *
 * Safety rules enforced here:
 *   - safeClick is the only function in the extension that clicks anything,
 *     and it refuses to click a send control.
 *   - No keyboard events are ever dispatched, so Enter can never be simulated.
 */
(function () {
  'use strict';
  var AIDM = (globalThis.AIDM = globalThis.AIDM || {});
  if (AIDM.dom) return;

  var SEL = globalThis.AIDM_SELECTORS;
  var Core = globalThis.AIDMCore;

  function SelectorMiss(siteKey, key) {
    var t = SEL[siteKey] && SEL[siteKey].targets[key];
    var e = new Error(
      'Selector miss: ' + siteKey + '.' + key + (t ? ' (' + t.desc + ')' : '') +
        '. Nothing was clicked. Run "Selector health check" in the popup, then fix src/selectors.js.'
    );
    e.name = 'SelectorMiss';
    e.selectorKey = siteKey + '.' + key;
    return e;
  }

  function SafetyError(message) {
    var e = new Error(message);
    e.name = 'SafetyError';
    return e;
  }

  /* ---------------------------- site ---------------------------- */

  // Returns "instagram", "businessSuite" or null. The extension is inert on
  // every other page of these two hosts.
  function site() {
    if (AIDM.siteOverride) return AIDM.siteOverride; // test fixtures only
    var host = location.hostname;
    var path = location.pathname;
    if (host === 'www.instagram.com' && /^\/direct(\/|$)/.test(path)) return 'instagram';
    if (host === 'business.facebook.com' && /\/inbox(\/|$)/.test(path)) return 'businessSuite';
    return null;
  }

  function getTarget(siteKey, key) {
    var t = SEL[siteKey] && SEL[siteKey].targets && SEL[siteKey].targets[key];
    if (!t) throw new Error('Unknown selector target: ' + siteKey + '.' + key);
    return t;
  }

  function markers(siteKey, key) {
    var m = SEL[siteKey] && SEL[siteKey].markers && SEL[siteKey].markers[key];
    if (!m) throw new Error('Unknown marker: ' + siteKey + '.' + key);
    return m;
  }

  /* ---------------------------- queries ---------------------------- */

  function q(root, css) {
    try {
      return Array.prototype.slice.call(root.querySelectorAll(css));
    } catch (e) {
      return [];
    }
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    if (typeof el.checkVisibility === 'function') {
      try {
        if (!el.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true })) return false;
      } catch (e) {
        /* fall through to the rect check */
      }
    }
    return el.getClientRects().length > 0;
  }

  function textOf(el) {
    if (!el) return '';
    var t = typeof el.innerText === 'string' ? el.innerText : el.textContent;
    return Core.normaliseText(t || '');
  }

  function matchesText(el, values, mode) {
    var t = Core.foldText(textOf(el));
    if (!t) return false;
    return values.some(function (v) {
      var want = Core.foldText(v);
      if (mode === 'startsWith') return t.indexOf(want) === 0;
      if (mode === 'contains') return t.indexOf(want) >= 0;
      return t === want;
    });
  }

  // Elements matching a text rule. Keeps the innermost matches only.
  function byText(root, rule) {
    var hits = q(root, rule.candidates).filter(function (el) {
      return isVisible(el) && matchesText(el, rule.values, rule.mode || 'exact');
    });
    hits = hits.filter(function (el) {
      return !hits.some(function (other) {
        return other !== el && el.contains(other);
      });
    });
    if (rule.ascend) {
      hits = hits
        .map(function (el) {
          var cur = el;
          for (var i = 0; i < rule.ascend && cur && cur.parentElement; i++) cur = cur.parentElement;
          return cur;
        })
        .filter(Boolean);
    }
    return hits;
  }

  // All visible matches of the first fallback that matches anything.
  function findAll(siteKey, key, root) {
    var t = getTarget(siteKey, key);
    var base = root || document;
    for (var i = 0; i < t.css.length; i++) {
      var els = q(base, t.css[i]).filter(isVisible);
      if (els.length) return els;
    }
    if (t.text) return byText(base, t.text);
    return [];
  }

  function find(siteKey, key, root) {
    return findAll(siteKey, key, root)[0] || null;
  }

  function need(siteKey, key, root) {
    var el = find(siteKey, key, root);
    if (!el) throw SelectorMiss(siteKey, key);
    return el;
  }

  // Polls fn until it returns something truthy. Returns null on timeout.
  function waitFor(fn, timeoutMs, stopToken) {
    var deadline = Date.now() + (timeoutMs || 5000);
    function attempt() {
      if (stopToken) stopToken.throwIfStopped();
      var v = null;
      try {
        v = fn();
      } catch (e) {
        v = null;
      }
      if (v) return Promise.resolve(v);
      if (Date.now() >= deadline) return Promise.resolve(null);
      return Core.sleep(250, stopToken).then(attempt);
    }
    return Promise.resolve().then(attempt);
  }

  /* ---------------------------- guarded click ---------------------------- */

  function accessibleName(el) {
    var label = el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('title'));
    return Core.foldText(label || textOf(el));
  }

  // True when el is, contains or sits inside something that looks like a send control.
  function looksLikeSend(siteKey, el) {
    var sendTexts = SEL.common.markers.sendTexts.map(Core.foldText);
    var t = SEL[siteKey] && SEL[siteKey].targets.sendButton;
    var chain = [];
    for (var cur = el, i = 0; cur && cur.nodeType === 1 && i < 6; cur = cur.parentElement, i++) chain.push(cur);
    for (var k = 0; k < chain.length; k++) {
      var node = chain[k];
      if (sendTexts.indexOf(accessibleName(node)) >= 0) return true;
      if (node.tagName === 'BUTTON' && (node.getAttribute('type') || '').toLowerCase() === 'submit') return true;
      if (node.tagName === 'INPUT' && (node.type === 'submit' || node.type === 'image')) return true;
      if (t) {
        for (var c = 0; c < t.css.length; c++) {
          try {
            if (node.matches(t.css[c])) return true;
          } catch (e) {
            /* invalid selector, ignore */
          }
        }
      }
    }
    if (t) {
      for (var d = 0; d < t.css.length; d++) {
        if (q(el, t.css[d]).length) return true;
      }
    }
    return false;
  }

  // The single click path of the extension. `what` is a short description used
  // in error messages, for example "conversation row".
  function safeClick(siteKey, el, what) {
    if (!el || el.nodeType !== 1) throw SafetyError('Refusing to click: no element for ' + what + '.');
    if (!isVisible(el)) throw SafetyError('Refusing to click: ' + what + ' is not visible.');
    if (looksLikeSend(siteKey, el)) {
      throw SafetyError('Refusing to click ' + what + ': it looks like a send control. The extension never sends.');
    }
    el.click();
  }

  /* ---------------------------- text entry ---------------------------- */

  function editableText(el) {
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return Core.normaliseText(el.value);
    return textOf(el);
  }

  // Sets the value of an <input> or <textarea> in a way React-style pages notice.
  function setInputValue(el, value) {
    var proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    var desc = Object.getOwnPropertyDescriptor(proto, 'value');
    el.focus();
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /*
   * Puts text into the composer and stops. It does not press Enter, does not
   * dispatch any keyboard event and does not touch the send control.
   * Refuses when the composer already holds text, so nothing is overwritten.
   * Resolves true when the text is confirmed present, false otherwise.
   */
  function insertIntoComposer(el, text) {
    var wanted = Core.foldText(text);
    function present() {
      return Core.foldText(editableText(el)).indexOf(wanted) >= 0;
    }
    if (editableText(el)) {
      return Promise.reject(SafetyError('The composer already has text. Clear it first, then press Insert again.'));
    }
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      setInputValue(el, text);
      return waitFor(present, 1500).then(Boolean);
    }
    el.focus();
    try {
      var range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e) {
      /* caret placement is best effort */
    }
    try {
      document.execCommand('insertText', false, text);
    } catch (e) {
      /* fall through to the paste path */
    }
    return waitFor(present, 1200).then(function (ok) {
      if (ok) return true;
      if (editableText(el)) return false; // something partial landed, do not add more
      try {
        var dt = new DataTransfer();
        dt.setData('text/plain', text);
        el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      } catch (e) {
        return false;
      }
      return waitFor(present, 1500).then(Boolean);
    });
  }

  /* ---------------------------- halt detection ---------------------------- */

  function insideAny(node, roots) {
    for (var i = 0; i < roots.length; i++) {
      if (roots[i] && roots[i].contains(node)) return true;
    }
    return false;
  }

  /*
   * Returns the marker that should halt a run, or null. Looks at the URL, the
   * login form selector and the visible page text. Text inside the message
   * list, the thread list and the composer is ignored, so a prospect writing
   * "try again later" does not halt anything.
   */
  function haltMarker(siteKey) {
    var common = SEL.common.markers;
    var urlHit = Core.detectHaltUrl(location.pathname + location.search, common.haltUrlParts);
    if (urlHit) return 'URL contains ' + urlHit;

    if (find(siteKey, 'loginForm')) return 'login form';

    var exclude = [find(siteKey, 'messageList'), find(siteKey, 'threadList'), find(siteKey, 'composer')];
    var host = document.getElementById('aidm-setter-root');
    if (host) exclude.push(host);

    var folded = common.haltTexts.map(Core.foldText);
    var walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      var raw = node.nodeValue;
      if (!raw || raw.length < 8) continue;
      var parent = node.parentElement;
      if (!parent) continue;
      var tag = parent.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEMPLATE') continue;
      var text = Core.foldText(raw);
      var hit = null;
      for (var i = 0; i < folded.length; i++) {
        if (text.indexOf(folded[i]) >= 0) {
          hit = common.haltTexts[i];
          break;
        }
      }
      if (!hit) continue;
      if (insideAny(parent, exclude)) continue;
      if (!isVisible(parent)) continue;
      return hit;
    }
    return null;
  }

  function checkHalt(siteKey) {
    var marker = haltMarker(siteKey);
    if (marker) throw Core.HaltError(marker);
  }

  /* ---------------------------- health check ---------------------------- */

  // Runs every selector of the current site and reports what it found.
  function healthCheck(siteKey) {
    var targets = SEL[siteKey].targets;
    var results = Object.keys(targets).map(function (key) {
      var t = targets[key];
      var roots = [document];
      var scopeFound = true;
      if (t.scope) {
        roots = findAll(siteKey, t.scope).slice(0, 40);
        scopeFound = roots.length > 0;
      }
      var rows = t.css.map(function (css) {
        var count = 0;
        roots.forEach(function (r) {
          count += q(r, css).filter(isVisible).length;
        });
        return { selector: css, count: count };
      });
      if (t.text) {
        var n = 0;
        roots.forEach(function (r) {
          n += byText(r, t.text).length;
        });
        rows.push({ selector: 'text ' + (t.text.mode || 'exact') + ': ' + t.text.values.join(' | '), count: n });
      }
      return {
        key: siteKey + '.' + key,
        desc: t.desc,
        scope: t.scope || null,
        scopeFound: scopeFound,
        optional: !!t.optional,
        expectAbsent: !!t.expectAbsent,
        transient: !!t.transient,
        found: rows.some(function (r) {
          return r.count > 0;
        }),
        selectors: rows
      };
    });
    return { site: siteKey, path: location.pathname, halt: haltMarker(siteKey), results: results };
  }

  /* ---------------------------- background bridge ---------------------------- */

  // Sends a message to the service worker. Resolves with data or rejects with
  // an Error carrying the worker's message.
  function bg(message) {
    return new Promise(function (resolve, reject) {
      try {
        chrome.runtime.sendMessage(message, function (res) {
          var lastError = chrome.runtime.lastError;
          if (lastError) return reject(new Error('Extension background is not reachable (' + lastError.message + '). Reload this page.'));
          if (!res) return reject(new Error('Extension background gave no answer. Reload this page.'));
          if (!res.ok) {
            var e = new Error(res.error || 'Unknown error');
            e.code = res.code || null;
            e.status = res.status || null;
            return reject(e);
          }
          resolve(res.data);
        });
      } catch (err) {
        reject(new Error('The extension was reloaded or removed. Refresh this page.'));
      }
    });
  }

  function api(call, arg) {
    return bg({ type: 'aidm:api', call: call, arg: arg });
  }

  AIDM.dom = {
    SelectorMiss: SelectorMiss,
    SafetyError: SafetyError,
    site: site,
    getTarget: getTarget,
    markers: markers,
    q: q,
    isVisible: isVisible,
    textOf: textOf,
    findAll: findAll,
    find: find,
    need: need,
    waitFor: waitFor,
    looksLikeSend: looksLikeSend,
    safeClick: safeClick,
    setInputValue: setInputValue,
    editableText: editableText,
    insertIntoComposer: insertIntoComposer,
    haltMarker: haltMarker,
    checkHalt: checkHalt,
    healthCheck: healthCheck
  };
  AIDM.bg = bg;
  AIDM.api = api;
})();
