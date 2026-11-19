/*
 * followers.js (runs in the service worker)
 *
 * Collects the signed in account's own follower list when the app asks for it, so the owner can message
 * followers who have never been in their inbox. It opens the profile's Followers screen in a small window
 * of this Chrome and reads the names off the list while scrolling it, the way a person would. It calls no
 * Instagram endpoint of its own. Each screenful is handed to the app, which leaves out anyone already in the inbox.
 */
(function (root) {
  'use strict';

  var CHUNK_MS = 12000; // one visit to the page; short enough that the service worker is never left waiting long
  var MAX_CHUNKS = 90;

  // Row text that is a button or a badge, never the person's name. Only ever compared with, never pressed.
  var NOT_NAMES = ['remove', 'follow', 'following', 'follow back', 'requested', 'verified', '\u00b7', 'message'];

  // Runs inside the Instagram tab. S is selectors.js instagramAudience.
  function readList(S, budgetMs, own, notNames) {
    var st = window.__aidmFollowers || (window.__aidmFollowers = { seen: {}, still: 0, blank: 0 });
    var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    if (S.loginPath.some(function (p) { return location.pathname.indexOf(p) >= 0; })) return Promise.resolve({ error: 'Chrome is not signed in to Instagram, or Instagram is asking to confirm it is you.' });
    var dialog = null;
    S.dialog.forEach(function (sel) { if (!dialog) dialog = document.querySelector(sel); });
    if (!dialog) {
      st.blank++;
      // The pop up opens from the profile's own link to the list. It is pressed once, through the helper's one
      // guarded click (content/dom.js), which refuses anything that looks like a send control.
      var all = document.getElementsByTagName('a');
      var opener = null;
      var near = [];
      for (var k = 0; k < all.length; k++) {
        var path = String(all[k].pathname || '').toLowerCase().replace(/\/+$/, '');
        // On the owner's own profile the count is a link with no address, told apart by its label ("4,659 followers").
        var label = String(all[k].innerText || '').replace(/\s+/g, ' ').trim();
        if (path === '/' + own + '/followers' || (/^[\d.,]+[km]?\s+followers$/i.test(label) && all[k].getAttribute('href') === '#')) opener = all[k];
        else if (path.indexOf(own) >= 0 && near.length < 6) near.push(all[k].getAttribute('href'));
      }
      if (st.blank > 5 || (st.blank > 2 && !opener)) return Promise.resolve({ error: 'The Followers list did not open (page ' + location.pathname + ', ' + all.length + ' links, link to the list ' + (opener ? 'found' : 'not found, own links: ' + near.join(' ')) + ', title ' + document.title.slice(0, 60) + ').' });
      if (opener && st.blank % 2 === 1) {
        try { globalThis.AIDM.dom.safeClick('instagram', opener, 'the link to the list'); } catch (e) { return Promise.resolve({ error: 'Could not open the Followers list: ' + (e && e.message ? e.message : String(e)) }); }
      }
      return wait(3500).then(function () { return { users: [], end: false, note: 'waiting for the list to open' }; });
    }
    st.blank = 0;
    var handleOf = function (a) {
      var m = (a.getAttribute('href') || '').match(/^\/([A-Za-z0-9._]{1,30})\/$/);
      var h = m ? m[1].toLowerCase() : '';
      return h && h !== own && S.notProfiles.indexOf(h) < 0 ? h : '';
    };
    var collect = function () {
      var out = [];
      var links = dialog.getElementsByTagName('a');
      for (var i = 0; i < links.length; i++) {
        var h = handleOf(links[i]);
        if (!h || st.seen[h]) continue;
        st.seen[h] = 1;
        // The row: the nearest block around the link that also holds the row's button.
        var row = links[i];
        for (var up = 0; up < 14 && row.parentElement && row.parentElement !== dialog; up++) {
          // Never past the point where the block holds a second person.
          var inside = row.parentElement.getElementsByTagName('a');
          var other = false;
          for (var z = 0; z < inside.length && !other; z++) { var oh = handleOf(inside[z]); other = !!oh && oh !== h; }
          if (other) break;
          row = row.parentElement;
        }
        var name = '';
        (row.innerText || '').split('\n').some(function (line) {
          var t = line.trim();
          if (!t || t.toLowerCase() === h || notNames.indexOf(t.toLowerCase()) >= 0) return false;
          name = t;
          return true;
        });
        out.push({ username: h, name: name.slice(0, 80) });
      }
      return out;
    };
    var scroll = function () {
      var best = null, most = -1;
      st.metrics = '';
      var divs = dialog.getElementsByTagName('div');
      for (var i = 0; i < divs.length; i++) {
        var d = divs[i];
        if (d.scrollHeight <= d.clientHeight + 20) continue;
        var oy = getComputedStyle(d).overflowY;
        if (oy !== 'auto' && oy !== 'scroll') continue;
        var n = d.getElementsByTagName('a').length;
        if (n > most) { most = n; best = d; }
        // Every scrolling block that holds people is moved to its end: which one Instagram watches is not marked.
        if (n > 0) {
          // Up a little and back down on alternate looks, the way a person nudges a list that has stopped loading.
          st.turn = (st.turn || 0) + 1;
          if (st.turn % 2 === 0) d.scrollTop = Math.max(0, d.scrollHeight - d.clientHeight - 320);
          else d.scrollTop = d.scrollHeight;
          // A covered window gets no scroll notices of its own, so the list is told it moved.
          d.dispatchEvent(new Event('scroll', { bubbles: true }));
          st.metrics += ' [' + n + ' links ' + Math.round(d.scrollTop) + '/' + d.scrollHeight + '/' + d.clientHeight + ']';
        }
      }
      var links = dialog.getElementsByTagName('a');
      if (links.length && st.turn % 2 === 1) links[links.length - 1].scrollIntoView({ block: 'end' });
      var spin = 0;
      S.loading.forEach(function (sel) { spin += dialog.querySelectorAll(sel).length; });
      st.metrics += ' spinners ' + spin + ', window ' + window.innerWidth + 'x' + window.innerHeight + ', focus ' + document.hasFocus();
      return !!best;
    };
    var end = Date.now() + budgetMs;
    var users = [];
    var found = false;
    var loop = function () {
      users = users.concat(collect());
      found = scroll() || found;
      if (Date.now() >= end) return null;
      return wait(1400 + Math.floor(Math.random() * 1400)).then(loop);
    };
    return Promise.resolve(loop()).then(function () {
      // A covered window loads nothing, which says nothing about whether the list has ended.
      if (document.visibilityState === 'visible') st.still = users.length ? 0 : st.still + 1;
      var links = dialog.getElementsByTagName('a');
      var sample = [];
      for (var q = 0; q < links.length && sample.length < 4; q++) sample.push(links[q].getAttribute('href'));
      return { users: users, end: st.still >= 6, hidden: document.visibilityState !== 'visible', note: document.visibilityState + ', ' + (found ? 'scrolling' : 'no scrolling list found') + ', ' + links.length + ' links, e.g. ' + sample.join(' ') + ', ' + Object.keys(st.seen).length + ' people seen, blocks:' + (st.metrics || ' none') + ', end of list: ' + (dialog.innerText || '').replace(/\s+/g, ' ').slice(-90) };
    });
  }

  function createFollowers(deps) {
    var chrome = deps.chrome;
    var api = deps.api; // function (name, body) -> Promise
    var isBusy = deps.isBusy || function () { return false; };
    var selectors = function () { return root.AIDM_SELECTORS && root.AIDM_SELECTORS.instagramAudience; };
    var running = false;
    var win = null;
    var tabId = null;

    function wait(ms) {
      return new Promise(function (r) { setTimeout(r, ms); });
    }

    function waitLoaded(id, tries) {
      return chrome.tabs.get(id).then(function (t) {
        if (t.status === 'complete') return t;
        if (tries <= 0) throw new Error('Instagram did not finish loading.');
        return wait(1000).then(function () { return waitLoaded(id, tries - 1); });
      });
    }

    // Its own window, in front: Instagram loads more of the list only while it is on screen. It closes itself at the end.
    function open(account) {
      return chrome.windows.create({ url: 'https://www.instagram.com/' + encodeURIComponent(account) + '/', focused: true, type: 'normal', width: 980, height: 820 }).then(function (w) {
        win = w.id;
        tabId = w.tabs && w.tabs[0] ? w.tabs[0].id : null;
        if (tabId === null) throw new Error('Could not open the Followers screen.');
        return waitLoaded(tabId, 40).then(function () { return wait(4000); });
      });
    }

    function close() {
      if (win === null) return Promise.resolve();
      var id = win;
      win = null;
      tabId = null;
      return chrome.windows.remove(id).catch(function () {});
    }

    var covered = 0;
    function chunk(left, account) {
      if (left <= 0) return Promise.resolve('paused');
      // Never while a message is being typed: the account is in use.
      if (isBusy()) return wait(20000).then(function () { return chunk(left - 1, account); });
      // dom.js brings the guarded click the reader uses to open the list; loading it twice does nothing.
      return chrome.scripting
        .executeScript({ target: { tabId: tabId }, files: ['src/selectors.js', 'src/lib/core.js', 'src/content/dom.js'] })
        .then(function () {
          return chrome.scripting.executeScript({ target: { tabId: tabId }, func: readList, args: [selectors(), CHUNK_MS, account, NOT_NAMES] });
        })
        .then(function (res) {
          var out = (res && res[0] && res[0].result) || { error: 'The Instagram tab did not answer.' };
          // Instagram loads more of the list only while its window is on screen. Covered, the read waits; after a
          // few looks the window is brought forward once more, and if it stays covered the read stops and says why.
          covered = out.hidden ? covered + 1 : 0;
          if (covered === 3 && win !== null) chrome.windows.update(win, { focused: true, state: 'normal' }).catch(function () {});
          if (covered >= 10) out = { error: 'The Followers window was covered by another window, and Instagram only loads the list while it is on screen. Press Import again and leave that window in front until it closes itself.' };
          return api('followersBatch', out.error ? { error: out.error } : { users: out.users, end: out.end === true, note: out.note || '' }).then(function (r) {
            if (out.error || !r || r.done) return 'done';
            return chunk(left - 1, account);
          });
        });
    }

    function run() {
      if (running) return Promise.resolve('running');
      if (!selectors()) return Promise.resolve('no selectors');
      running = true;
      covered = 0;
      return api('followersJob', {})
        .then(function (job) {
          if (!job || !job.want) return 'nothing to do';
          if (!/^[a-z0-9._]{1,30}$/.test(job.account || '')) return api('followersBatch', { error: 'The app does not know which Instagram account this is yet. Open Instagram in this Chrome first.' }).then(function () { return 'no account'; });
          return open(job.account).then(function () { return chunk(MAX_CHUNKS, job.account); });
        })
        .catch(function (e) {
          return api('followersBatch', { error: e && e.message ? e.message : String(e) }).catch(function () {}).then(function () { return 'failed'; });
        })
        .then(function (out) {
          running = false;
          return close().then(function () { return out; });
        });
    }

    return { run: run };
  }

  root.AIDMFollowers = { createFollowers: createFollowers };
})(typeof globalThis !== 'undefined' ? globalThis : this);
