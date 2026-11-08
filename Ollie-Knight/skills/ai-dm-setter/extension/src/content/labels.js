/*
 * labels.js
 * Label sync for the Meta Business Suite inbox. Meta has no API for Instagram
 * inbox labels, so this applies the app's tags through the page UI.
 *
 * Every step either finds exactly the element it needs or throws a precise
 * error, which is reported to the app with ok: false. Nothing is guess-clicked:
 * zero matches is an error, and more than one match is also an error.
 */
(function () {
  'use strict';
  var AIDM = (globalThis.AIDM = globalThis.AIDM || {});
  if (AIDM.labels) return;

  var Core = globalThis.AIDMCore;
  var dom = AIDM.dom;
  var SITE = 'businessSuite';

  function fold(s) {
    return Core.foldText(s);
  }

  function stripPunctuation(s) {
    return s.replace(/["'\u201c\u201d:+]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /* ---------------------------- find the conversation ---------------------------- */

  // Conversation entries whose name is exactly the item's name (or handle).
  // allowEmpty is for a filtered list, where zero entries means "no result"
  // and not a broken selector.
  function matchingRows(item, allowEmpty) {
    var listEl = dom.need(SITE, 'threadList');
    var rows = dom.findAll(SITE, 'threadRow', listEl);
    if (!rows.length) {
      if (allowEmpty) return [];
      throw dom.SelectorMiss(SITE, 'threadRow');
    }
    var name = fold(item.name);
    var handle = Core.cleanHandle(item.handle);
    return rows.filter(function (row) {
      var title = fold(AIDM.capture.rowTitle(SITE, row));
      if (!title) return false;
      if (title === name) return true;
      return !!handle && (title === handle || title === '@' + handle);
    });
  }

  function clearSearch(input) {
    try {
      dom.setInputValue(input, '');
    } catch (e) {
      /* best effort */
    }
  }

  // Resolves with the single conversation entry for the item, searching the
  // inbox when it is not among the loaded entries. The search box is always
  // emptied again when the search does not end in exactly one match.
  function findConversationRow(item, ctx) {
    return Promise.resolve().then(function () {
      var rows = matchingRows(item, false);
      if (rows.length === 1) return { row: rows[0], searched: null };
      if (rows.length > 1) {
        throw new Error(rows.length + ' conversations in the list are named "' + item.name + '". Not clicking any of them.');
      }

      var input = dom.find(SITE, 'threadSearchInput');
      if (!input) {
        throw new Error(
          'Conversation "' + item.name + '" is not in the loaded list and the search box was not found (businessSuite.threadSearchInput).'
        );
      }
      dom.setInputValue(input, item.name);
      return ctx
        .pause()
        .then(function () {
          var found = matchingRows(item, true);
          if (found.length === 1) return { row: found[0], searched: input };
          if (!found.length) throw new Error('Conversation "' + item.name + '" was not found in the inbox, even after searching.');
          throw new Error(found.length + ' search results are named "' + item.name + '". Not clicking any of them.');
        })
        .catch(function (err) {
          clearSearch(input);
          throw err;
        });
    });
  }

  /* ---------------------------- read applied labels ---------------------------- */

  function appliedLabels(section) {
    var t = dom.getTarget(SITE, 'appliedLabel');
    var out = [];
    t.css.forEach(function (css) {
      dom.q(section, css).forEach(function (el) {
        if (!dom.isVisible(el)) return;
        var text = dom.textOf(el);
        if (text && text.indexOf('\n') < 0 && out.indexOf(text) < 0) out.push(text);
        var aria = el.getAttribute('aria-label') || '';
        var m = /^remove label\s+(.+)$/i.exec(aria.trim());
        if (m && out.indexOf(m[1]) < 0) out.push(m[1]);
      });
    });
    return out;
  }

  function hasLabel(section, label) {
    return Core.missingLabels([label], appliedLabels(section)).length === 0;
  }

  /* ---------------------------- add one label ---------------------------- */

  function isForbiddenInput(el) {
    var composer = dom.find(SITE, 'composer');
    var search = dom.find(SITE, 'threadSearchInput');
    return el === composer || el === search || (composer && composer.contains(el));
  }

  function pickerInput() {
    var el = dom.find(SITE, 'labelInput');
    return el && !isForbiddenInput(el) ? el : null;
  }

  function addOneLabel(label, ctx) {
    var section = dom.need(SITE, 'labelSection');

    return Promise.resolve()
      .then(function () {
        var open = pickerInput();
        if (open) return open;
        dom.safeClick(SITE, dom.need(SITE, 'addLabelButton', section), 'the add label control');
        return dom.waitFor(pickerInput, 6000, ctx.stop);
      })
      .then(function (input) {
        if (!input) throw dom.SelectorMiss(SITE, 'labelInput');
        dom.setInputValue(input, label);
        // Give the picker time to filter its list.
        return Core.sleep(1500, ctx.stop);
      })
      .then(function () {
        var exact = dom.findAll(SITE, 'labelOption').filter(function (el) {
          return fold(dom.textOf(el)) === fold(label);
        });
        if (exact.length > 1) {
          throw new Error(exact.length + ' picker entries are named "' + label + '". Not clicking any of them.');
        }
        if (exact.length === 1) {
          dom.safeClick(SITE, exact[0], 'label "' + label + '"');
          return false;
        }
        // A create entry is one of the generic create texts, alone or wrapped
        // around the typed label, for example: Create "VIP". An existing label
        // that merely starts with "Create" is never mistaken for it.
        var createRule = dom.getTarget(SITE, 'createLabelOption').text;
        var generic = createRule
          ? createRule.values.map(function (v) {
              return stripPunctuation(fold(v));
            })
          : [];
        var create = dom.findAll(SITE, 'createLabelOption').filter(function (el) {
          var t = fold(dom.textOf(el) || el.getAttribute('aria-label') || '');
          var at = t.lastIndexOf(fold(label));
          var rest = at >= 0 ? t.slice(0, at) + t.slice(at + fold(label).length) : t;
          return generic.indexOf(stripPunctuation(rest)) >= 0;
        });
        if (!create.length) {
          throw new Error(
            'Label "' + label + '" does not exist and the create entry was not found (businessSuite.labelOption, businessSuite.createLabelOption).'
          );
        }
        if (create.length > 1) {
          throw new Error(create.length + ' elements look like the create label entry. Not clicking any of them.');
        }
        dom.safeClick(SITE, create[0], 'the create label entry');
        return true;
      })
      .then(function (created) {
        function landed() {
          var s = dom.find(SITE, 'labelSection');
          return s && hasLabel(s, label);
        }
        return dom.waitFor(landed, 4000, ctx.stop).then(function (ok) {
          if (ok || !created) return ok;
          // Some versions ask to confirm a new label in a dialog.
          var confirm = dom.findAll(SITE, 'createLabelConfirm');
          if (confirm.length !== 1) return false;
          dom.safeClick(SITE, confirm[0], 'the create label confirm button');
          return dom.waitFor(landed, 6000, ctx.stop);
        });
      })
      .then(function (ok) {
        if (!ok) {
          throw new Error('Label "' + label + '" was selected but did not appear on the conversation (businessSuite.appliedLabel).');
        }
      });
  }

  /* ---------------------------- one queue item ---------------------------- */

  // Resolves with the list of labels newly applied. Rejects with a precise error.
  function applyItem(item, ctx) {
    var applied = [];
    var searchedInput = null;

    return findConversationRow(item, ctx)
      .then(function (hit) {
        searchedInput = hit.searched;
        dom.safeClick(SITE, AIDM.capture.rowClickTarget(SITE, hit.row), 'conversation "' + item.name + '"');
        return dom.waitFor(
          function () {
            var header = dom.find(SITE, 'threadHeaderName');
            return header && fold(dom.textOf(header).split('\n')[0]) === fold(item.name);
          },
          10000,
          ctx.stop
        );
      })
      .then(function (opened) {
        if (!opened) {
          throw new Error(
            'Clicked "' + item.name + '" but the open conversation header did not show that name (businessSuite.threadHeaderName). No label was touched.'
          );
        }
        dom.checkHalt(SITE);
        var section = dom.need(SITE, 'labelSection');
        var missing = Core.missingLabels(item.labels, appliedLabels(section));

        var i = 0;
        function next() {
          if (i >= missing.length) return applied;
          ctx.stop.throwIfStopped();
          var label = missing[i++];
          ctx.progress({ detail: item.name + ': adding label "' + label + '"' });
          return addOneLabel(label, ctx)
            .then(function () {
              applied.push(label);
              return Core.sleep(1500 + Math.round(Math.random() * 1500), ctx.stop);
            })
            .then(next);
        }
        return next();
      })
      .then(
        function (res) {
          if (searchedInput) clearSearch(searchedInput);
          return res;
        },
        function (err) {
          if (searchedInput) clearSearch(searchedInput);
          if (applied.length && err && err.name !== 'StopError' && err.name !== 'HaltError') {
            err.message += ' Applied before the failure: ' + applied.join(', ') + '.';
          }
          throw err;
        }
      );
  }

  /* ---------------------------- the queue ---------------------------- */

  /*
   * Works through the app's label queue, one conversation at a time, with the
   * same 4 to 9 second pacing and the same cap as capture.
   * ctx: { site, stop, pause(), progress(patch), cap, summary }
   */
  function syncLabels(ctx) {
    if (ctx.site !== SITE) {
      return Promise.reject(new Error('Label sync only runs in the Meta Business Suite inbox (business.facebook.com).'));
    }
    dom.checkHalt(SITE);
    // Fail before touching the queue if the inbox itself cannot be read.
    dom.need(SITE, 'threadList');

    return AIDM.api('labelQueue').then(function (queue) {
      var items = queue.items.slice(0, ctx.cap);
      ctx.summary.queueSize = queue.items.length;
      var i = 0;

      function ack(item, ok, error) {
        return AIDM.api('labelAck', { id: item.id, ok: ok, error: error });
      }

      function next() {
        if (i >= items.length) return;
        ctx.stop.throwIfStopped();
        var item = items[i++];
        ctx.progress({ value: i - 1, max: items.length, detail: 'Conversation ' + i + ' of ' + items.length });

        var problem = Core.validateQueueItem(item);
        var work;
        if (problem) {
          work = Promise.reject(new Error('Invalid queue item: ' + problem));
        } else {
          // Inside a promise, so a synchronous throw fails this item only.
          work = Promise.resolve().then(function () {
            return applyItem(item, ctx);
          });
        }

        return work
          .then(
            function (applied) {
              ctx.summary.itemsOk++;
              ctx.summary.labelsApplied += applied.length;
              return ack(item, true);
            },
            function (err) {
              // A stop or a halt is not a failure of this item. It is left
              // unacknowledged so it stays in the queue for the next run.
              if (err && (err.name === 'StopError' || err.name === 'HaltError')) throw err;
              ctx.summary.itemsFailed++;
              ctx.summary.warnings.push((item && item.name ? item.name : 'item') + ': ' + err.message);
              if (!item || typeof item.id !== 'string' || !item.id) return;
              return ack(item, false, err.message);
            }
          )
          .then(function () {
            ctx.progress({ value: i, max: items.length });
            if (i >= items.length) return;
            return ctx.pause().then(next);
          });
      }

      return next();
    });
  }

  AIDM.labels = {
    syncLabels: syncLabels,
    applyItem: applyItem,
    appliedLabels: appliedLabels
  };
})();
