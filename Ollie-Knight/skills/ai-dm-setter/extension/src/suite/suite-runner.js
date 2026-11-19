/*
 * suite-runner.js (service worker side of the Business Suite sender)
 *
 * Sends inbox messages that Meta's official connection will not take, inside
 * Meta Business Suite's inbox and nowhere else. One task is one message:
 *   open      load the Business Suite inbox in this sender's own tab
 *   inbox     wait for the conversation list, check for warnings
 *   search    look for the lead in the loaded list, then search by username,
 *             then by name
 *   verify    open a candidate and check it is the right person: the header
 *             must match the username or name AND the last message in the
 *             chat must be the last one the app has on record
 *   reading   wait readMs
 *   typing    send the typing plan to the tab, one step per message
 *   sending   press send
 *   confirm   read the message back from the chat
 *   report    POST the result to the app
 *
 * Rules kept here:
 *   - Off unless the app says the owner switched Business Suite sending on.
 *   - If the match is not certain, nothing is typed and the reason is reported.
 *   - The tab only ever loads the Business Suite inbox address below. A task
 *     cannot point it anywhere else, and it never opens instagram.com.
 *   - Only the tab this file created is navigated, injected or typed in.
 *   - One task at a time, and never while the outreach sender is busy.
 *   - Every wait runs here, not in the page. Nothing spoofs visibility or focus.
 *   - The state is written to chrome.storage.local at each stage, so a
 *     restarted service worker fails the task cleanly and still reports it.
 *   - A hard timeout of about 6 minutes per task.
 *
 * No DOM access and no page selectors live here. The page work is done by
 * src/suite/suite-content.js through small commands.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AIDMSuite = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var INBOX_URL = 'https://business.facebook.com/latest/inbox';
  var TASK_TIMEOUT_MS = 6 * 60 * 1000;
  var CMD_TIMEOUT_MS = 15000;
  var READ_MAX_MS = 60000;
  var LOG_SIZE = 8;
  var MAX_OPENED = 2; // opening a chat can mark it as read, so few are ever opened
  var MESSAGE_TYPE = 'aidm:suite';
  var STATUSES = ['sent', 'unreachable', 'not_found', 'blocked', 'error', 'skipped'];

  // Injected into the Business Suite tab, in this order, after every navigation.
  var CONTENT_FILES = ['src/selectors.js', 'src/lib/core.js', 'src/lib/typing.js', 'src/content/dom.js', 'src/suite/suite-content.js'];

  var KEY = {
    settings: 'suite', // { enabled, note }
    task: 'suiteTask', // the running task, see newState()
    log: 'suiteLog', // last results, newest first
    poll: 'suitePoll', // { nextAt, reason }
    tab: 'suiteTabId'
  };

  function Stop(status, detail) {
    var e = new Error(detail || status);
    e.name = 'SuiteStop';
    e.outcome = { status: status, detail: detail || '' };
    return e;
  }

  /* ---------------------------- pure checks ---------------------------- */

  function cleanHandle(value) {
    var h = String(value || '').trim().replace(/^@/, '').toLowerCase();
    return /^[a-z0-9._]{1,30}$/.test(h) ? h : '';
  }

  function fold(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/[   ]/g, ' ')
      .replace(/[​‌‍﻿]/g, '')
      .replace(/[‘’]/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function squash(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/[   ]/g, ' ')
      .replace(/[​‌‍﻿]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function quote(text) {
    var t = squash(text);
    return '"' + (t.length > 40 ? t.slice(0, 37) + '...' : t) + '"';
  }

  function validateTask(task) {
    if (!task || typeof task !== 'object') return 'task is not an object';
    if (typeof task.id !== 'string' && typeof task.id !== 'number') return 'task.id is missing';
    if (task.channel !== 'suite') return 'task.channel is not "suite"';
    if (typeof task.text !== 'string' || !task.text.trim()) return 'task.text is empty';
    if (task.text.length > 2000) return 'task.text is longer than 2000 characters';
    if (!cleanHandle(task.handle) && !squash(task.name)) return 'the task has neither a username nor a name to find the chat by';
    var last = task.expect && task.expect.last;
    if (!Array.isArray(last) || !last.length || typeof last[0].text !== 'string' || !squash(last[0].text)) {
      return 'task.expect.last is missing, so the chat could not be checked';
    }
    return null;
  }

  // Whether a message read from the page is this message on record. A record
  // cut short by the app (partial) matches the start of the full message.
  function sameMessage(pageText, rec) {
    var a = squash(pageText);
    var b = squash(rec && rec.text);
    if (!a || !b) return false;
    if (a === b) return true;
    if (!rec.partial) return false;
    var stem = b.replace(/(\.\.\.|…)$/, '').trim();
    return stem.length >= 12 && a.indexOf(stem) === 0;
  }

  /*
   * Decides whether the open conversation is certainly the task's lead.
   * Two things must both hold:
   *   1. who: the page shows the lead's username (a profile link or the
   *      header), or failing that the header is exactly the lead's name;
   *   2. last: the newest message on record in the app is in the chat, and
   *      nothing newer that the app does not know about comes after it.
   * A name match alone is weaker than a username (names repeat), so it also
   * needs a last message of some length, or the message before it to match.
   * Returns { certain, who, why }. `why` says what failed, in plain words.
   */
  function matchThread(task, t) {
    var handle = cleanHandle(task.handle);
    var name = fold(task.name);
    var header = fold(t && t.name);
    var pageHandle = cleanHandle(t && t.handle);
    var who = '';
    var no = function (why) {
      return { certain: false, who: who, why: why };
    };

    if (!t || (!header && !pageHandle)) return no('The open chat has no readable name (businessSuite.threadHeaderName).');
    if (t.platform === 'messenger') return no('The open chat is a Messenger chat, not an Instagram one.');
    if (handle && pageHandle) {
      if (pageHandle !== handle) return no('The open chat belongs to @' + pageHandle + ', not @' + handle + '.');
      who = 'username';
    } else if (handle && (header === handle || header === '@' + handle)) {
      who = 'username';
    } else if (name && header === name) {
      who = 'name';
    } else {
      return no('The open chat is headed ' + quote(t.name) + ', which is not ' + (handle ? '@' + handle : '') + (handle && name ? ' or ' : '') + (name ? quote(task.name) : '') + '.');
    }

    var texts = Array.isArray(t.texts) ? t.texts : [];
    if (!texts.length) return no('No message could be read from the open chat (businessSuite.messageList, messageRow, messageText).');
    var known = task.expect.last;
    var at = -1;
    for (var i = texts.length - 1; i >= 0; i--) {
      if (sameMessage(texts[i], known[0])) {
        at = i;
        break;
      }
    }
    if (at < 0) return no('The last message on record (' + quote(known[0].text) + ') is not among the last ' + texts.length + ' messages of the open chat.');
    var newer = texts.slice(at + 1).filter(function (x) {
      return !known.some(function (k) {
        return sameMessage(x, k);
      });
    });
    if (newer.length) return no('The open chat shows something newer than the app has on record (' + quote(newer[0]) + '), so this message may no longer fit.');
    if (who === 'name') {
      var two = known.length > 1 && at >= 1 && sameMessage(texts[at - 1], known[1]);
      if (squash(known[0].text).length < 20 && !two) {
        return no('Only the name matches, and the last message on record (' + quote(known[0].text) + ') is too short to be sure this is the same person.');
      }
    }
    return { certain: true, who: who, why: '' };
  }

  // Which listed entries are worth opening for this lead. An entry titled
  // exactly with the username or the name; or, after a search for the
  // username, the only entry left.
  function candidates(task, rows, searchedFor) {
    var handle = cleanHandle(task.handle);
    var name = fold(task.name);
    var list = Array.isArray(rows) ? rows : [];
    var exact = list.filter(function (r) {
      var title = fold(r.title);
      if (!title) return false;
      return (name && title === name) || (handle && (title === handle || title === '@' + handle));
    });
    if (exact.length) return exact;
    if (searchedFor && handle && cleanHandle(searchedFor) === handle && list.length === 1 && fold(list[0].title)) return list;
    return [];
  }

  function firstDifference(a, b) {
    var n = Math.min(a.length, b.length);
    for (var i = 0; i < n; i++) if (a[i] !== b[i]) return i;
    return n;
  }

  function createRunner(deps) {
    var chrome = deps.chrome;
    var api = deps.api; // function (call, arg) -> Promise, talks to the app
    var Typing = deps.Typing;
    var blocked = deps.isBlocked || function () {
      return false;
    };
    var now = deps.now || function () {
      return Date.now();
    };
    var rng = deps.rng || Math.random;
    var sleep = deps.sleep || function (ms) {
      return new Promise(function (resolve) {
        setTimeout(resolve, ms);
      });
    };
    var local = chrome.storage.local;
    var session = chrome.storage.session || chrome.storage.local;

    var lastTick = Promise.resolve('idle');
    var busy = false; // a tick (and so possibly a task) is in progress in THIS worker
    var abort = null; // { status, detail } set from outside to end the running task
    var current = null; // the in-memory copy of the running task state

    /* ---------------------------- storage ---------------------------- */

    function get(key) {
      return local.get(key).then(function (d) {
        return d ? d[key] : undefined;
      });
    }
    function set(key, value) {
      var o = {};
      o[key] = value;
      return local.set(o);
    }
    function getSettings() {
      return get(KEY.settings).then(function (s) {
        s = s || {};
        return { enabled: s.enabled === true, note: typeof s.note === 'string' ? s.note : '' };
      });
    }

    /* ---------------------------- waiting ---------------------------- */

    function guard() {
      if (abort) throw Stop(abort.status, abort.detail);
      if (current && now() > current.deadline) {
        throw Stop('error', 'Timed out: the task ran past its ' + Math.round(TASK_TIMEOUT_MS / 60000) + ' minute limit during stage "' + current.stage + '".');
      }
    }

    // Sleeps in slices of at most a second so a stop, a timeout or a closed
    // tab is noticed quickly. Touches an extension API now and then, which
    // keeps the service worker alive through long waits.
    function wait(ms) {
      var end = now() + Math.max(0, ms);
      var slices = 0;
      function next() {
        guard();
        var left = end - now();
        if (left <= 0) return Promise.resolve();
        if (++slices % 20 === 0 && chrome.runtime && chrome.runtime.getPlatformInfo) {
          try {
            chrome.runtime.getPlatformInfo(function () {});
          } catch (e) {
            /* keep alive is best effort */
          }
        }
        return sleep(Math.min(1000, left)).then(next);
      }
      return Promise.resolve().then(next);
    }

    function between(lo, hi) {
      var r = Number(rng());
      if (!(r >= 0) || r > 1) r = 0.5;
      return Math.round(lo + r * (hi - lo));
    }

    function withTimeout(promise, ms, what) {
      return new Promise(function (resolve, reject) {
        var done = false;
        var timer = setTimeout(function () {
          if (done) return;
          done = true;
          reject(new Error(what + ' did not answer within ' + Math.round(ms / 1000) + ' seconds.'));
        }, ms);
        promise.then(
          function (v) {
            if (done) return;
            done = true;
            clearTimeout(timer);
            resolve(v);
          },
          function (e) {
            if (done) return;
            done = true;
            clearTimeout(timer);
            reject(e);
          }
        );
      });
    }

    /* ---------------------------- the tab ---------------------------- */

    function storedTabId() {
      return session.get(KEY.tab).then(function (d) {
        return d && typeof d[KEY.tab] === 'number' ? d[KEY.tab] : null;
      });
    }

    function existingTab() {
      return storedTabId().then(function (id) {
        if (id === null) return null;
        return chrome.tabs.get(id).then(
          function (tab) {
            return tab || null;
          },
          function () {
            return null;
          }
        );
      });
    }

    // Loads the Business Suite inbox in this sender's tab, creating the tab
    // (pinned, in the background) when it does not exist yet. The address is
    // the constant above and nothing else. Returns the tab id.
    function openInbox() {
      return existingTab().then(function (tab) {
        if (tab) {
          return chrome.tabs.update(tab.id, { url: INBOX_URL }).then(function () {
            return tab.id;
          });
        }
        return chrome.tabs.create({ url: INBOX_URL, active: false, pinned: true }).then(function (created) {
          var o = {};
          o[KEY.tab] = created.id;
          return session.set(o).then(function () {
            return created.id;
          });
        });
      });
    }

    function inject(tabId) {
      return withTimeout(chrome.scripting.executeScript({ target: { tabId: tabId }, files: CONTENT_FILES }), 30000, 'Script injection into the Business Suite tab');
    }

    // Waits until the tab reports that its navigation finished. Not fatal when
    // it never does: the probes that come next decide what the page shows.
    function waitLoaded(tabId) {
      var deadline = now() + 40000;
      function attempt() {
        return chrome.tabs.get(tabId).then(
          function (tab) {
            if (tab && tab.status === 'complete') return null;
            if (now() >= deadline) return null;
            return wait(500).then(attempt);
          },
          function () {
            throw Stop('error', 'The Business Suite tab was closed while the inbox was loading.');
          }
        );
      }
      return attempt();
    }

    // Sends one command to the tab. When the page was replaced the files are
    // injected again and the command is retried once, except for commands
    // that change the page.
    function tabCmd(tabId, cmd, arg, noRetry) {
      var msg = { type: MESSAGE_TYPE, cmd: cmd };
      Object.keys(arg || {}).forEach(function (k) {
        msg[k] = arg[k];
      });
      function send() {
        return withTimeout(chrome.tabs.sendMessage(tabId, msg), CMD_TIMEOUT_MS, 'The Business Suite tab');
      }
      return send()
        .then(
          function (res) {
            if (res !== undefined && res !== null) return res;
            if (noRetry) throw new Error('The Business Suite tab gave no answer to "' + cmd + '". The page may have reloaded.');
            return inject(tabId).then(send);
          },
          function (err) {
            if (noRetry) throw new Error('The Business Suite tab could not be reached for "' + cmd + '" (' + err.message + '). The page may have reloaded.');
            return inject(tabId).then(send);
          }
        )
        .then(function (res) {
          if (res === undefined || res === null) throw new Error('The Business Suite tab gave no answer to "' + cmd + '".');
          return res;
        });
    }

    /* ---------------------------- task state ---------------------------- */

    function newState(task) {
      var t = now();
      return {
        id: task.id,
        handle: cleanHandle(task.handle),
        name: squash(task.name),
        text: Typing.canonical(task.text),
        stage: 'open',
        startedAt: t,
        deadline: t + TASK_TIMEOUT_MS,
        tabId: null,
        typedMs: 0,
        keystrokes: 0,
        typos: 0,
        sendPressed: false,
        result: null
      };
    }

    function save() {
      return set(KEY.task, current);
    }

    function stage(name) {
      guard();
      current.stage = name;
      return save();
    }

    function who() {
      return (current.handle ? '@' + current.handle : '') + (current.handle && current.name ? ' / ' : '') + (current.name ? '"' + current.name + '"' : '');
    }

    /* ---------------------------- the stages ---------------------------- */

    function stopIfBlocked(p, when) {
      if (p && p.block) throw Stop('blocked', 'Warning ' + when + ': ' + p.block + '.');
    }

    function read(cmd, detect, when) {
      return tabCmd(current.tabId, cmd, { detect: detect }).then(function (r) {
        if (!r.ok) throw Stop('error', 'Reading the Business Suite page failed (' + cmd + '): ' + (r.error || 'unknown error'));
        stopIfBlocked(r, when);
        return r;
      });
    }

    // Waits for the inbox: its conversation list, with entries or a search box.
    function waitForInbox(detect) {
      var deadline = now() + 30000;
      function attempt() {
        return read('probe', detect, 'on the inbox page').then(function (p) {
          if (p.onInbox && p.list && (p.rows > 0 || p.search)) return p;
          if (now() < deadline) return wait(1000).then(attempt);
          if (!p.onInbox) throw Stop('error', 'The Business Suite tab ended up on ' + p.path + ' instead of the inbox. Nothing was clicked.');
          throw Stop(
            'error',
            'Selector miss: businessSuite.threadList' + (p.list ? ' has no entries (businessSuite.threadRow) and there is no search box (businessSuite.threadSearchInput)' : '') +
              '. The inbox did not show its conversation list within 30 seconds. Nothing was clicked. Fix src/selectors.js.'
          );
        });
      }
      return attempt();
    }

    /*
     * Opens one listed entry and watches the conversation that shows. The
     * inbox may still show the chat that was open before for a moment, so the
     * match has to hold on two looks in a row, and a mismatch only counts once
     * the time is up. Returns { ok, thread } or { ok: false, why }.
     */
    function openAndVerify(task, row, detect) {
      return tabCmd(current.tabId, 'open-row', { index: row.index, title: row.title }, true).then(
        function (r) {
          if (!r.ok) return { ok: false, why: 'The entry "' + row.title + '" was not opened: ' + r.error };
          var deadline = now() + 15000;
          var streak = 0;
          var last = { certain: false, why: 'The chat did not load.' };
          function look() {
            return read('thread', detect, 'after opening a chat').then(function (t) {
              last = matchThread(task, t);
              streak = last.certain ? streak + 1 : 0;
              if (streak >= 2) return { ok: true, thread: t, who: last.who };
              if (now() >= deadline) return { ok: false, why: last.why };
              return wait(800).then(look);
            });
          }
          return wait(between(900, 1800)).then(look);
        },
        function (err) {
          return { ok: false, why: 'The entry "' + row.title + '" was not opened: ' + err.message };
        }
      );
    }

    /*
     * Finds the lead's conversation and opens it. First the entries already
     * listed, then a search for the username, then for the name. Stops with
     * "skipped" when a chat was opened but could not be matched for certain,
     * and with "not_found" when nothing to open was found at all.
     */
    function findAndVerify(task, detect) {
      var opened = 0;
      var tried = []; // titles looked at in an earlier listing, so a search does not open the same chat again
      var whys = [];
      var notes = [];
      var terms = [];
      if (current.handle) terms.push(current.handle);
      if (current.name && fold(current.name) !== current.handle) terms.push(current.name);

      function tryRows(list, searchedFor) {
        var picks = candidates(task, list, searchedFor).filter(function (r) {
          return tried.indexOf(fold(r.title)) < 0;
        });
        function next(i) {
          if (i >= picks.length || opened >= MAX_OPENED) {
            picks.forEach(function (r) {
              tried.push(fold(r.title));
            });
            return Promise.resolve(null);
          }
          opened++;
          return openAndVerify(task, picks[i], detect).then(function (v) {
            if (v.ok) return v;
            whys.push(v.why);
            return next(i + 1);
          });
        }
        return next(0);
      }

      // Looks at the list a few times after a search, because results take a moment.
      function watchRows(searchedFor) {
        var deadline = now() + 9000;
        function look() {
          return read('rows', detect, 'while searching the inbox').then(function (r) {
            if (candidates(task, r.rows, searchedFor).length || now() >= deadline) return r;
            return wait(1000).then(look);
          });
        }
        return look();
      }

      function searchTerm(k) {
        if (k >= terms.length || opened >= MAX_OPENED) return Promise.resolve(null);
        return tabCmd(current.tabId, 'search', { term: terms[k] }, true).then(
          function (s) {
            if (!s.ok) {
              notes.push('The inbox could not be searched: ' + s.error);
              return null;
            }
            return wait(between(2200, 3800))
              .then(function () {
                return watchRows(terms[k]);
              })
              .then(function (r) {
                return tryRows(r.rows, terms[k]);
              })
              .then(function (v) {
                return v || searchTerm(k + 1);
              });
          },
          function (err) {
            notes.push('The inbox could not be searched: ' + err.message);
            return null;
          }
        );
      }

      return read('rows', detect, 'on the inbox page')
        .then(function (r) {
          return tryRows(r.rows, '');
        })
        .then(function (v) {
          return v || searchTerm(0);
        })
        .then(function (v) {
          if (v) return v;
          var tail = notes.length ? ' ' + notes.join(' ') : '';
          if (opened) {
            throw Stop('skipped', 'Not certain this is the right person, so nothing was typed. Looked for ' + who() + ' in Business Suite. ' + whys.join(' ') + tail);
          }
          throw Stop('not_found', 'No chat for ' + who() + ' was found in the Business Suite inbox, in the listed chats or by search. Nothing was typed.' + tail);
        });
    }

    // The matched chat must be one that can be written in, with an empty box.
    function checkWritable(t) {
      if (!t.composer) {
        if (t.cannotReply) throw Stop('unreachable', 'Business Suite will not take a message for ' + who() + ': the page shows "' + t.cannotReply + '". Nothing was typed.');
        throw Stop('error', 'Selector miss: businessSuite.composer. The chat for ' + who() + ' was found and matched, but no reply box was found. Nothing was typed.');
      }
      if (t.composerText) throw Stop('skipped', 'The reply box already held text (' + t.composerText.length + ' characters) before anything was typed. Nothing was typed or sent.');
    }

    // Reads the open chat again and stops unless it is still the same person.
    function recheck(task, detect, when) {
      return read('thread', detect, when).then(function (t) {
        var m = matchThread(task, t);
        if (!m.certain) throw Stop('skipped', 'The open chat changed ' + when + ', so nothing was sent. ' + m.why);
        return t;
      });
    }

    // Shrinks the waits of a plan when it would not fit in the time left.
    function fitPlan(plan) {
      var total = Typing.summary(plan).totalMs;
      var budget = current.deadline - now() - 45000;
      if (total <= budget || total <= 0) return 1;
      return Math.max(0.05, budget / total);
    }

    function typePlan(task, detect) {
      var plan = Typing.planTyping(current.text, task.typing, rng);
      if (Typing.replay(plan) !== current.text) throw Stop('error', 'The typing plan does not reproduce the target text. Nothing was typed.');
      var scale = fitPlan(plan);
      var startedAt = now();
      var due = startedAt;
      var k = 0;

      function next() {
        if (k >= plan.length) return Promise.resolve();
        var st = plan[k];
        due += st.wait * scale;
        if (now() - due > 400) due = now(); // never burst to catch up after a slow reply
        return wait(due - now())
          .then(function () {
            guard();
            if (st.op === 'pause') return null;
            return tabCmd(current.tabId, 'step', { op: st.op, ch: st.ch }, true).then(
              function (r) {
                if (!r.ok) throw Stop('error', 'Typing stopped at step ' + (k + 1) + ' of ' + plan.length + ': ' + r.error);
                current.keystrokes++;
                if (st.typo) current.typos++;
              },
              function (err) {
                throw Stop('error', 'Typing stopped at step ' + (k + 1) + ' of ' + plan.length + ': ' + err.message);
              }
            );
          })
          .then(function () {
            k++;
            current.typedMs = now() - startedAt;
            if (k % 40 !== 0 || k >= plan.length) return null;
            // Every so often: still no warning, still the same person, still a box.
            return recheck(task, detect, 'while typing').then(function (t) {
              if (!t.composer) throw Stop('error', 'The reply box disappeared while typing.');
            });
          })
          .then(next);
      }
      return next().then(function () {
        current.typedMs = now() - startedAt;
      });
    }

    function verifyTyped() {
      return tabCmd(current.tabId, 'read-composer', {}).then(function (r) {
        var have = String((r && r.text) || '');
        if (have === current.text) return;
        var at = firstDifference(have, current.text);
        throw Stop(
          'error',
          'The reply box text did not match the target after typing (' + have.length + ' characters, expected ' + current.text.length +
            ', first difference at character ' + (at + 1) + '). The box was cleared and nothing was sent.'
        );
      });
    }

    function sentSeen(t) {
      var texts = (t && t.texts) || [];
      return texts.length > 0 && squash(texts[texts.length - 1]) === squash(current.text);
    }

    // Presses send and watches the chat. Returns the outcome.
    function sendAndConfirm(detect) {
      current.sendPressed = true;
      return save()
        .then(function () {
          return tabCmd(current.tabId, 'send', { expect: current.text }, true);
        })
        .then(function (r) {
          if (!r.ok) throw Stop('error', 'Send was refused: ' + r.error + ' The box was cleared and nothing was sent.');
          return stage('confirm');
        })
        .then(function () {
          var deadline = now() + 20000;
          function poll() {
            return tabCmd(current.tabId, 'thread', { detect: detect }).then(function (t) {
              var state = { emptied: !t.composerText, seen: sentSeen(t), block: t.block || null };
              if ((state.emptied && state.seen) || now() >= deadline) return state;
              return wait(700).then(poll);
            });
          }
          return wait(600).then(poll);
        })
        .then(function (state) {
          if (state.block) {
            throw Stop(
              'blocked',
              'Warning after pressing send: ' + state.block + '. ' +
                (state.seen ? 'The message does appear in the chat.' : state.emptied ? 'The reply box had emptied, so the message may have gone out.' : 'The text was still in the reply box.')
            );
          }
          if (state.emptied && state.seen) return { status: 'sent', detail: 'Sent in Business Suite and read back from the chat.' };
          if (state.emptied) {
            return {
              status: 'sent',
              detail: 'Sent in Business Suite, unconfirmed: the reply box emptied, but the message could not be read back from the chat. ' +
                'Check businessSuite.messageList, messageRow and messageText in src/selectors.js.'
            };
          }
          throw Stop('error', 'Send was pressed but the text stayed in the reply box. The box was cleared.');
        });
    }

    function execute(task) {
      var detect = task.detect && typeof task.detect === 'object' ? task.detect : null;
      var readMs = Math.max(0, Math.min(READ_MAX_MS, Number(task.readMs) || 0));

      return openInbox()
        .then(function (tabId) {
          current.tabId = tabId;
          return save();
        })
        .then(function () {
          return wait(1500);
        })
        .then(function () {
          return waitLoaded(current.tabId);
        })
        .then(function () {
          return stage('inbox');
        })
        .then(function () {
          return waitForInbox(detect);
        })
        .then(function () {
          return wait(between(1500, 4000));
        })
        .then(function () {
          return stage('search');
        })
        .then(function () {
          return findAndVerify(task, detect);
        })
        .then(function (v) {
          checkWritable(v.thread);
          return stage('reading');
        })
        .then(function () {
          return wait(readMs);
        })
        .then(function () {
          return recheck(task, detect, 'before typing');
        })
        .then(function (t) {
          checkWritable(t);
          return stage('typing');
        })
        .then(function () {
          return tabCmd(current.tabId, 'focus-composer', {}).then(function (r) {
            if (!r.ok) throw Stop('error', 'The reply box could not be focused: ' + r.error);
            if (r.text) throw Stop('skipped', 'The reply box already held text before anything was typed. Nothing was typed or sent.');
          });
        })
        .then(function () {
          return typePlan(task, detect);
        })
        .then(function () {
          return verifyTyped();
        })
        .then(function () {
          // The last look before send: the same person, and nothing newer in the chat.
          return recheck(task, detect, 'after typing');
        })
        .then(function () {
          return wait(between(400, 1500));
        })
        .then(function () {
          return stage('sending');
        })
        .then(function () {
          return sendAndConfirm(detect);
        });
    }

    /* ---------------------------- finishing ---------------------------- */

    function clearComposerQuietly() {
      if (!current || current.tabId === null) return Promise.resolve();
      var tabId = current.tabId;
      var tries = 0;
      function attempt() {
        return tabCmd(tabId, 'clear-composer', {}, true).then(
          function (r) {
            if (!r || !r.ok || !r.text || ++tries >= 4) return null;
            return sleep(150).then(attempt);
          },
          function () {}
        );
      }
      return attempt();
    }

    function postResult(result) {
      return api('outreachResult', result).then(function (r) {
        if (r && r.paused) {
          return set(KEY.poll, { nextAt: 0, reason: 'Paused by the app' + (r.pauseReason ? ': ' + r.pauseReason : '') });
        }
        return null;
      });
    }

    function finish(outcome) {
      var status = STATUSES.indexOf(outcome.status) >= 0 ? outcome.status : 'error';
      var result = {
        id: current.id,
        status: status,
        detail: String(outcome.detail || '').slice(0, 1000),
        typedMs: Math.max(0, Math.round(current.typedMs || 0)),
        keystrokes: current.keystrokes || 0,
        typos: current.typos || 0
      };
      // Text that was typed but will not be sent is removed. A page showing a
      // warning is left exactly as it is.
      var typedSomething = ['typing', 'sending', 'confirm'].indexOf(current.stage) >= 0;
      var cleanup = status !== 'blocked' && status !== 'sent' && typedSomething ? clearComposerQuietly() : Promise.resolve();

      return cleanup
        .then(function () {
          current.stage = 'report';
          current.result = result;
          return save();
        })
        .then(function () {
          return get(KEY.log);
        })
        .then(function (stored) {
          var log = Array.isArray(stored) ? stored : [];
          log.unshift({ id: result.id, handle: current.handle, name: current.name, status: status, detail: result.detail, at: now(), typedMs: result.typedMs, keystrokes: result.keystrokes, typos: result.typos });
          return set(KEY.log, log.slice(0, LOG_SIZE));
        })
        .then(function () {
          return postResult(result).then(
            function () {
              return local.remove(KEY.task);
            },
            function () {
              /* the result stays stored and is posted again on the next tick */
            }
          );
        });
    }

    function runTask(task) {
      var problem = validateTask(task);
      if (problem) {
        var id = task && (typeof task.id === 'string' || typeof task.id === 'number') ? task.id : null;
        var detail = 'Not a Business Suite task this helper can run: ' + problem + '. Nothing was opened.';
        if (id === null) return set(KEY.poll, { nextAt: now() + 60000, reason: detail });
        current = { id: id, handle: cleanHandle(task.handle), name: squash(task.name), stage: 'open', tabId: null, typedMs: 0, keystrokes: 0, typos: 0, deadline: now() + TASK_TIMEOUT_MS };
        // A task meant for the other sender is handed back as skipped: it is not a broken page.
        return finish({ status: task.channel === 'suite' ? 'error' : 'skipped', detail: detail }).then(function () {
          current = null;
        });
      }
      abort = null;
      current = newState(task);
      return save()
        .then(function () {
          return execute(task);
        })
        .then(
          function (outcome) {
            return outcome;
          },
          function (err) {
            if (err && err.outcome) return err.outcome;
            return { status: 'error', detail: 'Unexpected error during stage "' + current.stage + '": ' + (err && err.message ? err.message : String(err)) };
          }
        )
        .then(finish)
        .then(function () {
          current = null;
          abort = null;
        });
    }

    // A task found in storage that this worker is not running: the worker was
    // restarted in the middle of it. It is never resumed. It is failed and
    // reported, with as much truth about the send as the page still shows.
    function recover(stored) {
      current = stored;
      if (stored.stage === 'report' && stored.result) {
        return postResult(stored.result).then(
          function () {
            current = null;
            return local.remove(KEY.task);
          },
          function () {
            current = null;
          }
        );
      }
      var outcome = { status: 'error', detail: 'The extension service worker restarted during stage "' + stored.stage + '". The task was abandoned and anything typed was cleared.' };
      var look = Promise.resolve();
      if (stored.sendPressed && stored.tabId !== null) {
        look = tabCmd(stored.tabId, 'thread', {}).then(
          function (t) {
            var seen = sentSeen(t);
            if (seen || (t.composer && !t.composerText)) {
              outcome = { status: 'sent', detail: 'The service worker restarted after send was pressed. ' + (seen ? 'The message appears in the chat.' : 'Unconfirmed: the reply box is empty.') };
            } else {
              outcome.detail = 'The service worker restarted after send was pressed and the text is still in the reply box. It was cleared.';
            }
          },
          function () {
            outcome.detail = 'The service worker restarted after send was pressed and the page could not be read. The message MAY have been sent.';
          }
        );
      }
      current.deadline = now() + 60000;
      return look
        .then(function () {
          return finish(outcome);
        })
        .then(function () {
          current = null;
        });
    }

    /* ---------------------------- polling ---------------------------- */

    function pollOnce() {
      return local.get([KEY.task, KEY.poll]).then(function (d) {
        d = d || {};
        if (d[KEY.task]) return recover(d[KEY.task]);
        return getSettings().then(function (s) {
          if (!s.enabled) return null;
          // The outreach sender has its own tab and its own task. The two never run together.
          if (blocked()) return null;
          var poll = d[KEY.poll] || {};
          if (poll.nextAt && now() < poll.nextAt) return null;
          return api('outreachNext', { account: '', channel: 'suite' }).then(
            function (res) {
              if (!res || !res.task) {
                var retry = Number(res && res.retryInSec);
                if (!isFinite(retry) || retry < 0) retry = 60;
                retry = Math.min(retry, 6 * 3600);
                return set(KEY.poll, { nextAt: now() + retry * 1000, reason: String((res && res.reason) || '') });
              }
              return set(KEY.poll, { nextAt: 0, reason: '' }).then(function () {
                return runTask(res.task);
              });
            },
            function (err) {
              return set(KEY.poll, { nextAt: now() + 60000, reason: 'The app could not be asked for the next message: ' + (err && err.message ? err.message : String(err)) });
            }
          );
        });
      });
    }

    // One polling tick. A tick that arrives while another is running does
    // nothing, which is what keeps tasks strictly one at a time.
    function tick() {
      if (busy) return Promise.resolve('busy');
      busy = true;
      lastTick = pollOnce().then(
        function () {
          busy = false;
          return 'done';
        },
        function (err) {
          busy = false;
          current = null;
          return 'failed: ' + (err && err.message ? err.message : String(err));
        }
      );
      return lastTick;
    }

    /* ---------------------------- public ---------------------------- */

    function onTabRemoved(tabId) {
      return storedTabId().then(function (id) {
        if (id !== tabId) return;
        if (current && current.stage !== 'report') abort = { status: 'error', detail: 'The Business Suite tab was closed during stage "' + current.stage + '".' };
        return session.remove(KEY.tab);
      });
    }

    // Switched by the app's own setting, which the service worker reads on its
    // heartbeat. Nothing in a page can switch it.
    function setEnabled(enabled) {
      var on = enabled === true;
      return getSettings().then(function (s) {
        if (s.enabled === on) return s;
        if (!on && current && current.stage !== 'report') {
          abort = { status: 'skipped', detail: 'Business Suite sending was switched off during stage "' + current.stage + '". Anything typed was cleared and nothing was sent.' };
        }
        var next = { enabled: on, note: '' };
        return set(KEY.settings, next)
          .then(function () {
            return on ? set(KEY.poll, { nextAt: 0, reason: '' }) : null;
          })
          .then(function () {
            return next;
          });
      });
    }

    function localStatus() {
      return local.get([KEY.settings, KEY.task, KEY.log, KEY.poll]).then(function (d) {
        d = d || {};
        var s = d[KEY.settings] || {};
        var t = d[KEY.task];
        return {
          enabled: s.enabled === true,
          note: s.note || '',
          running: t ? { id: t.id, handle: t.handle, name: t.name, stage: t.stage, startedAt: t.startedAt } : null,
          poll: d[KEY.poll] || { nextAt: 0, reason: '' },
          log: (Array.isArray(d[KEY.log]) ? d[KEY.log] : []).slice(0, 5)
        };
      });
    }

    return {
      tick: tick,
      onTabRemoved: onTabRemoved,
      setEnabled: setEnabled,
      localStatus: localStatus,
      isBusy: function () {
        return busy;
      },
      // settles when the tick in progress, if any, is over (used by tests)
      idle: function () {
        return lastTick;
      }
    };
  }

  return {
    INBOX_URL: INBOX_URL,
    TASK_TIMEOUT_MS: TASK_TIMEOUT_MS,
    CONTENT_FILES: CONTENT_FILES,
    STATUSES: STATUSES,
    KEY: KEY,
    MAX_OPENED: MAX_OPENED,
    validateTask: validateTask,
    matchThread: matchThread,
    candidates: candidates,
    sameMessage: sameMessage,
    createRunner: createRunner
  };
});
