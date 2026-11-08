/*
 * panel.js
 * The side panel injected into the inbox. Lives in a shadow root so page CSS
 * cannot leak in and panel CSS cannot leak out. All app data is written with
 * textContent, never as HTML.
 *
 * The progress box (bar plus Stop button) is always shown while a run is
 * active, even when "Show side panel" is switched off.
 */
(function () {
  'use strict';
  var AIDM = (globalThis.AIDM = globalThis.AIDM || {});
  if (AIDM.panel) return;

  var HOST_ID = 'aidm-setter-root';

  var CSS = [
    ':host { all: initial; }',
    '* { box-sizing: border-box; }',
    '.wrap { position: fixed; top: 76px; right: 12px; z-index: 2147483000; width: 300px; max-height: calc(100vh - 100px);',
    '  display: flex; flex-direction: column; font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
    '  color: #111; background: #fff; border: 1px solid #d0d0d0; border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,.18); overflow: hidden; }',
    '.wrap.collapsed { width: auto; }',
    '.head { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: #111; color: #fff; }',
    '.head .title { font-weight: 600; flex: 1; white-space: nowrap; }',
    '.head button { background: transparent; color: #fff; border: 1px solid #555; border-radius: 6px; padding: 2px 8px; cursor: pointer; font: inherit; }',
    '.body { padding: 10px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }',
    '.row { display: flex; gap: 6px; align-items: baseline; }',
    '.k { color: #666; min-width: 74px; font-size: 12px; }',
    '.v { flex: 1; word-break: break-word; }',
    '.name { font-weight: 600; font-size: 14px; }',
    '.chips { display: flex; flex-wrap: wrap; gap: 4px; }',
    '.chip { background: #eee; border-radius: 999px; padding: 1px 8px; font-size: 12px; }',
    '.bubble { border: 1px solid #ddd; border-radius: 10px; padding: 7px 9px; background: #f7f7f7; white-space: pre-wrap; word-break: break-word; }',
    '.bubble-row { display: flex; flex-direction: column; gap: 4px; }',
    '.reason { color: #666; font-size: 12px; }',
    '.btns { display: flex; flex-wrap: wrap; gap: 6px; }',
    'button.b { font: inherit; padding: 5px 9px; border-radius: 7px; border: 1px solid #111; background: #111; color: #fff; cursor: pointer; }',
    'button.b.ghost { background: #fff; color: #111; }',
    'button.b.small { padding: 2px 8px; font-size: 12px; align-self: flex-start; }',
    'button.b:disabled { opacity: .45; cursor: not-allowed; }',
    '.msg { border-radius: 7px; padding: 6px 8px; font-size: 12px; white-space: pre-wrap; word-break: break-word; }',
    '.msg.error { background: #fde8e8; color: #8a1111; border: 1px solid #f3b4b4; }',
    '.msg.info { background: #eef3ff; color: #1b3a8a; border: 1px solid #c6d4f7; }',
    '.msg.ok { background: #e8f7ec; color: #14622b; border: 1px solid #b4e0c1; }',
    '.progress { border-top: 1px solid #e3e3e3; padding: 10px; display: flex; flex-direction: column; gap: 6px; background: #fffbe8; }',
    '.progress .ptitle { font-weight: 600; }',
    '.progress progress { width: 100%; height: 10px; }',
    '.note { color: #666; font-size: 11px; }',
    '.hidden { display: none !important; }'
  ].join('\n');

  var state = {
    showPanel: true,
    collapsed: false,
    status: '',
    thread: null,
    conv: null,
    loading: false,
    message: null,
    runNote: null,
    progress: null,
    busy: false
  };
  var handlers = {};
  var host = null;
  var shadow = null;
  var refs = {};

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }

  function button(label, cls, onClick, disabled) {
    var b = el('button', 'b' + (cls ? ' ' + cls : ''), label);
    b.type = 'button';
    b.disabled = !!disabled;
    b.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      if (!b.disabled && onClick) onClick();
    });
    return b;
  }

  function call(name, arg) {
    if (typeof handlers[name] === 'function') handlers[name](arg);
  }

  function mount() {
    if (host && host.isConnected) return;
    host = document.createElement('div');
    host.id = HOST_ID;
    shadow = host.attachShadow({ mode: 'open' });
    var style = document.createElement('style');
    style.textContent = CSS;
    shadow.appendChild(style);

    refs.wrap = el('div', 'wrap');
    refs.head = el('div', 'head');
    refs.head.appendChild(el('span', 'title', 'Ainable Setter'));
    refs.toggle = el('button', '', 'Hide');
    refs.toggle.type = 'button';
    refs.toggle.addEventListener('click', function () {
      state.collapsed = !state.collapsed;
      render();
    });
    refs.head.appendChild(refs.toggle);
    refs.body = el('div', 'body');
    refs.progress = el('div', 'progress hidden');
    refs.wrap.appendChild(refs.head);
    refs.wrap.appendChild(refs.body);
    refs.wrap.appendChild(refs.progress);
    shadow.appendChild(refs.wrap);
    (document.body || document.documentElement).appendChild(host);
    render();
  }

  function unmount() {
    if (host && host.parentNode) host.parentNode.removeChild(host);
    host = null;
    shadow = null;
    refs = {};
  }

  function kv(key, valueNode) {
    var row = el('div', 'row');
    row.appendChild(el('span', 'k', key));
    var v = el('span', 'v');
    if (typeof valueNode === 'string') v.textContent = valueNode;
    else if (valueNode) v.appendChild(valueNode);
    row.appendChild(v);
    return row;
  }

  function renderBody() {
    var body = refs.body;
    body.textContent = '';
    var running = !!state.progress;
    var locked = running || state.busy;

    if (state.status) body.appendChild(el('div', 'note', state.status));

    if (!state.thread) {
      body.appendChild(el('div', 'note', 'Open a conversation to see its stage, labels and suggested reply.'));
    } else {
      var t = state.thread;
      body.appendChild(el('div', 'name', t.name + (t.handle ? '  @' + t.handle : '')));

      var c = state.conv;
      if (state.loading) {
        body.appendChild(el('div', 'note', 'Loading from the app...'));
      } else if (c && c.found) {
        body.appendChild(kv('Stage', c.stage || 'Not set'));
        var chips = el('div', 'chips');
        (c.labels || []).forEach(function (l) {
          chips.appendChild(el('span', 'chip', l));
        });
        if (!(c.labels || []).length) chips.appendChild(el('span', 'note', 'None'));
        body.appendChild(kv('Labels', chips));
        var win = c.windowOpen === true ? 'Open' : c.windowOpen === false ? 'Closed (the app cannot send, reply by hand)' : 'Unknown';
        body.appendChild(kv('24h window', win));
        body.appendChild(kv('AI mode', c.aiMode || 'Unknown'));

        var s = c.suggestion;
        if (s && Array.isArray(s.bubbles) && s.bubbles.length) {
          body.appendChild(el('div', 'k', 'Suggested reply'));
          s.bubbles.forEach(function (text) {
            var br = el('div', 'bubble-row');
            br.appendChild(el('div', 'bubble', text));
            br.appendChild(
              button('Insert', 'ghost small', function () {
                call('insert', text);
              }, locked)
            );
            body.appendChild(br);
          });
          if (s.reason) body.appendChild(el('div', 'reason', 'Why: ' + s.reason));
        } else {
          body.appendChild(el('div', 'note', 'No suggestion yet.'));
        }
      } else if (c && c.found === false) {
        body.appendChild(el('div', 'note', 'This conversation is not in the app yet. Capture it to add it.'));
      }

      var btns = el('div', 'btns');
      var hasBubbles = !!(c && c.found && c.suggestion && c.suggestion.bubbles && c.suggestion.bubbles.length);
      if (hasBubbles && c.suggestion.bubbles.length > 1) {
        btns.appendChild(
          button('Insert all', '', function () {
            call('insertAll');
          }, locked)
        );
      }
      btns.appendChild(
        button('New suggestion', 'ghost', function () {
          call('newSuggestion');
        }, locked || !(c && c.found && c.conversationId))
      );
      btns.appendChild(
        button('Capture this thread', 'ghost', function () {
          call('capture');
        }, locked)
      );
      body.appendChild(btns);
      body.appendChild(el('div', 'note', 'Insert only fills the message box. You press send.'));
    }

    if (state.message) body.appendChild(el('div', 'msg ' + state.message.kind, state.message.text));
    if (state.runNote) body.appendChild(el('div', 'msg ' + state.runNote.kind, 'Last run. ' + state.runNote.text));
  }

  function renderProgress() {
    var box = refs.progress;
    box.textContent = '';
    var p = state.progress;
    box.classList.toggle('hidden', !p);
    if (!p) return;
    box.appendChild(el('div', 'ptitle', p.title || 'Working'));
    var bar = document.createElement('progress');
    if (typeof p.max === 'number' && p.max > 0) {
      bar.max = p.max;
      bar.value = Math.min(p.value || 0, p.max);
    }
    box.appendChild(bar);
    if (p.detail) box.appendChild(el('div', 'note', p.detail));
    box.appendChild(
      button(p.stopping ? 'Stopping...' : 'Stop', '', function () {
        call('stop');
      }, !!p.stopping)
    );
  }

  function render() {
    if (!host || !refs.wrap) return;
    var running = !!state.progress;
    // With the panel switched off, only the progress box appears, and only during a run.
    var showAnything = state.showPanel || running;
    refs.wrap.classList.toggle('hidden', !showAnything);
    var bodyHidden = !state.showPanel || state.collapsed;
    refs.wrap.classList.toggle('collapsed', bodyHidden && !running);
    refs.body.classList.toggle('hidden', bodyHidden);
    refs.toggle.textContent = state.collapsed ? 'Show' : 'Hide';
    refs.toggle.classList.toggle('hidden', !state.showPanel);
    if (!bodyHidden) renderBody();
    renderProgress();
  }

  function set(patch) {
    Object.keys(patch).forEach(function (k) {
      state[k] = patch[k];
    });
    render();
  }

  AIDM.panel = {
    HOST_ID: HOST_ID,
    mount: mount,
    unmount: unmount,
    set: set,
    get: function () {
      return state;
    },
    on: function (map) {
      handlers = map || {};
    },
    message: function (kind, text) {
      set({ message: text ? { kind: kind, text: text } : null });
    },
    root: function () {
      return shadow;
    }
  };
})();
