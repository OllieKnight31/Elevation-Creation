/*
 * outreach-content.js
 *
 * THE ONLY FILE IN THE EXTENSION THAT CAN SEND A MESSAGE.
 *
 * It is not listed in the manifest. The service worker (outreach-runner.js)
 * injects it into one tab only: the dedicated outreach tab that the extension
 * itself created. The capture, label and panel code never loads it and keeps
 * every one of its own rules (no send click, no keyboard events).
 *
 * It holds no logic of its own about WHAT to send or WHEN. It answers small
 * commands from the service worker, one at a time:
 *   probe            what the page shows: block signal, profile, composer
 *   click-message    click the Message button on the profile (guarded click)
 *   focus-composer   put the caret at the end of the composer
 *   step             apply ONE typing step (insert a character or backspace)
 *   read-composer    current composer text
 *   clear-composer   empty the composer
 *   send             press send, only if the composer holds exactly `expect`
 *   last-bubbles     text of the last rows of the thread, to confirm a send
 *   notice           show or hide the on page notice
 *
 * All waiting happens in the service worker, because timers in a background
 * tab are throttled. Nothing here spoofs visibility or focus state.
 * No network code. Every selector comes from src/selectors.js.
 */
(function () {
  'use strict';
  var AIDM = (globalThis.AIDM = globalThis.AIDM || {});
  if (AIDM.outreach) return;

  var SEL = globalThis.AIDM_SELECTORS;
  var Core = globalThis.AIDMCore;
  var Typing = globalThis.AIDMTyping;
  var dom = AIDM.dom;

  var SITE = 'instagramOutreach';
  var NOTICE_ID = 'aidm-outreach-notice';
  var PANEL_ID = 'aidm-setter-root';

  function allowedHere() {
    if (AIDM.siteOverride === SITE) return true; // test fixtures only
    return location.hostname === 'www.instagram.com';
  }

  function fail(message, code) {
    var e = new Error(message);
    e.code = code || null;
    return e;
  }

  /* ---------------------------- reading ---------------------------- */

  function isField(el) {
    return el.tagName === 'TEXTAREA' || el.tagName === 'INPUT';
  }

  function composerText(el) {
    if (!el) return '';
    var raw = isField(el) ? el.value : typeof el.innerText === 'string' ? el.innerText : el.textContent;
    return Typing.canonical(raw || '');
  }

  function list(value, fallback) {
    return Array.isArray(value) && value.length ? value : fallback;
  }

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

  function ownAndThreadElements() {
    return [
      dom.find(SITE, 'messageList'),
      dom.find(SITE, 'threadList'),
      dom.find(SITE, 'composer'),
      document.getElementById(NOTICE_ID),
      document.getElementById(PANEL_ID)
    ];
  }

  /*
   * Returns a short description of the block signal on the page, or null.
   * Checks, in order: the URL, a login form, the text of open dialogs, the
   * rest of the visible page. Text inside the message list, the conversation
   * column and the composer is ignored, so the message being typed or a
   * prospect's own words cannot trigger it.
   */
  function blockSignal(detect) {
    var d = detect || {};
    var phrases = list(d.phrases, SEL.common.markers.haltTexts);
    var urlParts = list(d.urlParts, SEL.common.markers.haltUrlParts);

    var urlHit = Core.detectHaltUrl(location.href, urlParts);
    if (urlHit) return 'URL contains ' + urlHit;
    if (dom.find(SITE, 'loginForm')) return 'login form';

    var dialogs = dom.findAll(SITE, 'dialog');
    for (var i = 0; i < dialogs.length; i++) {
      if (dialogs[i].id === NOTICE_ID) continue;
      var hit = Core.detectHalt(dom.textOf(dialogs[i]), phrases);
      if (hit) return 'dialog shows "' + hit + '"';
    }
    var pageHit = pageTextHit(phrases, ownAndThreadElements());
    return pageHit ? 'page shows "' + pageHit + '"' : null;
  }

  function readAccount() {
    var link = dom.find(SITE, 'selfProfileLink');
    if (!link) return '';
    return Core.handleFromProfileHref(link.getAttribute('href') || '') || '';
  }

  function readThreadHandle() {
    var link = dom.find(SITE, 'threadHeaderProfileLink');
    if (!link) return '';
    return Core.handleFromProfileHref(link.getAttribute('href') || '') || '';
  }

  function probe(msg) {
    var composer = dom.find(SITE, 'composer');
    return {
      ok: true,
      url: location.href,
      path: location.pathname,
      block: blockSignal(msg.detect),
      notFound: pageTextHit(SEL[SITE].markers.notFoundTexts, ownAndThreadElements()),
      profile: !!dom.find(SITE, 'profileHeader'),
      messageButtons: dom.findAll(SITE, 'messageButton').length,
      composer: !!composer,
      composerText: composerText(composer),
      sendButton: !!dom.find(SITE, 'sendButton'),
      threadHandle: readThreadHandle(),
      account: readAccount()
    };
  }

  /* ---------------------------- the Message button ---------------------------- */

  function clickMessage() {
    var buttons = dom.findAll(SITE, 'messageButton');
    if (!buttons.length) throw dom.SelectorMiss(SITE, 'messageButton');
    if (buttons.length > 1) {
      throw fail(buttons.length + ' elements match ' + SITE + '.messageButton. Not clicking any of them. Fix src/selectors.js.', 'AMBIGUOUS');
    }
    dom.safeClick(SITE, buttons[0], 'the Message button');
    return { ok: true };
  }

  /* ---------------------------- composer editing ---------------------------- */

  function needComposer() {
    return dom.need(SITE, 'composer');
  }

  // The place where the next character belongs: the very end of the composer.
  // A <br> that closes the content is the editor's placeholder for the last
  // line, so the end is just before it, not after it.
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

  // True when the caret is collapsed inside the composer with nothing after it.
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

  // Makes sure the caret sits at the end of the composer. It is only moved
  // when it is somewhere else (the person clicked, or the editor rebuilt its
  // content), so the editor's own selection is left alone while typing.
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
   * One edit, in the same order of events as a real key press.
   *
   * 1. A beforeinput InputEvent is dispatched. A rich editor (Instagram's
   *    composer is a Lexical editor) either cancels it and applies the edit
   *    to its own state, in which case the edit is done, or leaves it alone
   *    because it expects the browser to change the text.
   * 2. When it was left alone, the browser's own edit is carried out with
   *    document.execCommand, which changes the text and fires the trusted
   *    input event the editor then reads its new state from. An untrusted
   *    event never changes text by itself, so step 1 alone is not enough for
   *    a plain editor, and Chrome fires no beforeinput for execCommand, so
   *    the editor never sees the same edit twice.
   * If the editor did not cancel the event and execCommand did nothing, that
   * is an error. The caller never guesses. Whatever the path, the service
   * worker compares the whole composer text with the target before anything
   * can be sent.
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
    throw fail('The composer took neither a beforeinput event (' + inputType + ') nor execCommand("' + COMMANDS[inputType] + '").', 'NO_INSERT');
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

  function key(el, type) {
    el.dispatchEvent(
      new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true, composed: true })
    );
  }

  /*
   * Presses send. Refuses unless the composer holds exactly the expected text,
   * so a half typed, altered or foreign text can never go out.
   * method "button" clicks the send control, "enter" presses Enter in the
   * composer, "auto" uses the button when it is found and Enter otherwise.
   */
  function pressSend(msg) {
    var el = needComposer();
    var expect = Typing.canonical(msg.expect || '');
    var have = composerText(el);
    if (!expect) throw fail('Refusing to send: no expected text was given.', 'MISMATCH');
    if (have !== expect) {
      throw fail('Refusing to send: the composer does not hold the expected text (' + have.length + ' characters, expected ' + expect.length + ').', 'MISMATCH');
    }
    var want = msg.method || 'auto';
    var button = want === 'enter' ? null : dom.find(SITE, 'sendButton');
    if (want === 'button' && !button) throw dom.SelectorMiss(SITE, 'sendButton');
    if (button) {
      button.click();
      return { ok: true, method: 'button' };
    }
    ensureCaret(el, false);
    key(el, 'keydown');
    key(el, 'keypress');
    key(el, 'keyup');
    return { ok: true, method: 'enter' };
  }

  function lastBubbles() {
    var composer = dom.find(SITE, 'composer');
    var out = { ok: true, listFound: false, texts: [], composerFound: !!composer, composerText: composerText(composer) };
    var listEl = dom.find(SITE, 'messageList');
    if (!listEl) return out;
    out.listFound = true;
    var rows = dom.findAll(SITE, 'messageRow', listEl).slice(-6);
    rows.forEach(function (row) {
      dom.findAll(SITE, 'messageText', row).forEach(function (node) {
        var t = Typing.canonical(typeof node.innerText === 'string' ? node.innerText : node.textContent);
        if (t) out.texts.push(t);
      });
    });
    return out;
  }

  /* ---------------------------- on page notice ---------------------------- */

  function notice(msg) {
    var old = document.getElementById(NOTICE_ID);
    if (old) old.remove();
    if (!msg.text) return { ok: true, shown: false };
    var host = document.createElement('div');
    host.id = NOTICE_ID;
    host.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;';
    var shadow = host.attachShadow({ mode: 'open' });
    var box = document.createElement('div');
    box.style.cssText =
      'font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;max-width:440px;padding:10px 12px;' +
      'border-radius:10px;background:#111;color:#fff;box-shadow:0 6px 24px rgba(0,0,0,.35);display:flex;gap:10px;align-items:flex-start;';
    var body = document.createElement('div');
    var title = document.createElement('div');
    title.style.cssText = 'font-weight:600;margin-bottom:2px;';
    title.textContent = msg.title || 'Ainable Setter';
    var text = document.createElement('div');
    text.textContent = String(msg.text);
    body.appendChild(title);
    body.appendChild(text);
    var close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Hide';
    close.style.cssText = 'font:inherit;border:1px solid #777;background:transparent;color:#fff;border-radius:6px;padding:2px 8px;cursor:pointer;';
    close.addEventListener('click', function () {
      host.remove();
    });
    box.appendChild(body);
    box.appendChild(close);
    shadow.appendChild(box);
    (document.body || document.documentElement).appendChild(host);
    return { ok: true, shown: true };
  }

  /* ---------------------------- commands ---------------------------- */

  function onCommand(msg) {
    if (!allowedHere()) throw fail('The outreach commands only run on www.instagram.com.', 'WRONG_SITE');
    switch (msg.cmd) {
      case 'probe':
        return probe(msg);
      case 'click-message':
        return clickMessage();
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
      case 'last-bubbles':
        return lastBubbles();
      case 'notice':
        return notice(msg);
      default:
        throw fail('Unknown outreach command: ' + msg.cmd, 'BAD_CMD');
    }
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg || msg.type !== 'aidm:outreach') return false;
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

  AIDM.outreach = { SITE: SITE, onCommand: onCommand, blockSignal: blockSignal, composerText: composerText };
})();
