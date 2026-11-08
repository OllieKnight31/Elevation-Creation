/*
 * capture.js
 * History capture. Reads the rendered message list of the owner's own open
 * conversation, scrolls up at human pace until nothing older loads, and hands
 * the result to the service worker in chunks of 200.
 *
 * It reads the DOM only. It does not watch network traffic and does not call
 * any Instagram or Facebook endpoint.
 */
(function () {
  'use strict';
  var AIDM = (globalThis.AIDM = globalThis.AIDM || {});
  if (AIDM.capture) return;

  var Core = globalThis.AIDMCore;
  var dom = AIDM.dom;
  var SEL = globalThis.AIDM_SELECTORS;

  function firstLine(text) {
    return Core.normaliseText(text).split('\n')[0] || '';
  }

  /* ---------------------------- thread identity ---------------------------- */

  // Business Suite shows Instagram and Messenger threads in one inbox, so the
  // platform has to be read off the page. Refuses to guess.
  function detectBusinessSuitePlatform() {
    var hints = dom.markers('businessSuite', 'urlPlatformHints');
    var url = (location.pathname + location.search).toLowerCase();
    function hinted(list) {
      return list.some(function (h) {
        return url.indexOf(h.toLowerCase()) >= 0;
      });
    }
    var ig = hinted(hints.instagram);
    var fb = hinted(hints.messenger);
    if (ig !== fb) return ig ? 'instagram' : 'messenger';

    ig = !!dom.find('businessSuite', 'platformBadgeInstagram');
    fb = !!dom.find('businessSuite', 'platformBadgeMessenger');
    if (ig !== fb) return ig ? 'instagram' : 'messenger';

    throw new Error(
      'Cannot tell whether the open conversation is Instagram or Messenger ' +
        '(businessSuite.urlPlatformHints, platformBadgeInstagram and platformBadgeMessenger gave no single answer). Nothing was sent.'
    );
  }

  // Name, handle, id and platform of the open conversation.
  function threadInfo(siteKey) {
    var listEl = dom.find(siteKey, 'messageList');
    var name = firstLine(dom.textOf(dom.find(siteKey, 'threadHeaderName')));
    if (!name && listEl) {
      var label = listEl.getAttribute('aria-label') || '';
      dom.markers(siteKey, 'messageListLabelPrefixes').forEach(function (prefix) {
        if (!name && label.indexOf(prefix) === 0) name = firstLine(label.slice(prefix.length));
      });
    }
    if (!name) throw dom.SelectorMiss(siteKey, 'threadHeaderName');

    var link = dom.find(siteKey, 'threadHeaderProfileLink');
    var handle = link ? Core.handleFromProfileHref(link.getAttribute('href')) : null;

    var urlId =
      siteKey === 'instagram'
        ? Core.instagramThreadIdFromUrl(location.href)
        : Core.queryParamFromUrl(location.href, dom.markers('businessSuite', 'threadIdParams'));

    var platform = siteKey === 'instagram' ? 'instagram' : detectBusinessSuitePlatform();

    // The picture is a nice to have: a page without one, or a site with no rule for it, still captures.
    var avatar = null;
    if (siteKey === 'instagram') {
      try {
        var img = dom.find(siteKey, 'threadHeaderAvatar');
        var src = img ? img.currentSrc || img.getAttribute('src') || '' : '';
        if (/^https:\/\//.test(src)) avatar = src;
      } catch (e) {
        avatar = null;
      }
    }

    return {
      platform: platform,
      thread: {
        externalId: Core.stableExternalId({ urlId: urlId, handle: handle, name: name }),
        name: name,
        handle: handle,
        avatar: avatar,
        url: location.href
      }
    };
  }

  /* ---------------------------- scrolling ---------------------------- */

  function isScrollable(el) {
    var oy = getComputedStyle(el).overflowY;
    return oy === 'auto' || oy === 'scroll' || oy === 'overlay';
  }

  // Nearest scrollable ancestor (or self) of el, or null.
  function scrollableAncestor(el) {
    for (var cur = el; cur && cur !== document.documentElement; cur = cur.parentElement) {
      if (isScrollable(cur)) return cur;
    }
    return null;
  }

  function findMessageScroller(siteKey, listEl) {
    var explicit = dom.find(siteKey, 'messageScroller');
    if (explicit && isScrollable(explicit)) return explicit;
    // Instagram scrolls a box INSIDE the list container, so look between the
    // first message row and the list before looking above the list.
    var row = dom.find(siteKey, 'messageRow', listEl);
    for (var cur = row; cur && cur !== listEl; cur = cur.parentElement) {
      if (isScrollable(cur) && cur.scrollHeight > cur.clientHeight) return cur;
    }
    var found = scrollableAncestor(listEl);
    if (!found) throw dom.SelectorMiss(siteKey, 'messageScroller');
    return found;
  }

  // Some chat lists are laid out bottom-up (column-reverse), where the oldest
  // content sits at the most negative scrollTop.
  function isReversed(scroller) {
    return getComputedStyle(scroller).flexDirection === 'column-reverse';
  }

  function scrollToOldest(scroller) {
    scroller.scrollTop = isReversed(scroller) ? -(scroller.scrollHeight - scroller.clientHeight) : 0;
  }

  function scrollToNewest(scroller) {
    scroller.scrollTop = isReversed(scroller) ? 0 : scroller.scrollHeight;
  }

  /* ---------------------------- extraction ---------------------------- */

  function outermost(els) {
    return els.filter(function (el) {
      return !els.some(function (other) {
        return other !== el && other.contains(el);
      });
    });
  }

  function innermost(els) {
    return els.filter(function (el) {
      return !els.some(function (other) {
        return other !== el && el.contains(other);
      });
    });
  }

  // True when the row carries a screen-reader marker saying the owner sent it.
  // Compares whole text nodes, so a message that merely contains the words
  // "you sent" is not mistaken for the marker.
  function rowHasOutgoingMarker(row, folded) {
    var walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      if (folded.indexOf(Core.foldText(node.nodeValue)) >= 0) return true;
    }
    return false;
  }

  // "in" or "out" from the sender named on the row's action buttons, or null
  // when the row has none or the contact's handle is not known.
  function directionFromSenderLabel(siteKey, row, parts, contactHandle) {
    if (!parts.length || !contactHandle) return null;
    var els = [];
    dom.getTarget(siteKey, 'senderLabel').css.forEach(function (css) {
      if (!els.length) els = dom.q(row, css);
    });
    for (var i = 0; i < els.length; i++) {
      var label = els[i].getAttribute('aria-label') || '';
      for (var j = 0; j < parts.length; j++) {
        var at = label.indexOf(parts[j]);
        if (at < 0) continue;
        var who = Core.cleanHandle(label.slice(at + parts[j].length));
        if (who) return who === contactHandle ? 'in' : 'out';
      }
    }
    return null;
  }

  // "in" or "out" from which side of the list the bubble is drawn on, or null
  // when it is not clearly on one side.
  function directionFromGeometry(el, listRect) {
    var r = el.getBoundingClientRect();
    if (!r.width || !listRect.width) return null;
    var leftGap = r.left - listRect.left;
    var rightGap = listRect.right - r.right;
    if (Math.abs(leftGap - rightGap) < listRect.width * 0.04) return null;
    return rightGap < leftGap ? 'out' : 'in';
  }

  /*
   * Reads the messages currently rendered, oldest first.
   * Returns { messages: [{ direction, text, sentAt }], unknown } where unknown
   * counts messages skipped because their direction could not be established.
   * Text only: photos, voice notes, reactions and shared posts are not captured.
   */
  function extractSnapshot(siteKey, listEl) {
    var rows = innermost(dom.findAll(siteKey, 'messageRow', listEl));
    var outMarkers = dom.markers(siteKey, 'outgoingMarkers').map(Core.foldText);
    var ignore = dom.markers(siteKey, 'ignoreTexts').map(Core.foldText);
    var listRect = listEl.getBoundingClientRect();
    var senderParts = SEL[siteKey].markers.senderLabelParts || [];
    var headerLink = senderParts.length ? dom.find(siteKey, 'threadHeaderProfileLink') : null;
    var contactHandle = headerLink ? Core.handleFromProfileHref(headerLink.getAttribute('href') || '') : null;

    // Date separators drawn between rows, in page order.
    var breaks = SEL[siteKey].targets.dateBreak
      ? dom.findAll(siteKey, 'dateBreak', listEl).filter(function (el) {
          if (rows.some(function (r) { return r.contains(el); })) return false;
          var t = dom.textOf(el);
          return t.length <= 40 && /\d{1,2}[:.]\d{2}/.test(t) && !!Core.parseTimestamp(t);
        })
      : [];
    var nextBreak = 0;

    var rowOut = rows.map(function (row) {
      return rowHasOutgoingMarker(row, outMarkers);
    });
    var markerSeen = rowOut.some(Boolean);

    var messages = [];
    var unknown = 0;
    var currentTs = null;

    rows.forEach(function (row, i) {
      while (nextBreak < breaks.length && breaks[nextBreak].compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING) {
        currentTs = Core.parseTimestamp(dom.textOf(breaks[nextBreak]));
        nextBreak++;
      }
      var tsEl = dom.find(siteKey, 'timestamp', row);
      var tsText = '';
      if (tsEl) {
        tsText = Core.foldText(dom.textOf(tsEl));
        // A separator we cannot parse resets the time to unknown instead of
        // carrying an older one forward.
        currentTs = Core.parseTimestamp(tsEl.getAttribute('datetime') || dom.textOf(tsEl));
      }

      var textEls = outermost(dom.findAll(siteKey, 'messageText', row)).filter(function (el) {
        return !(tsEl && (tsEl.contains(el) || el.contains(tsEl)));
      });

      textEls.forEach(function (el) {
        var text = dom.textOf(el);
        var folded = Core.foldText(text);
        if (!folded || ignore.indexOf(folded) >= 0 || (tsText && folded === tsText)) return;

        var direction = directionFromSenderLabel(siteKey, row, senderParts, contactHandle);
        if (!direction && rowOut[i]) direction = 'out';
        if (!direction) direction = directionFromGeometry(el, listRect);
        // When this page version uses the owner marker at all, a row without
        // it and without a clear side is an incoming message.
        if (!direction && markerSeen) direction = 'in';

        if (!direction) {
          unknown++;
          return;
        }
        messages.push({ direction: direction, text: text, sentAt: currentTs });
      });
    });

    return { messages: messages, unknown: unknown };
  }

  /* ---------------------------- one thread ---------------------------- */

  /*
   * Captures the open conversation.
   * ctx: { site, stop, pause(), progress(patch) }
   * Returns { thread, platform, seen, added, total, steps, complete, warnings, conversationId }.
   */
  function captureOpenThread(ctx) {
    var siteKey = ctx.site;
    var L = Core.LIMITS;
    dom.checkHalt(siteKey);

    var info = threadInfo(siteKey);
    var scroller = findMessageScroller(siteKey, dom.need(siteKey, 'messageList'));

    var acc = [];
    var gaps = 0;
    var unknown = 0;
    var steps = 0;
    var stable = 0;
    var reachedTop = false;

    function take() {
      var listEl = dom.need(siteKey, 'messageList');
      var snap = extractSnapshot(siteKey, listEl);
      unknown = Math.max(unknown, snap.unknown);
      var merged = Core.mergeSnapshots(acc, snap.messages);
      if (merged.gap) gaps++;
      acc = merged.messages;
      return merged.added;
    }

    function step() {
      ctx.stop.throwIfStopped();
      if (steps >= L.MAX_SCROLL_STEPS) return Promise.resolve();
      var beforeHeight = scroller.scrollHeight;
      scrollToOldest(scroller);
      steps++;
      ctx.progress({ detail: info.thread.name + ': scroll step ' + steps + ', ' + acc.length + ' messages read so far' });
      // Randomised 4 to 9 second pause between scroll steps. Halt text is
      // checked before and after it.
      return ctx.pause().then(function () {
        if (!scroller.isConnected) scroller = findMessageScroller(siteKey, dom.need(siteKey, 'messageList'));
        var added = take();
        var loading = !!dom.find(siteKey, 'loadingIndicator', dom.need(siteKey, 'messageList'));
        var grew = scroller.scrollHeight !== beforeHeight;
        if (added === 0 && !grew && !loading) {
          stable++;
          if (stable >= L.STABLE_STEPS_FOR_TOP) {
            reachedTop = true;
            return;
          }
        } else {
          stable = 0;
        }
        return step();
      });
    }

    take();

    return step().then(function () {
      try {
        scrollToNewest(scroller);
      } catch (e) {
        /* leaving the view scrolled up is harmless */
      }

      var warnings = [];
      if (!reachedTop) warnings.push('Stopped after ' + steps + ' scroll steps before reaching the start of the thread.');
      if (gaps) warnings.push(gaps + ' scroll step(s) did not overlap the previous one, so the history may have gaps or repeats.');
      if (unknown) warnings.push(unknown + ' message(s) skipped because their direction (in or out) could not be read.');

      var complete = reachedTop && gaps === 0 && unknown === 0;
      var payloads = Core.buildIngestPayloads({
        platform: info.platform,
        thread: info.thread,
        messages: acc,
        complete: complete
      });

      var result = {
        platform: info.platform,
        thread: info.thread,
        seen: payloads.reduce(function (n, p) {
          return n + p.messages.length;
        }, 0),
        added: 0,
        total: 0,
        steps: steps,
        complete: complete,
        warnings: warnings,
        conversationId: null
      };

      if (!payloads.length) {
        warnings.push('No text messages could be read from "' + info.thread.name + '". Nothing was sent.');
        return result;
      }

      var i = 0;
      function send() {
        if (i >= payloads.length) return result;
        ctx.stop.throwIfStopped();
        ctx.progress({ detail: info.thread.name + ': sending part ' + (i + 1) + ' of ' + payloads.length });
        return AIDM.api('ingest', payloads[i]).then(function (res) {
          result.added += res.added;
          result.total = res.total;
          result.conversationId = res.conversationId;
          i++;
          return send();
        });
      }
      return send();
    });
  }

  /* ---------------------------- many threads ---------------------------- */

  function rowTitle(siteKey, row) {
    return firstLine(dom.textOf(dom.find(siteKey, 'threadRowTitle', row)));
  }

  function rowClickTarget(siteKey, row) {
    return dom.find(siteKey, 'threadRowClickTarget', row) || row;
  }

  function rowKey(siteKey, row) {
    var target = rowClickTarget(siteKey, row);
    var href = target.getAttribute && target.getAttribute('href');
    return href || rowTitle(siteKey, row);
  }

  function namesMatch(a, b) {
    var x = Core.foldText(a);
    var y = Core.foldText(b);
    if (!x || !y) return false;
    return x === y || x.indexOf(y) >= 0 || y.indexOf(x) >= 0;
  }

  /*
   * Captures up to `cap` conversations from the top of the thread list, one at
   * a time, in list order. It only opens conversations that already exist in
   * the owner's inbox. It never starts a conversation.
   * ctx adds: { cap, skipUnread, summary }
   */
  function captureRecent(ctx) {
    var siteKey = ctx.site;
    var processed = {};
    var done = 0;
    var emptyScrolls = 0;

    function nextRow() {
      var listEl = dom.need(siteKey, 'threadList');
      var rows = dom.findAll(siteKey, 'threadRow', listEl);
      if (!rows.length) throw dom.SelectorMiss(siteKey, 'threadRow');
      for (var i = 0; i < rows.length; i++) {
        var key = rowKey(siteKey, rows[i]);
        if (key && !processed[key]) return { row: rows[i], key: key, listEl: listEl };
      }
      return { row: null, key: null, listEl: listEl };
    }

    function loop() {
      ctx.stop.throwIfStopped();
      dom.checkHalt(siteKey);
      if (done >= ctx.cap) return Promise.resolve();

      var next = nextRow();
      if (!next.row) {
        if (emptyScrolls >= 2) return Promise.resolve();
        var listScroller = scrollableAncestor(next.listEl);
        if (!listScroller) return Promise.resolve();
        emptyScrolls++;
        listScroller.scrollTop = listScroller.scrollTop + Math.round(listScroller.clientHeight * 0.8);
        ctx.progress({ detail: 'Looking for more conversations in the list' });
        return ctx.pause().then(loop);
      }
      emptyScrolls = 0;
      processed[next.key] = true;

      var title = rowTitle(siteKey, next.row);
      if (!title) throw dom.SelectorMiss(siteKey, 'threadRowTitle');

      if (ctx.skipUnread && dom.find(siteKey, 'threadRowUnread', next.row)) {
        ctx.summary.skippedUnread = (ctx.summary.skippedUnread || 0) + 1;
        return Promise.resolve().then(loop);
      }

      ctx.progress({ value: done, max: ctx.cap, detail: 'Opening "' + title + '" (' + (done + 1) + ' of up to ' + ctx.cap + ')' });
      dom.safeClick(siteKey, rowClickTarget(siteKey, next.row), 'conversation "' + title + '"');

      // Randomised 4 to 9 second pause between threads. Also gives the thread time to render.
      return ctx
        .pause()
        .then(function () {
          var info = threadInfo(siteKey);
          if (!namesMatch(info.thread.name, title)) {
            throw new Error(
              'Opened conversation shows "' + info.thread.name + '" but the list entry said "' + title +
                '". Stopped so nothing is filed under the wrong person.'
            );
          }
          return captureOpenThread(ctx);
        })
        .then(function (res) {
          done++;
          ctx.summary.threads = done;
          ctx.summary.messagesSeen += res.seen;
          ctx.summary.messagesAdded += res.added;
          res.warnings.forEach(function (w) {
            ctx.summary.warnings.push(res.thread.name + ': ' + w);
          });
          ctx.progress({ value: done, max: ctx.cap, detail: 'Pausing before the next conversation' });
          if (done >= ctx.cap) return;
          // A second randomised pause, so two threads are never opened back to back.
          return ctx.pause().then(loop);
        });
    }

    return loop();
  }

  /* ---------------------------- live sync ---------------------------- */

  // True when the open chat is scrolled to its newest message, the only time
  // live sync reads it, so a look back through old messages is never mistaken
  // for new ones.
  function atNewest(siteKey) {
    var listEl = dom.find(siteKey, 'messageList');
    if (!listEl) return false;
    var scroller;
    try {
      scroller = findMessageScroller(siteKey, listEl);
    } catch (e) {
      return true; // a short chat that does not scroll shows everything
    }
    var slack = 80;
    if (isReversed(scroller)) return Math.abs(scroller.scrollTop) <= slack;
    return scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop <= slack;
  }

  var AGE = /(?:^|\s|·)(\d+)\s?(s|sec|secs|m|min|mins|h|hr|hrs|d|w|wk|y)\b/i;
  var AGE_ONLY = /^(?:·\s*)?(?:\d+\s?(?:s|sec|secs|m|min|mins|h|hr|hrs|d|w|wk|y)|now|just now)$/i;
  var UNIT = { s: 1, sec: 1, secs: 1, m: 60, min: 60, mins: 60, h: 3600, hr: 3600, hrs: 3600, d: 86400, w: 604800, wk: 604800, y: 31536000 };

  // The latest message a chat list entry shows, or null when it shows none we
  // can copy (a photo, a reaction, a count of unread ones, or an unknown layout).
  // { name, direction, text, ageSec } where ageSec is null when the list shows no time.
  function rowPreview(siteKey, row) {
    var name = rowTitle(siteKey, row);
    if (!name) return null;
    var img = dom.find(siteKey, 'threadRowAvatar', row);
    var src = img ? img.currentSrc || img.getAttribute('src') || '' : '';
    var avatar = /^https:\/\//.test(src) ? src : null;
    var none = { name: name, direction: null, text: null, ageSec: null, avatar: avatar };
    var pieces = innermost(dom.findAll(siteKey, 'threadRowText', row))
      .map(function (el) {
        return firstLine(dom.textOf(el));
      })
      .filter(function (t, i, all) {
        return t && t !== name && t !== '·' && all.indexOf(t) === i;
      });
    var ageSec = null;
    var text = '';
    pieces.forEach(function (t) {
      if (AGE_ONLY.test(t)) {
        var a = AGE.exec(t);
        if (ageSec === null) ageSec = a ? Number(a[1]) * UNIT[a[2].toLowerCase()] : 0;
        return;
      }
      if (!text) text = t;
    });
    if (!text) return none;
    // "message · 5m" drawn as one piece.
    var joined = /^(.*?)\s*·\s*(\d+\s?\w+|now)$/i.exec(text);
    if (joined) {
      text = joined[1];
      var b = AGE.exec(' ' + joined[2]);
      if (ageSec === null) ageSec = b ? Number(b[1]) * UNIT[b[2].toLowerCase()] : 0;
    }
    // The time can sit outside the pieces above: read it from whatever follows the preview in the entry.
    if (ageSec === null) {
      var full = Core.normaliseText(row.textContent || '').replace(/\s+/g, ' ');
      var tail = full.slice(full.lastIndexOf(text) + text.length);
      var c = AGE.exec(tail);
      if (c) ageSec = Number(c[1]) * UNIT[c[2].toLowerCase()];
      else if (/(^|\W)(now|just now)\b/i.test(tail)) ageSec = 0;
    }
    var direction = 'in';
    dom.markers(siteKey, 'previewOutgoingPrefixes').forEach(function (p) {
      if (direction === 'in' && text.indexOf(p) === 0) {
        direction = 'out';
        text = text.slice(p.length);
      }
    });
    var lower = text.toLowerCase();
    var skip = dom.markers(siteKey, 'previewSkip').some(function (p) {
      return lower.indexOf(p.toLowerCase()) === 0;
    });
    if (skip || /^\d+\+?\s+new\s+messages?$/i.test(text) || !text.trim()) return Object.assign(none, { ageSec: ageSec });
    return { name: name, direction: direction, text: text.trim(), ageSec: ageSec, avatar: avatar };
  }

  function threadRows(siteKey) {
    var listEl = dom.find(siteKey, 'threadList');
    return listEl ? dom.findAll(siteKey, 'threadRow', listEl) : [];
  }

  AIDM.capture = {
    atNewest: atNewest,
    rowPreview: rowPreview,
    threadRows: threadRows,
    threadInfo: threadInfo,
    extractSnapshot: extractSnapshot,
    captureOpenThread: captureOpenThread,
    captureRecent: captureRecent,
    rowTitle: rowTitle,
    rowClickTarget: rowClickTarget,
    scrollableAncestor: scrollableAncestor
  };
})();
