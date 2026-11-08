/*
 * outreach-runner.js (service worker side of the outreach sender)
 *
 * The task state machine. One task is one message to one lead:
 *   open      open the lead's profile in the dedicated outreach tab
 *   profile   check for block signals, find the Message button, click it
 *   composer  wait for the composer of the thread that opens
 *   reading   wait readMs
 *   typing    send the typing plan to the tab, one step per message
 *   sending   auto mode only: press send
 *   confirm   auto mode only: read the message back from the thread
 *   report    POST the result to the app
 *
 * Rules kept here:
 *   - One task at a time. A stored task blocks every new one.
 *   - Only the tab this file created is ever navigated, injected or typed in.
 *     It never looks up, picks or touches any other tab.
 *   - Every wait runs here, not in the page, because a background tab
 *     throttles its timers. Nothing spoofs visibility or focus.
 *   - The state is written to chrome.storage.local at each stage, so a
 *     restarted service worker fails the task cleanly and still reports it.
 *   - A block signal stops the task at once, reports "blocked" and switches
 *     outreach off in the extension.
 *   - A hard timeout of about 6 minutes per task.
 *
 * No DOM access and no page selectors live here. The page work is done by
 * src/outreach/outreach-content.js through small commands.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AIDMOutreach = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var ALARM = 'aidm-outreach';
  var TASK_TIMEOUT_MS = 6 * 60 * 1000;
  var CMD_TIMEOUT_MS = 15000;
  var READ_MAX_MS = 60000;
  var LOG_SIZE = 8;
  var FAIL_STREAK_LIMIT = 3;
  var MESSAGE_TYPE = 'aidm:outreach';
  var STATUSES = ['sent', 'typed', 'unreachable', 'not_found', 'blocked', 'error', 'skipped'];

  // Injected into the outreach tab, in this order, after every navigation.
  var CONTENT_FILES = [
    'src/selectors.js',
    'src/lib/core.js',
    'src/lib/typing.js',
    'src/content/dom.js',
    'src/outreach/outreach-content.js'
  ];

  var KEY = {
    settings: 'outreach', // { enabled, account, note }
    task: 'outreachTask', // the running task, see newState()
    log: 'outreachLog', // last results, newest first
    poll: 'outreachPoll', // { nextAt, reason }
    hold: 'outreachHold', // assisted mode: text waiting for the person to send
    proven: 'outreachProven', // { messageButton: true } once it was found for real
    streak: 'outreachStreak', // consecutive "error" or "unreachable" results
    tab: 'outreachTabId'
  };

  function Stop(status, detail) {
    var e = new Error(detail || status);
    e.name = 'OutreachStop';
    e.outcome = { status: status, detail: detail || '' };
    return e;
  }

  // Accepts only https://www.instagram.com/<handle>/ so a task can never point
  // the tab anywhere else. Returns the normalised URL or null.
  function profileUrlFor(task) {
    var handle = String((task && task.handle) || '').replace(/^@/, '').trim();
    var raw = String((task && task.profileUrl) || '').trim() || (handle ? 'https://www.instagram.com/' + handle + '/' : '');
    var u;
    try {
      u = new URL(raw);
    } catch (e) {
      return null;
    }
    if (u.protocol !== 'https:' || u.hostname !== 'www.instagram.com' || u.port || u.username || u.password) return null;
    var m = /^\/([A-Za-z0-9._]{1,30})\/?$/.exec(u.pathname);
    if (!m) return null;
    if (handle && m[1].toLowerCase() !== handle.toLowerCase()) return null;
    return 'https://www.instagram.com/' + m[1] + '/';
  }

  function validateTask(task) {
    if (!task || typeof task !== 'object') return 'task is not an object';
    if (typeof task.id !== 'string' && typeof task.id !== 'number') return 'task.id is missing';
    if (typeof task.handle !== 'string' || !task.handle.trim()) return 'task.handle is missing';
    if (typeof task.text !== 'string' || !task.text.trim()) return 'task.text is empty';
    if (task.text.length > 2000) return 'task.text is longer than 2000 characters';
    if (!profileUrlFor(task)) return 'task.profileUrl is not https://www.instagram.com/<handle>/ for this handle';
    return null;
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
        return { enabled: s.enabled === true, account: typeof s.account === 'string' ? s.account : '', note: typeof s.note === 'string' ? s.note : '' };
      });
    }
    function patchSettings(patch) {
      return getSettings().then(function (s) {
        Object.keys(patch).forEach(function (k) {
          s[k] = patch[k];
        });
        return set(KEY.settings, s).then(function () {
          return s;
        });
      });
    }

    function badge(text) {
      try {
        if (chrome.action && chrome.action.setBadgeText) {
          var p = chrome.action.setBadgeText({ text: text });
          if (p && p.catch) p.catch(function () {});
        }
      } catch (e) {
        /* the badge is a nicety */
      }
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

    // Navigates the outreach tab, creating it (pinned, in the background) when
    // it does not exist yet. Returns its id.
    function openInTab(url) {
      return existingTab().then(function (tab) {
        if (tab) {
          return chrome.tabs.update(tab.id, { url: url }).then(function () {
            return tab.id;
          });
        }
        return chrome.tabs.create({ url: url, active: false, pinned: true }).then(function (created) {
          var o = {};
          o[KEY.tab] = created.id;
          return session.set(o).then(function () {
            return created.id;
          });
        });
      });
    }

    function inject(tabId) {
      return withTimeout(chrome.scripting.executeScript({ target: { tabId: tabId }, files: CONTENT_FILES }), 30000, 'Script injection into the outreach tab');
    }

    // Waits until the tab reports that its navigation finished. Not fatal when
    // it never does: the probes that follow decide what the page really shows.
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
            throw Stop('error', 'The outreach tab was closed while the profile was loading.');
          }
        );
      }
      return attempt();
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

    // Sends one command to the outreach tab. When the page was replaced (a
    // navigation destroys the content script) the files are injected again and
    // the command is retried once, except for commands that change the page.
    function tabCmd(tabId, cmd, arg, noRetry) {
      var msg = { type: MESSAGE_TYPE, cmd: cmd };
      Object.keys(arg || {}).forEach(function (k) {
        msg[k] = arg[k];
      });
      function send() {
        return withTimeout(chrome.tabs.sendMessage(tabId, msg), CMD_TIMEOUT_MS, 'The outreach tab');
      }
      return send().then(
        function (res) {
          if (res !== undefined && res !== null) return res;
          if (noRetry) throw new Error('The outreach tab gave no answer to "' + cmd + '". The page may have reloaded.');
          return inject(tabId).then(send);
        },
        function (err) {
          if (noRetry) throw new Error('The outreach tab could not be reached for "' + cmd + '" (' + err.message + '). The page may have reloaded.');
          return inject(tabId).then(send);
        }
      ).then(function (res) {
        if (res === undefined || res === null) throw new Error('The outreach tab gave no answer to "' + cmd + '".');
        return res;
      });
    }

    /* ---------------------------- task state ---------------------------- */

    function newState(task, url) {
      var t = now();
      return {
        id: task.id,
        handle: String(task.handle).replace(/^@/, '').trim(),
        mode: task.mode === 'auto' ? 'auto' : 'assisted',
        url: url,
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

    /* ---------------------------- the stages ---------------------------- */

    function probe(detect) {
      return tabCmd(current.tabId, 'probe', { detect: detect }).then(function (p) {
        if (!p.ok) throw Stop('error', 'Probe failed: ' + (p.error || 'unknown error'));
        return p;
      });
    }

    function stopIfBlocked(p, when) {
      if (p.block) throw Stop('blocked', 'Block signal ' + when + ': ' + p.block + '.');
    }

    function onProfilePath(p) {
      return String(p.path || '').toLowerCase().replace(/\/+$/, '') === '/' + current.handle.toLowerCase();
    }

    // Polls the page until the Message button shows, or decides why it will not.
    function waitForProfile(detect) {
      var deadline = now() + 25000;
      var last = null;
      function attempt() {
        return probe(detect).then(function (p) {
          last = p;
          stopIfBlocked(p, 'on the profile page');
          if (p.notFound && onProfilePath(p)) throw Stop('not_found', 'The profile page shows "' + p.notFound + '".');
          if (onProfilePath(p) && p.messageButtons > 0) return p;
          if (now() >= deadline) return null;
          return wait(1000).then(attempt);
        });
      }
      return attempt().then(function (p) {
        if (p) return p;
        if (!onProfilePath(last)) {
          throw Stop('error', 'The outreach tab is on ' + last.path + ' instead of /' + current.handle + '/. Nothing was clicked.');
        }
        return get(KEY.proven).then(function (proven) {
          if (last.profile && proven && proven.messageButton) {
            throw Stop('unreachable', 'The profile loaded but shows no Message button, so this account cannot be messaged from its profile.');
          }
          throw Stop(
            'error',
            'Selector miss: instagramOutreach.messageButton' + (last.profile ? '' : ' and instagramOutreach.profileHeader') +
              ' on /' + current.handle + '/. Nothing was clicked. The Message button selector has never matched on the live site yet, ' +
              'so this is reported as an error and not as an unreachable profile. Run "Selector health check" on a profile page and fix src/selectors.js.'
          );
        });
      });
    }

    function waitForComposer(detect) {
      var deadline = now() + 25000;
      function attempt() {
        return probe(detect).then(function (p) {
          stopIfBlocked(p, 'after clicking Message');
          if (p.composer) return p;
          if (now() >= deadline) {
            throw Stop(
              'error',
              'Selector miss: instagramOutreach.composer. The Message button was clicked but no composer appeared within 25 seconds (page: ' + p.path + '). Nothing was typed.'
            );
          }
          return wait(1000).then(attempt);
        });
      }
      return attempt();
    }

    function checkThread(p) {
      if (p.threadHandle && p.threadHandle.toLowerCase() !== current.handle.toLowerCase()) {
        throw Stop('error', 'The opened thread belongs to @' + p.threadHandle + ', not @' + current.handle + '. Nothing was typed.');
      }
      if (p.composerText) {
        throw Stop('skipped', 'The composer already held text (' + p.composerText.length + ' characters) before anything was typed. Nothing was typed or sent.');
      }
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
        return wait(due - now()).then(function () {
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
        }).then(function () {
          k++;
          current.typedMs = now() - startedAt;
          if (k % 40 !== 0 || k >= plan.length) return null;
          return probe(detect).then(function (p) {
            stopIfBlocked(p, 'while typing');
            if (!p.composer) throw Stop('error', 'The composer disappeared while typing (page: ' + p.path + ').');
          });
        }).then(next);
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
          'The composer text did not match the target after typing (' + have.length + ' characters, expected ' + current.text.length +
            ', first difference at character ' + (at + 1) + '). The composer was cleared and nothing was sent.'
        );
      });
    }

    function sameText(a, b) {
      return String(a).replace(/\s+/g, ' ').trim() === String(b).replace(/\s+/g, ' ').trim();
    }

    // Presses send and watches the thread. Returns the outcome.
    function sendAndConfirm(detect) {
      var method = null;
      var retried = false;
      var pressedAt = 0;
      var deadline = 0;

      function press(how) {
        current.sendPressed = true;
        return save().then(function () {
          return tabCmd(current.tabId, 'send', { expect: current.text, method: how }, true);
        }).then(function (r) {
          if (!r.ok) throw Stop('error', 'Send was refused: ' + r.error + ' The composer was cleared and nothing was sent.');
          method = r.method;
        });
      }

      function poll() {
        return tabCmd(current.tabId, 'last-bubbles', {}).then(function (b) {
          var emptied = !b.composerText;
          var seen = (b.texts || []).some(function (t) {
            return sameText(t, current.text);
          });
          if (emptied && seen) return { emptied: true, seen: true };
          if (!emptied && !retried && method === 'button' && now() - pressedAt > 4000) {
            retried = true;
            return press('enter').then(function () {
              return wait(700).then(poll);
            });
          }
          if (now() >= deadline) return { emptied: emptied, seen: seen };
          return wait(700).then(poll);
        });
      }

      return press('auto').then(function () {
        pressedAt = now();
        deadline = pressedAt + 20000;
        return stage('confirm');
      }).then(function () {
        return wait(600).then(poll);
      }).then(function (seenState) {
        return probe(detect).then(function (p) {
          if (p.block) {
            throw Stop(
              'blocked',
              'Block signal after pressing send: ' + p.block + '. ' +
                (seenState.seen ? 'The message does appear in the thread.' : seenState.emptied ? 'The composer had emptied, so the message may have gone out.' : 'The text was still in the composer.')
            );
          }
          if (seenState.emptied && seenState.seen) return { status: 'sent', detail: 'Sent with ' + method + ' and read back from the thread.' };
          if (seenState.emptied) {
            return {
              status: 'sent',
              detail: 'Sent with ' + method + ', unconfirmed: the composer emptied, but the message could not be read back from the thread. ' +
                'Check instagramOutreach.messageList, messageRow and messageText in src/selectors.js.'
            };
          }
          throw Stop('error', 'Send was pressed (' + (retried ? 'button, then Enter' : method) + ') but the text stayed in the composer. The composer was cleared.');
        });
      });
    }

    function execute(task) {
      var detect = task.detect && typeof task.detect === 'object' ? task.detect : null;
      var readMs = Math.max(0, Math.min(READ_MAX_MS, Number(task.readMs) || 0));

      return openInTab(current.url)
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
          return stage('profile');
        })
        .then(function () {
          return waitForProfile(detect);
        })
        .then(function (p) {
          var jobs = [set(KEY.proven, { messageButton: true })];
          if (p.account) jobs.push(patchSettings({ account: p.account }));
          return Promise.all(jobs);
        })
        .then(function () {
          return wait(between(1200, 3800));
        })
        .then(function () {
          return tabCmd(current.tabId, 'click-message', {}, true).then(
            function (r) {
              if (!r.ok) throw Stop('error', 'The Message button was not clicked: ' + r.error);
            },
            function (err) {
              throw Stop('error', 'The Message button was not clicked: ' + err.message);
            }
          );
        })
        .then(function () {
          return stage('composer');
        })
        .then(function () {
          return waitForComposer(detect);
        })
        .then(function (p) {
          checkThread(p);
          return stage('reading');
        })
        .then(function () {
          return wait(readMs);
        })
        .then(function () {
          return probe(detect);
        })
        .then(function (p) {
          stopIfBlocked(p, 'before typing');
          if (!p.composer) throw Stop('error', 'Selector miss: instagramOutreach.composer. The composer was there, then disappeared before typing (page: ' + p.path + ').');
          checkThread(p);
          return stage('typing');
        })
        .then(function () {
          return tabCmd(current.tabId, 'focus-composer', {}).then(function (r) {
            if (!r.ok) throw Stop('error', 'The composer could not be focused: ' + r.error);
            if (r.text) throw Stop('skipped', 'The composer already held text before anything was typed. Nothing was typed or sent.');
          });
        })
        .then(function () {
          return typePlan(task, detect);
        })
        .then(function () {
          return verifyTyped();
        })
        .then(function () {
          return probe(detect);
        })
        .then(function (p) {
          stopIfBlocked(p, 'after typing');
          if (current.mode !== 'auto') {
            return stage('typed')
              .then(function () {
                return set(KEY.hold, { id: current.id, handle: current.handle, text: current.text, since: now() });
              })
              .then(function () {
                badge('SEND');
                return tabCmd(current.tabId, 'notice', {
                  title: 'Ainable Setter: message typed, not sent',
                  text: 'The message for @' + current.handle + ' is in the box below. Read it, then press Enter or Send yourself. The extension will not send it in assisted mode.'
                }).catch(function () {});
              })
              .then(function () {
                return { status: 'typed', detail: 'Typed into the composer and left for the person to send (assisted mode).' };
              });
          }
          return wait(between(400, 1500))
            .then(function () {
              return stage('sending');
            })
            .then(function () {
              return sendAndConfirm(detect);
            });
        });
    }

    /* ---------------------------- finishing ---------------------------- */

    // Each attempt is its own message to the tab, so an editor that only
    // notices a new selection a moment later gets that moment.
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
      // Text that was typed but will not be sent is removed. A blocked page is
      // left exactly as it is, and an assisted message stays for the person.
      var typedSomething = ['typing', 'sending', 'confirm'].indexOf(current.stage) >= 0;
      var cleanup = status !== 'blocked' && status !== 'sent' && status !== 'typed' && typedSomething ? clearComposerQuietly() : Promise.resolve();

      return cleanup
        .then(function () {
          current.stage = 'report';
          current.result = result;
          return save();
        })
        .then(function () {
          return Promise.all([get(KEY.log), get(KEY.streak)]);
        })
        .then(function (d) {
          var log = Array.isArray(d[0]) ? d[0] : [];
          log.unshift({ id: result.id, handle: current.handle, mode: current.mode, status: status, detail: result.detail, at: now(), typedMs: result.typedMs, keystrokes: result.keystrokes, typos: result.typos });
          var streak = status === 'error' || status === 'unreachable' ? (Number(d[1]) || 0) + 1 : 0;
          var jobs = [set(KEY.log, log.slice(0, LOG_SIZE)), set(KEY.streak, streak)];
          if (status === 'blocked') {
            jobs.push(patchSettings({ enabled: false, note: 'Switched off after a block signal on @' + current.handle + ': ' + result.detail + ' Check the account in Instagram before switching outreach on again.' }));
          } else if (streak >= FAIL_STREAK_LIMIT) {
            jobs.push(set(KEY.streak, 0));
            jobs.push(patchSettings({ enabled: false, note: 'Switched off after ' + streak + ' failed tasks in a row. Last: ' + result.detail }));
          }
          return Promise.all(jobs);
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
        var detail = 'Malformed task from the app: ' + problem + '. Nothing was opened.';
        if (id === null) return set(KEY.poll, { nextAt: now() + 60000, reason: detail });
        current = { id: id, handle: String(task.handle || ''), mode: String(task.mode || ''), stage: 'open', tabId: null, typedMs: 0, keystrokes: 0, typos: 0, deadline: now() + TASK_TIMEOUT_MS };
        return finish({ status: 'error', detail: detail }).then(function () {
          current = null;
        });
      }
      abort = null;
      current = newState(task, profileUrlFor(task));
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
      if (stored.stage === 'typed') {
        outcome = { status: 'typed', detail: 'Typed into the composer and left for the person to send (assisted mode).' };
      } else if (stored.sendPressed && stored.tabId !== null) {
        look = tabCmd(stored.tabId, 'last-bubbles', {}).then(
          function (b) {
            var seen = (b.texts || []).some(function (t) {
              return sameText(t, stored.text);
            });
            if (seen || (b.composerFound && !b.composerText)) {
              outcome = { status: 'sent', detail: 'The service worker restarted after send was pressed. ' + (seen ? 'The message appears in the thread.' : 'Unconfirmed: the composer is empty.') };
            } else {
              outcome.detail = 'The service worker restarted after send was pressed and the text is still in the composer. It was cleared.';
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

    // Assisted mode: while the typed message is still sitting in the composer,
    // no new task is fetched, so the tab is not navigated away under it.
    function stillHolding(hold) {
      return existingTab().then(function (tab) {
        if (!tab) return false;
        return tabCmd(tab.id, 'read-composer', {}).then(
          function (r) {
            return !!r && r.ok && r.text === hold.text;
          },
          function () {
            return false;
          }
        );
      });
    }

    function releaseHold() {
      badge('');
      return local.remove(KEY.hold).then(function () {
        return existingTab();
      }).then(function (tab) {
        if (!tab) return null;
        return tabCmd(tab.id, 'notice', { text: '' }, true).catch(function () {});
      });
    }

    function pollOnce() {
      return local.get([KEY.task, KEY.hold, KEY.poll]).then(function (d) {
        d = d || {};
        if (d[KEY.task]) return recover(d[KEY.task]);
        return getSettings().then(function (s) {
          if (!s.enabled) return null;
          var holdCheck = d[KEY.hold]
            ? stillHolding(d[KEY.hold]).then(function (holding) {
                if (holding) return true;
                return releaseHold().then(function () {
                  return false;
                });
              })
            : Promise.resolve(false);
          return holdCheck.then(function (holding) {
            if (holding) return null;
            var poll = d[KEY.poll] || {};
            if (poll.nextAt && now() < poll.nextAt) return null;
            return api('outreachNext', { account: s.account || '' }).then(
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
                return set(KEY.poll, { nextAt: now() + 60000, reason: 'The app could not be asked for the next task: ' + (err && err.message ? err.message : String(err)) });
              }
            );
          });
        });
      });
    }

    // One polling tick. Returns a promise that settles when the tick, and any
    // task it started, is over. A tick that arrives while another is running
    // does nothing, which is what keeps tasks strictly one at a time.
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

    function init() {
      return chrome.alarms.get(ALARM).then(function (existing) {
        if (!existing) return chrome.alarms.create(ALARM, { periodInMinutes: 1 });
        return null;
      });
    }

    function onAlarm(alarm) {
      if (alarm && alarm.name === ALARM) return tick();
      return Promise.resolve('ignored');
    }

    function onTabRemoved(tabId) {
      return storedTabId().then(function (id) {
        if (id !== tabId) return;
        if (current && current.stage !== 'report') abort = { status: 'error', detail: 'The outreach tab was closed during stage "' + current.stage + '".' };
        return session.remove(KEY.tab);
      });
    }

    function setEnabled(enabled) {
      var on = enabled === true;
      if (!on && current && current.stage !== 'report') {
        abort = { status: 'skipped', detail: 'Outreach was switched off during stage "' + current.stage + '". Anything typed was cleared and nothing was sent.' };
      }
      return patchSettings({ enabled: on, note: '' })
        .then(function () {
          return on ? set(KEY.poll, { nextAt: 0, reason: '' }) : null;
        })
        .then(function () {
          if (on) tick(); // do not wait for the next alarm
          return localStatus();
        });
    }

    function localStatus() {
      return local.get([KEY.settings, KEY.task, KEY.log, KEY.poll, KEY.hold]).then(function (d) {
        d = d || {};
        var s = d[KEY.settings] || {};
        var t = d[KEY.task];
        return {
          enabled: s.enabled === true,
          account: s.account || '',
          note: s.note || '',
          running: t ? { id: t.id, handle: t.handle, mode: t.mode, stage: t.stage, startedAt: t.startedAt } : null,
          hold: d[KEY.hold] ? { handle: d[KEY.hold].handle, since: d[KEY.hold].since } : null,
          poll: d[KEY.poll] || { nextAt: 0, reason: '' },
          log: (Array.isArray(d[KEY.log]) ? d[KEY.log] : []).slice(0, 5)
        };
      });
    }

    // Local state plus the app's live view from GET /api/ext/outreach/status.
    function status() {
      return localStatus().then(function (out) {
        return api('outreachStatus').then(
          function (server) {
            out.server = server;
            out.serverError = null;
            return out;
          },
          function (err) {
            out.server = null;
            out.serverError = err && err.message ? err.message : String(err);
            return out;
          }
        );
      });
    }

    return {
      init: init,
      tick: tick,
      onAlarm: onAlarm,
      onTabRemoved: onTabRemoved,
      setEnabled: setEnabled,
      status: status,
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
    ALARM: ALARM,
    TASK_TIMEOUT_MS: TASK_TIMEOUT_MS,
    CONTENT_FILES: CONTENT_FILES,
    STATUSES: STATUSES,
    KEY: KEY,
    profileUrlFor: profileUrlFor,
    validateTask: validateTask,
    createRunner: createRunner
  };
});
