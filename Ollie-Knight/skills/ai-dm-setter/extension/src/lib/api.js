/*
 * api.js
 * Client for the web app's /api/ext/* contract. Used by the service worker
 * only. Content scripts never call the app directly, they message the worker.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AIDMApi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function ApiError(message, status, code) {
    var e = new Error(message);
    e.name = 'ApiError';
    e.status = status || null;
    e.code = code || null;
    return e;
  }

  // Accepts "http://localhost:3000", "https://app.example.com/" and similar.
  // Returns the URL without a trailing slash. Throws on anything else.
  function normaliseBaseUrl(input) {
    var raw = String(input || '').trim();
    if (!raw) throw ApiError('App base URL is empty.', null, 'BAD_BASE_URL');
    var u;
    try {
      u = new URL(raw);
    } catch (e) {
      throw ApiError('App base URL is not a valid URL: ' + raw, null, 'BAD_BASE_URL');
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      throw ApiError('App base URL must start with http:// or https://', null, 'BAD_BASE_URL');
    }
    if (u.username || u.password) {
      throw ApiError('App base URL must not contain a username or password.', null, 'BAD_BASE_URL');
    }
    if (u.search || u.hash) {
      throw ApiError('App base URL must not contain a query string or a # fragment.', null, 'BAD_BASE_URL');
    }
    return u.origin + u.pathname.replace(/\/+$/, '');
  }

  // Host permission patterns for the app origin. The first has no port, which
  // is the form chrome.permissions accepts everywhere. The second keeps the
  // port to match a manifest entry such as http://localhost:3000/*.
  function originPatterns(baseUrl) {
    var u = new URL(normaliseBaseUrl(baseUrl));
    var out = [u.protocol + '//' + u.hostname + '/*'];
    if (u.port) out.push(u.protocol + '//' + u.host + '/*');
    return out;
  }

  function createApiClient(options) {
    var base = normaliseBaseUrl(options.baseUrl);
    var token = String(options.token || '').trim();
    var fetchImpl = options.fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    var defaultTimeout = options.timeoutMs || 20000;
    if (!fetchImpl) throw ApiError('fetch is not available.', null, 'NO_FETCH');

    function request(method, path, opts) {
      opts = opts || {};
      if (!token) return Promise.reject(ApiError('Workspace token is not set. Open the extension options.', null, 'NO_TOKEN'));

      var url = base + path;
      if (opts.query) {
        var qs = [];
        Object.keys(opts.query).forEach(function (k) {
          var v = opts.query[k];
          if (v === null || v === undefined || v === '') return;
          qs.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
        });
        if (qs.length) url += '?' + qs.join('&');
      }

      var headers = { Authorization: 'Bearer ' + token, Accept: 'application/json' };
      var init = { method: method, headers: headers, credentials: 'omit', cache: 'no-store', redirect: 'error' };
      if (opts.body !== undefined) {
        headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(opts.body);
      }

      var controller = typeof AbortController === 'function' ? new AbortController() : null;
      var timer = null;
      if (controller) {
        init.signal = controller.signal;
        timer = setTimeout(function () {
          controller.abort();
        }, opts.timeoutMs || defaultTimeout);
      }

      return fetchImpl(url, init)
        .then(
          function (res) {
            return res.text().then(function (text) {
              var data = null;
              if (text) {
                try {
                  data = JSON.parse(text);
                } catch (e) {
                  data = null;
                }
              }
              if (!res.ok) {
                var detail = data && (data.error || data.message) ? String(data.error || data.message) : text.slice(0, 200);
                var hint = res.status === 401 || res.status === 403 ? ' Check the workspace token.' : '';
                throw ApiError('App answered ' + res.status + ' on ' + method + ' ' + path + (detail ? ': ' + detail : '') + '.' + hint, res.status, 'HTTP');
              }
              if (data === null || typeof data !== 'object') {
                throw ApiError('App answered ' + method + ' ' + path + ' with something that is not JSON.', res.status, 'BAD_JSON');
              }
              return data;
            });
          },
          function (err) {
            if (err && err.name === 'AbortError') {
              throw ApiError('App did not answer ' + method + ' ' + path + ' in time.', null, 'TIMEOUT');
            }
            throw ApiError('Cannot reach the app at ' + base + ' (' + (err && err.message ? err.message : 'network error') + ').', null, 'NETWORK');
          }
        )
        .finally(function () {
          if (timer) clearTimeout(timer);
        });
    }

    return {
      baseUrl: base,

      // GET /api/ext/ping -> { ok: true, workspace }
      ping: function () {
        return request('GET', '/api/ext/ping').then(function (d) {
          if (d.ok !== true) throw ApiError('Ping did not return ok: true.', null, 'BAD_SHAPE');
          return { ok: true, workspace: typeof d.workspace === 'string' ? d.workspace : '' };
        });
      },

      // POST /api/ext/hello -> { ok, workspace, account }. Heartbeat: tells the app this helper is installed,
      // its version, and which Instagram account Chrome is signed in to.
      hello: function (body) {
        var payload = { version: String(body.version || ''), outreachOn: body.outreachOn === true };
        if (typeof body.account === 'string') payload.account = body.account;
        if (body.faces && typeof body.faces === 'object') payload.faces = body.faces;
        if (typeof body.code === 'string') payload.code = body.code;
        return request('POST', '/api/ext/hello', { body: payload });
      },

      // POST /api/ext/ingest -> { conversationId, added, total }
      ingest: function (body) {
        return request('POST', '/api/ext/ingest', { body: body, timeoutMs: 60000 }).then(function (d) {
          if (typeof d.conversationId !== 'string') throw ApiError('Ingest did not return a conversationId.', null, 'BAD_SHAPE');
          return { conversationId: d.conversationId, added: Number(d.added) || 0, total: Number(d.total) || 0 };
        });
      },

      // GET /api/ext/conversation?platform=..&externalId=..&handle=..&name=..
      conversation: function (q) {
        return request('GET', '/api/ext/conversation', {
          query: { platform: q.platform, externalId: q.externalId, handle: q.handle, name: q.name, avatar: q.avatar }
        }).then(function (d) {
          if (typeof d.found !== 'boolean') throw ApiError('Conversation lookup did not return found.', null, 'BAD_SHAPE');
          return d;
        });
      },

      // POST /api/ext/live -> { added, matched, conversations }
      // The latest messages of recently active threads, read from the Instagram web inbox.
      live: function (body) {
        var threads = Array.isArray(body && body.threads) ? body.threads : [];
        return request('POST', '/api/ext/live', { body: { threads: threads }, timeoutMs: 30000 }).then(function (d) {
          if (typeof d.added !== 'number') throw ApiError('Live sync did not return added.', null, 'BAD_SHAPE');
          return d;
        });
      },

      // POST /api/ext/suggest -> { bubbles, reason, stage, labels }
      suggest: function (body) {
        return request('POST', '/api/ext/suggest', { body: { conversationId: body.conversationId }, timeoutMs: 90000 }).then(function (d) {
          if (!Array.isArray(d.bubbles)) throw ApiError('Suggest did not return bubbles.', null, 'BAD_SHAPE');
          return d;
        });
      },

      // GET /api/ext/label-queue -> { items: [...] }
      labelQueue: function () {
        return request('GET', '/api/ext/label-queue').then(function (d) {
          if (!Array.isArray(d.items)) throw ApiError('Label queue did not return items.', null, 'BAD_SHAPE');
          return { items: d.items };
        });
      },

      // POST /api/ext/label-queue/ack
      labelAck: function (body) {
        var payload = { id: body.id, ok: !!body.ok };
        if (!payload.ok) payload.error = String(body.error || 'unknown error').slice(0, 500);
        return request('POST', '/api/ext/label-queue/ack', { body: payload });
      },

      // GET /api/ext/outreach/status -> { enabled, mode, paused, pauseReason, sentToday, capToday, inWindow, nextAt, account, detect }
      outreachStatus: function () {
        return request('GET', '/api/ext/outreach/status').then(function (d) {
          if (typeof d.enabled !== 'boolean') throw ApiError('Outreach status did not return enabled.', null, 'BAD_SHAPE');
          return d;
        });
      },

      // GET /api/ext/faces -> { handles, remaining }. Chats whose profile picture Meta will not share.
      facesNeeded: function () {
        return request('GET', '/api/ext/faces').then(function (d) {
          if (!Array.isArray(d.handles)) throw ApiError('Faces did not return handles.', null, 'BAD_SHAPE');
          return d;
        });
      },

      // POST /api/ext/faces -> { saved }. The picture address read from one lead's profile page, or none.
      faceResult: function (body) {
        return request('POST', '/api/ext/faces', { body: { handle: String(body.handle || ''), url: String(body.url || '').slice(0, 2000) } });
      },

      // POST /api/ext/outreach/next -> { task: null, reason, retryInSec } or { task: {...} }
      outreachNext: function (body) {
        var account = body && typeof body.account === 'string' ? body.account : '';
        return request('POST', '/api/ext/outreach/next', { body: { account: account } }).then(function (d) {
          if (!('task' in d) || (d.task !== null && typeof d.task !== 'object')) throw ApiError('Outreach next did not return a task field.', null, 'BAD_SHAPE');
          return d;
        });
      },

      // POST /api/ext/outreach/result -> { ok, paused, pauseReason }
      outreachResult: function (body) {
        var payload = {
          id: body.id,
          status: String(body.status),
          detail: String(body.detail || '').slice(0, 1000),
          typedMs: Number(body.typedMs) || 0,
          keystrokes: Number(body.keystrokes) || 0,
          typos: Number(body.typos) || 0
        };
        return request('POST', '/api/ext/outreach/result', { body: payload, timeoutMs: 30000 });
      }
    };
  }

  return {
    ApiError: ApiError,
    normaliseBaseUrl: normaliseBaseUrl,
    originPatterns: originPatterns,
    createApiClient: createApiClient
  };
});
