/*
 * harness.js (test only, not loaded by the extension)
 * Fakes chrome.runtime and the web app so the real content scripts can run in
 * a plain page. The fixture pages imitate the GUESSED structure of the inbox,
 * so a pass here proves the code paths work against that guess. It proves
 * nothing about the real Instagram or Business Suite DOM.
 */
(function () {
  'use strict';
  var T = (window.__T = {
    listeners: [],
    ingests: [],
    acks: [],
    runUpdates: [],
    apiCalls: [],
    sendClicks: 0,
    runWaiters: [],
    queue: [],
    cap: 40,
    pauses: [],
    lives: [],
    liveTries: 0,
    liveFails: false
  });

  // Tells dom.js which site this fixture stands in for.
  globalThis.AIDM = { siteOverride: window.__SITE };

  function app(call, arg) {
    T.apiCalls.push(call);
    if (call === 'ingest') {
      T.ingests.push(JSON.parse(JSON.stringify(arg)));
      var total = T.ingests
        .filter(function (b) {
          return b.thread.externalId === arg.thread.externalId;
        })
        .reduce(function (n, b) {
          return n + b.messages.length;
        }, 0);
      return { conversationId: 'conv_' + arg.thread.externalId, added: arg.messages.length, total: total };
    }
    if (call === 'conversation') {
      return {
        found: true,
        conversationId: 'conv_1',
        stage: 'Qualified',
        labels: ['Hot lead'],
        aiMode: 'suggest',
        windowOpen: true,
        suggestion: { bubbles: ['Hey there, thanks for reaching out', 'Want me to send the link?'], reason: 'Asked about price' }
      };
    }
    if (call === 'live') {
      T.liveTries++;
      if (T.liveFails) throw new Error('app unreachable');
      T.lives.push(JSON.parse(JSON.stringify(arg)));
      return { added: 1, matched: 0, conversations: [] };
    }
    if (call === 'suggest') return { bubbles: ['Fresh suggestion'], reason: 'New', stage: 'Booked', labels: ['VIP'] };
    if (call === 'labelQueue') return { items: T.queue };
    if (call === 'labelAck') {
      T.acks.push(JSON.parse(JSON.stringify(arg)));
      return { ok: true };
    }
    throw new Error('unknown call ' + call);
  }

  function answer(msg) {
    if (msg.type === 'aidm:settings') {
      return { baseUrl: 'http://localhost:3000', configured: true, captureCap: T.cap, showPanel: true, applyLabels: true, skipUnread: true };
    }
    if (msg.type === 'aidm:api') return app(msg.call, msg.arg);
    if (msg.type === 'aidm:sync-claim') return { leader: true };
    if (msg.type === 'aidm:sync-status') return { saved: true };
    if (msg.type === 'aidm:run-update') {
      T.runUpdates.push(msg.run);
      var w = T.runWaiters.slice();
      T.runWaiters.length = 0;
      w.forEach(function (fn) {
        fn(msg.run);
      });
      return { saved: true };
    }
    throw new Error('unknown message ' + msg.type);
  }

  var stub = {
    runtime: {
      id: 'fixture-ext',
      lastError: null,
      sendMessage: function (msg, cb) {
        setTimeout(function () {
          try {
            cb({ ok: true, data: answer(msg) });
          } catch (e) {
            cb({ ok: false, error: e.message });
          }
        }, 5);
      },
      onMessage: {
        addListener: function (fn) {
          T.listeners.push(fn);
        }
      }
    }
  };
  try {
    window.chrome = stub;
  } catch (e) {
    /* fall through */
  }
  if (!window.chrome || window.chrome.runtime !== stub.runtime) {
    Object.defineProperty(window, 'chrome', { value: stub, configurable: true });
  }

  // Record every pause the content scripts take, to check the 4 to 9 second rule.
  T.wrapPauses = function () {
    var Core = globalThis.AIDMCore;
    var original = Core.randomPause;
    Core.randomPause = function () {
      var ms = original.apply(Core, arguments);
      T.pauses.push(ms);
      return ms;
    };
  };

  T.cmd = function (cmd) {
    return new Promise(function (resolve) {
      T.listeners[0]({ type: 'aidm:cmd', cmd: cmd }, { id: 'fixture-ext' }, resolve);
    });
  };

  T.nextRun = function () {
    return new Promise(function (resolve) {
      T.runWaiters.push(resolve);
    });
  };

  T.sleep = function (ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  };

  T.until = function (fn, ms) {
    var deadline = Date.now() + (ms || 15000);
    return (function attempt() {
      if (fn()) return Promise.resolve(true);
      if (Date.now() > deadline) return Promise.resolve(false);
      return T.sleep(100).then(attempt);
    })();
  };

  T.panelText = function () {
    var host = document.getElementById('aidm-setter-root');
    return host && host.shadowRoot ? host.shadowRoot.textContent : '';
  };

  T.panelButton = function (label) {
    var host = document.getElementById('aidm-setter-root');
    if (!host) return null;
    var all = host.shadowRoot.querySelectorAll('button');
    for (var i = 0; i < all.length; i++) if (all[i].textContent === label) return all[i];
    return null;
  };

  T.finish = function (results) {
    var pre = document.createElement('pre');
    pre.id = 'results';
    pre.textContent = JSON.stringify(results);
    document.body.appendChild(pre);
    document.title = 'DONE';
  };
})();
