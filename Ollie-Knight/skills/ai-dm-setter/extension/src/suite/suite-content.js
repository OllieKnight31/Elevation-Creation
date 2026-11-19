/*
 * suite-content.js
 *
 * THE ONLY FILE THAT CAN SEND A MESSAGE INSIDE META BUSINESS SUITE.
 *
 * It is for inbox messages Meta's official connection will not take (more than
 * 24 hours since the lead last wrote, or a lead who never wrote). It runs on
 * business.facebook.com only and refuses to do anything on instagram.com.
 *
 * It is not listed in the manifest. The service worker (suite-runner.js)
 * injects it into one tab only: the Business Suite tab that the extension
 * itself created. It holds no logic about WHAT to send, WHEN, or WHETHER the
 * open conversation is the right one. It answers small commands, one at a time:
 *   probe            what the page shows: warning, inbox list, search box
 *   rows             the conversation entries now listed (title and text)
 *   search           put a word in the inbox search box
 *   open-row         open ONE listed entry, only if its title is still the same
 *   thread           the open conversation: header name, username, platform,
 *                    the last messages, the reply box
 *   focus-composer   put the caret at the end of the reply box
 *   step             apply ONE typing step (insert a character or backspace)
 *   read-composer    current reply box text
 *   clear-composer   empty the reply box
 *   send             press the send control, only if the box holds exactly `expect`
 *
 * It builds no keyboard events at all: send is the send control or nothing.
 * All waiting happens in the service worker. No network code. Every selector
 * comes from src/selectors.js.
 */
(function () {
  'use strict';
  var AIDM = (globalThis.AIDM = globalThis.AIDM || {});
  if (AIDM.suite) return;

  var SEL = globalThis.AIDM_SELECTORS;
  var Core = globalThis.AIDMCore;
  var Typing = globalThis.AIDMTyping;
  var dom = AIDM.dom;

  var SITE = 'businessSuite';
  var PANEL_ID = 'aidm-setter-root';
  var HOST = 'business.facebook.com';

  function allowedHere() {
    if (AIDM.siteOverride === SITE) return true; // test fixtures only
    return location.hostname === HOST;
  }

  function fail(message, code) {
    var e = new Error(message);
    e.code = code || null;
    return e;
  }

  function list(value, fallback) {
    return Array.isArray(value) && value.length ? value : fallback;
  }

  function firstLine(text) {
    return String(text || '').split('\n')[0].trim();
  }

  /* ---------------------------- warnings ---------------------------- */

  // First marker found in visible page text outside the given elements.
  function pageTextHit(markers, exclude) {
    var folded = markers.map(Core.foldText);
    var walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      var raw = node.nodeValue;
      if (!raw || raw.length < 4) continue;
      var parent = node.parentElement;
      if (!parent) continue;
      var tag = parent.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEMPLATE') continue;
      var text = Core.foldText(raw);
      var hit = null;
      for (var i = 0; i < folded.length; i++) {
        if (folded[i] && text.indexOf(folded[i]) >= 0) {
          hit = markers[i];
          break;
        }
      }
      if (!hit) continue;
      var skip = false;
      for (var k = 0; k < exclude.length; k++) {
        if (exclude[k] && exclude[k].contains(parent)) skip = true;
      }
      if (skip || !dom.isVisible(parent)) continue;
      return hit;
    }
    return null;
  }

  // Text written by leads (the conversation column, the messages) and by this
  // sender (the reply box) never counts as a warning.
  function quietZones() {
    return [dom.find(SITE, 'messageList'), dom.find(SITE, 'threadList'), dom.find(SITE, 'composer'), document.getElementById(PANEL_ID)];
  }

  /*
   * A short description of the warning on the page, or null. Checks the URL
   * (a login or checkpoint redirect), a login form, open dialogs, then the
   * rest of the visible page.
   */
  function blockSignal(detect) {
    var d = detect || {};
    var common = SEL.common.markers;
    var phrases = list(d.phrases, []).concat(common.haltTexts);
    var urlParts = list(d.urlParts, []).concat(common.haltUrlParts);

    var urlHit = Core.detectHaltUrl(location.pathname + location.search, urlParts);
    if (urlHit) return 'URL contains ' + urlHit;
    if (dom.find(SITE, 'loginForm')) return 'login form';

    var dialogs = dom.findAll(SITE, 'dialog');
    for (var i = 0; i < dialogs.length; i++) {
      var hit = Core.detectHalt(dom.textOf(dialogs[i]), phrases);
      if (hit) return 'dialog shows "' + hit + '"';
    }
    var pageHit = pageTextHit(phrases, quietZones());
    return pageHit ? 'page shows "' + pageHit + '"' : null;
  }

  /* ---------------------------- the inbox list ---------------------------- */

  function isField(el) {
    return el.tagName === 'TEXTAREA' || el.tagName === 'INPUT';
  }

  function composerText(el) {
    if (!el) return '';
    var raw = isField(el) ? el.value : typeof el.innerText === 'string' ? el.innerText : el.textContent;
    return Typing.canonical(raw || '');
  }

  function rowEls() {
    var listEl = dom.find(SITE, 'threadList');
    return listEl ? dom.findAll(SITE, 'threadRow', listEl) : [];
  }

  function rowTitle(row) {
    return firstLine(dom.textOf(dom.find(SITE, 'threadRowTitle', row)));
  }

  function probe(msg) {
    var composer = dom.find(SITE, 'composer');
    return {
      ok: true,
      url: location.href,
      path: location.pathname,
      onInbox: /\/inbox(\/|$)/.test(location.pathname) || AIDM.siteOverride === SITE,
      block: blockSignal(msg.detect),
      list: !!dom.find(SITE, 'threadList'),
      rows: rowEls().length,
      search: !!dom.find(SITE, 'threadSearchInput'),
      composer: !!composer,
      composerText: composerText(composer)
    };
  }

  function rows(msg) {
    var els = rowEls().slice(0, 30);
    return {
      ok: true,
      block: blockSignal(msg.detect),
      noResults: pageTextHit(dom.markers(SITE, 'noResultsTexts'), [dom.find(SITE, 'messageList'), dom.find(SITE, 'composer'), document.getElementById(PANEL_ID)]),
      rows: els.map(function (row, i) {
        return { index: i, title: rowTitle(row), text: dom.textOf(row).replace(/\n+/g, ' | ').slice(0, 160) };
      })
    };
  }

  // Puts a word in the inbox search box, the same way the label sync does.
  function search(msg) {
    var term = String(msg.term || '').trim();
    if (!term) throw fail('A search arrived without a word to search for.', 'BAD_SEARCH');
    var input = dom.need(SITE, 'threadSearchInput');
    dom.setInputValue(input, term);
    return { ok: true, value: String(input.value || '') };
  }

  /*
   * Opens one listed conversation through the guarded click helper, which
   * refuses anything that looks like a send control. The entry is only opened
   * when its title is still the one the service worker chose, so a list that
   * moved in the meantime cannot lead to a different person.
   */
  function openRow(msg) {
    var row = rowEls()[Number(msg.index)];
    if (!row) throw fail('The conversation entry is no longer in the list. Nothing was clicked.', 'MOVED');
    var title = rowTitle(row);
    if (!title || Core.foldText(title) !== Core.foldText(msg.title || '')) {
      throw fail('The conversation list changed (entry ' + msg.index + ' now reads "' + title.slice(0, 40) + '"). Nothing was clicked.', 'MOVED');
    }
    var target = dom.find(SITE, 'threadRowClickTarget', row) || row;
    dom.safeClick(SITE, target, 'the conversation "' + title.slice(0, 40) + '"');
    return { ok: true, title: title };
  }

  /* ---------------------------- the open conversation ---------------------------- */

  // "instagram", "messenger" or "" when the page does not say.
  function platform() {
    var hints = dom.markers(SITE, 'urlPlatformHints');
    var url = (location.pathname + location.search).toLowerCase();
    function hinted(words) {
      return words.some(function (h) {
        return url.indexOf(h.toLowerCase()) >= 0;
      });
    }
    var ig = hinted(hints.instagram);
    var fb = hinted(hints.messenger);
    if (ig !== fb) return ig ? 'instagram' : 'messenger';
    ig = !!dom.find(SITE, 'platformBadgeInstagram');
    fb = !!dom.find(SITE, 'platformBadgeMessenger');
    if (ig !== fb) return ig ? 'instagram' : 'messenger';
    return '';
  }

  // The username of the open conversation, read from a link to the lead's
  // Instagram profile. Empty when the page shows no such link.
  function threadHandle() {
    var link = dom.find(SITE, 'threadHeaderProfileLink');
    var href = link ? String(link.getAttribute('href') || '') : '';
    if (!/instagram\.com\//i.test(href)) return '';
    return Core.handleFromProfileHref(href) || '';
  }

  // The texts of the last message rows, oldest first, without the small
  // status lines Meta draws under a message.
  function lastTexts(max) {
    var listEl = dom.find(SITE, 'messageList');
    if (!listEl) return { listFound: false, texts: [] };
    var skip = dom.markers(SITE, 'statusTexts').map(Core.foldText);
    var out = [];
    dom.findAll(SITE, 'messageRow', listEl).slice(-(max * 2)).forEach(function (row) {
      dom.findAll(SITE, 'messageText', row).forEach(function (node) {
        var t = Typing.canonical(typeof node.innerText === 'string' ? node.innerText : node.textContent);
        if (!t || skip.indexOf(Core.foldText(t)) >= 0) return;
        if (Core.parseTimestamp(t, new Date())) return; // a time or a date line
        out.push(t);
      });
    });
    return { listFound: true, texts: out.slice(-max) };
  }

  function thread(msg) {
    var composer = dom.find(SITE, 'composer');
    var last = lastTexts(8);
    return {
      ok: true,
      url: location.href,
      block: blockSignal(msg.detect),
      name: firstLine(dom.textOf(dom.find(SITE, 'threadHeaderName'))),
      handle: threadHandle(),
      platform: platform(),
      listFound: last.listFound,
      texts: last.texts,
      composer: !!composer,
      composerText: composerText(composer),
      sendButtons: dom.findAll(SITE, 'sendButton').length,
      cannotReply: pageTextHit(dom.markers(SITE, 'cannotReplyTexts'), [dom.find(SITE, 'messageList'), dom.find(SITE, 'threadList'), composer, document.getElementById(PANEL_ID)])
    };
  }

  /* ---------------------------- reply box editing ---------------------------- */
  // The same edits as the outreach sender makes in its own file, kept apart on
  // purpose: each sender is one file that can be read on its own.

  function needComposer() {
    return dom.need(SITE, 'composer');
  }

  // The place where the next character belongs: the very end of the box. A
  // <br> that closes the content is the editor's stand in for the last line,
  // so the end is just before it.
  function endRange(el) {
    var range = document.createRange();
    var last = el;
    while (last.lastChild) last = last.lastChild;
    if (last !== el && last.nodeType === 1 && last.tagName === 'BR') {
      range.setStartBefore(last);
      range.collapse(true);
    } else {
      range.selectNodeContents(el);
      range.collapse(false);
    }
    return range;
  }

  function holdsBreak(node) {
    if (node.nodeType === 1 && node.tagName === 'BR') return true;
    for (var c = node.firstChild; c; c = c.nextSibling) {
      if (holdsBreak(c)) return true;
    }
    return false;
  }

  function caretAtEnd(el, end) {
    var sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed || !el.contains(sel.anchorNode)) return false;
    var side;
    try {
      side = end.comparePoint(sel.anchorNode, sel.anchorOffset);
    } catch (e) {
      return false;
    }
    if (side === 0) return true;
    if (side > 0) return false;
    var gap = document.createRange();
    gap.setStart(sel.anchorNode, sel.anchorOffset);
    gap.setEnd(end.startContainer, end.startOffset);
    var between = gap.cloneContents();
    return between.textContent === '' && !holdsBreak(between);
  }

  // Keeps the caret at the end of the box. It is only moved when it is
  // somewhere else, so the editor's own selection is left alone while typing.
  function ensureCaret(el, force) {
    if (isField(el)) {
      if (document.activeElement !== el || force || el.selectionStart !== el.value.length || el.selectionEnd !== el.value.length) {
        el.focus();
        el.selectionStart = el.selectionEnd = el.value.length;
      }
      return;
    }
    var end = endRange(el);
    if (!force && document.activeElement === el && caretAtEnd(el, end)) return;
    el.focus();
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(end);
  }

  var COMMANDS = { insertText: 'insertText', insertLineBreak: 'insertLineBreak', deleteContentBackward: 'delete' };

  /*
   * One edit. A beforeinput event goes first: a rich editor cancels it and
   * applies the edit to its own state. When it is left alone, the browser's
   * own edit is carried out with document.execCommand, which changes the text
   * and fires the input event the page reads its new state from. If neither
   * took, that is an error and the caller never guesses. Whatever the path,
   * the service worker compares the whole box with the target before send.
   */
  function edit(el, inputType, data) {
    var ev = new InputEvent('beforeinput', { inputType: inputType, data: data, bubbles: true, cancelable: true, composed: true });
    var untouched = el.dispatchEvent(ev);
    if (!untouched) return 'beforeinput';
    var ok = false;
    try {
      ok = data === null ? document.execCommand(COMMANDS[inputType]) : document.execCommand(COMMANDS[inputType], false, data);
    } catch (e) {
      ok = false;
    }
    if (ok) return 'execCommand';
    throw fail('The reply box took neither a beforeinput event (' + inputType + ') nor execCommand("' + COMMANDS[inputType] + '").', 'NO_INSERT');
  }

  function applyStep(msg) {
    if (msg.op === 'pause') return { ok: true, method: 'none' };
    var el = needComposer();
    ensureCaret(el, false);
    var method;
    if (msg.op === 'back') {
      method = edit(el, 'deleteContentBackward', null);
    } else if (msg.op === 'type') {
      var ch = String(msg.ch || '');
      if (!ch) throw fail('A type step arrived without a character.', 'BAD_STEP');
      method = /^\r?\n$/.test(ch) ? edit(el, 'insertLineBreak', null) : edit(el, 'insertText', ch);
    } else {
      throw fail('Unknown typing step: ' + msg.op, 'BAD_STEP');
    }
    return { ok: true, method: method };
  }

  function focusComposer() {
    var el = needComposer();
    ensureCaret(el, true);
    return { ok: true, text: composerText(el) };
  }

  function readComposer() {
    var el = dom.find(SITE, 'composer');
    return { ok: true, found: !!el, text: composerText(el) };
  }

  function clearComposer() {
    var el = dom.find(SITE, 'composer');
    if (!el) return { ok: true, found: false, text: '' };
    if (!composerText(el)) return { ok: true, found: true, text: '' };
    el.focus();
    if (isField(el)) {
      el.select();
    } else {
      var range = document.createRange();
      range.selectNodeContents(el);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    try {
      edit(el, 'deleteContentBackward', null);
    } catch (e) {
      /* reported through the text below */
    }
    return { ok: true, found: true, text: composerText(el) };
  }

  /* ---------------------------- send ---------------------------- */

  function disabled(el) {
    return el.disabled === true || String(el.getAttribute('aria-disabled') || '').toLowerCase() === 'true';
  }

  /*
   * Presses the send control. Refuses unless the reply box holds exactly the
   * expected text, so a half typed, altered or foreign text can never go out.
   * There is no Enter key path here: with no send control, or more than one
   * match for it, nothing is pressed and the task fails with the selector name.
   */
  function pressSend(msg) {
    var el = needComposer();
    var expect = Typing.canonical(msg.expect || '');
    var have = composerText(el);
    if (!expect) throw fail('Refusing to send: no expected text was given.', 'MISMATCH');
    if (have !== expect) {
      throw fail('Refusing to send: the reply box does not hold the expected text (' + have.length + ' characters, expected ' + expect.length + ').', 'MISMATCH');
    }
    var buttons = dom.findAll(SITE, 'sendButton');
    if (!buttons.length) throw dom.SelectorMiss(SITE, 'sendButton');
    if (buttons.length > 1) throw fail(buttons.length + ' elements match ' + SITE + '.sendButton. Not pressing any of them. Fix src/selectors.js.', 'AMBIGUOUS');
    var button = buttons[0];
    if (disabled(button)) throw fail('Refusing to send: the send control is switched off by the page.', 'DISABLED');
    button.click();
    return { ok: true, method: 'button' };
  }

  /* ---------------------------- commands ---------------------------- */

  function onCommand(msg) {
    if (!allowedHere()) throw fail('The Business Suite sender only runs on ' + HOST + '.', 'WRONG_SITE');
    switch (msg.cmd) {
      case 'probe':
        return probe(msg);
      case 'rows':
        return rows(msg);
      case 'search':
        return search(msg);
      case 'open-row':
        return openRow(msg);
      case 'thread':
        return thread(msg);
      case 'focus-composer':
        return focusComposer();
      case 'step':
        return applyStep(msg);
      case 'read-composer':
        return readComposer();
      case 'clear-composer':
        return clearComposer();
      case 'send':
        return pressSend(msg);
      default:
        throw fail('Unknown Business Suite command: ' + msg.cmd, 'BAD_CMD');
    }
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg || msg.type !== 'aidm:suite') return false;
    if (!sender || sender.id !== chrome.runtime.id) return false;
    if (sender.tab) return false; // only the service worker drives this file
    var res;
    try {
      res = onCommand(msg);
    } catch (err) {
      res = {
        ok: false,
        error: err && err.message ? err.message : String(err),
        code: (err && err.code) || (err && err.name === 'SelectorMiss' ? 'SELECTOR' : err && err.name === 'SafetyError' ? 'SAFETY' : null),
        selectorKey: (err && err.selectorKey) || null
      };
    }
    sendResponse(res);
    return false;
  });

  AIDM.suite = { SITE: SITE, onCommand: onCommand, blockSignal: blockSignal, composerText: composerText };
})();
