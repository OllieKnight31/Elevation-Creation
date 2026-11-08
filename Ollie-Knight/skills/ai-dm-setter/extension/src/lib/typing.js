/*
 * typing.js
 * Pure human typing planner. No DOM, no chrome.* calls, no dependencies, so it
 * runs in the service worker, in a content script and under Node for tests.
 *
 * planTyping(text, profile, rng) returns an ordered list of steps:
 *   { op: "type", ch, wait }   insert ch (one character, or one whole emoji)
 *   { op: "back", wait }       delete one character backwards
 *   { op: "pause", wait }      do nothing (thinking)
 * `wait` is the time in milliseconds to wait BEFORE the step.
 * Extra fields on some steps, for statistics only:
 *   typo: "adjacent" | "transpose" | "double" | "drop" | "case" | "space"
 *   fix: true       first backspace of a typo correction
 *   rewrite: true   first backspace of a "rephrase" deletion
 *
 * Hard invariant: replay(planTyping(text, ...)) === text, for any string.
 *
 * How the invariant is kept:
 *   - The text is split into units (grapheme clusters). A unit is "safe" when
 *     it is one plain character outside every protected span. URLs, @handles,
 *     email addresses, emoji, line breaks and anything made of more than one
 *     UTF-16 code unit are NOT safe.
 *   - Mistakes are only made on safe units, and a backspace only ever removes
 *     a safe unit or a mistyped plain character. An open mistake is always
 *     corrected before the next unsafe unit is typed, so a backspace never
 *     crosses an emoji, a URL or a line break and never splits a surrogate pair.
 *   - Each unit position can be mistyped at most once, so the plan terminates.
 *   - The finished plan is replayed and compared before it is returned. If it
 *     ever differed, a plain plan without mistakes would be returned instead.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AIDMTyping = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DEFAULT_PROFILE = Object.freeze({ wpmMin: 38, wpmMax: 62, typoRate: 0.03, rewriteRate: 0.12, pauseRate: 0.05 });

  var ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

  // Letter pairs typed faster than average (frequent English digraphs).
  var COMMON = {};
  ('th he in er an re on at en nd ti es or te of ed is it al ar st to nt ng se ha as ou io le ve co me de hi ri ro ic ne ea ra ce li ch ll be ma si om ur ' +
    'yo wa we us ow ee oo ss ly ke')
    .split(' ')
    .forEach(function (p) {
      COMMON[p] = true;
    });

  var SAFE_RE = /^[\x20-\x7E¡-ɏͰ-ϿЀ-ӿ‘-‟]$/;
  var LETTER_RE = /^[A-Za-zÀ-ÖØ-öø-ɏͰ-ϿЀ-ӿ]$/;
  var SHIFT_SYMBOL_RE = /^[~!@#$%^&*()_+{}|:"<>?]$/;

  var URL_RE = new RegExp(
    '(?:https?:\\/\\/|www\\.)[^\\s]+' +
      '|[^\\s@]+@[^\\s@]+\\.[^\\s@]+' +
      '|\\b[a-z0-9][a-z0-9-]*(?:\\.[a-z0-9-]+)*\\.(?:com|net|org|io|co|me|app|ai|uk|de|fr|es|it|nl|au|ca|us|info|biz|tv|ly|gg|link|page|site|xyz|dev|shop|store|club|online)(?:\\/[^\\s]*)?',
    'gi'
  );
  var HANDLE_RE = /@[A-Za-z0-9._]+/g;

  /* ---------------------------- text helpers ---------------------------- */

  // The form in which a target text and a composer's content are compared:
  // \n line ends, plain spaces, no zero width space or BOM, no trailing blanks.
  // The zero width JOINER is kept, because emoji sequences need it.
  function canonical(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/\r\n?/g, '\n')
      .replace(/[   \t]/g, ' ')
      .replace(/[​﻿]/g, '')
      .replace(/ +\n/g, '\n')
      .replace(/^\s+|\s+$/g, '');
  }

  function isJoinerCodePoint(cp) {
    return (
      (cp >= 0x0300 && cp <= 0x036f) ||
      (cp >= 0x1ab0 && cp <= 0x1aff) ||
      (cp >= 0x20d0 && cp <= 0x20ff) ||
      (cp >= 0xfe00 && cp <= 0xfe0f) ||
      cp === 0x200d ||
      (cp >= 0x1f3fb && cp <= 0x1f3ff) ||
      (cp >= 0xe0020 && cp <= 0xe007f)
    );
  }

  // Used only where Intl.Segmenter is missing. Keeps surrogate pairs, zero
  // width joiner sequences, skin tones, variation selectors, combining marks
  // and flag pairs together.
  function fallbackGraphemes(text) {
    var out = [];
    var cps = Array.from(text);
    for (var i = 0; i < cps.length; i++) {
      var s = cps[i];
      var cp = s.codePointAt(0);
      var last = out.length ? out[out.length - 1] : null;
      var lastEndsWithJoiner = last !== null && last.charCodeAt(last.length - 1) === 0x200d;
      var flag = cp >= 0x1f1e6 && cp <= 0x1f1ff;
      var lastIsSingleFlag = false;
      if (last !== null && flag) {
        var lcps = Array.from(last);
        var l0 = lcps[0].codePointAt(0);
        lastIsSingleFlag = lcps.length === 1 && l0 >= 0x1f1e6 && l0 <= 0x1f1ff;
      }
      if (last !== null && (isJoinerCodePoint(cp) || lastEndsWithJoiner || lastIsSingleFlag || (s === '\n' && last === '\r'))) {
        out[out.length - 1] = last + s;
      } else {
        out.push(s);
      }
    }
    return out;
  }

  function splitGraphemes(text) {
    if (typeof Intl === 'object' && Intl && typeof Intl.Segmenter === 'function') {
      try {
        var seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
        return Array.from(seg.segment(text), function (x) {
          return x.segment;
        });
      } catch (e) {
        /* fall through */
      }
    }
    return fallbackGraphemes(text);
  }

  // Character ranges [start, end) that must be typed without any mistake.
  function protectedRanges(text) {
    var out = [];
    [URL_RE, HANDLE_RE].forEach(function (re) {
      re.lastIndex = 0;
      var m;
      while ((m = re.exec(text))) {
        if (!m[0].length) {
          re.lastIndex++;
          continue;
        }
        out.push([m.index, m.index + m[0].length]);
      }
    });
    return out;
  }

  // Units of the text with the flags the planner works from.
  function analyse(text) {
    var str = String(text === null || text === undefined ? '' : text);
    var ranges = protectedRanges(str);
    var offset = 0;
    return splitGraphemes(str).map(function (s) {
      var start = offset;
      offset += s.length;
      var prot = ranges.some(function (r) {
        return start < r[1] && offset > r[0];
      });
      var safe = !prot && s.length === 1 && SAFE_RE.test(s);
      return { s: s, safe: safe, letter: safe && LETTER_RE.test(s), protected: prot };
    });
  }

  function neighbours(ch) {
    var lower = ch.toLowerCase();
    for (var r = 0; r < ROWS.length; r++) {
      var i = ROWS[r].indexOf(lower);
      if (i < 0) continue;
      var out = [];
      if (i > 0) out.push(ROWS[r][i - 1]);
      if (i < ROWS[r].length - 1) out.push(ROWS[r][i + 1]);
      if (r > 0) {
        if (ROWS[r - 1][i]) out.push(ROWS[r - 1][i]);
        if (ROWS[r - 1][i + 1]) out.push(ROWS[r - 1][i + 1]);
      }
      if (r < ROWS.length - 1) {
        if (i > 0 && ROWS[r + 1][i - 1]) out.push(ROWS[r + 1][i - 1]);
        if (ROWS[r + 1][i]) out.push(ROWS[r + 1][i]);
      }
      return out;
    }
    return [];
  }

  /* ---------------------------- profile and rng ---------------------------- */

  function num(value, fallback, lo, hi) {
    var n = Number(value);
    if (!isFinite(n)) n = fallback;
    if (n < lo) n = lo;
    if (n > hi) n = hi;
    return n;
  }

  function normaliseProfile(profile) {
    var p = profile || {};
    var wpmMin = num(p.wpmMin, DEFAULT_PROFILE.wpmMin, 10, 200);
    var wpmMax = num(p.wpmMax, Math.max(wpmMin, DEFAULT_PROFILE.wpmMax), 10, 200);
    if (wpmMax < wpmMin) wpmMax = wpmMin;
    return {
      wpmMin: wpmMin,
      wpmMax: wpmMax,
      typoRate: num(p.typoRate, DEFAULT_PROFILE.typoRate, 0, 0.25),
      rewriteRate: num(p.rewriteRate, DEFAULT_PROFILE.rewriteRate, 0, 1),
      pauseRate: num(p.pauseRate, DEFAULT_PROFILE.pauseRate, 0, 0.5)
    };
  }

  function makeRand(rng) {
    var f = typeof rng === 'function' ? rng : Math.random;
    return function () {
      var r = Number(f());
      if (!(r >= 0)) r = 0.5;
      if (r >= 1) r = 0.999999;
      return r;
    };
  }

  /* ---------------------------- replay and summary ---------------------------- */

  // Applies the steps to an empty buffer and returns the resulting text.
  function replay(steps) {
    var buf = [];
    for (var i = 0; i < steps.length; i++) {
      var st = steps[i];
      if (st.op === 'type') buf.push(st.ch);
      else if (st.op === 'back') buf.pop();
    }
    return buf.join('');
  }

  function summary(steps) {
    var out = { totalMs: 0, keystrokes: 0, typos: 0, backspaces: 0, pauses: 0, rewrites: 0, steps: steps.length };
    for (var i = 0; i < steps.length; i++) {
      var st = steps[i];
      out.totalMs += st.wait || 0;
      if (st.op === 'type' || st.op === 'back') out.keystrokes++;
      if (st.op === 'back') out.backspaces++;
      if (st.op === 'pause') out.pauses++;
      if (st.typo) out.typos++;
      if (st.rewrite) out.rewrites++;
    }
    out.totalMs = Math.round(out.totalMs);
    return out;
  }

  /* ---------------------------- the planner ---------------------------- */

  function planTyping(text, profile, rng) {
    var target = String(text === null || text === undefined ? '' : text);
    var p = normaliseProfile(profile);
    var rand = makeRand(rng);
    var units = analyse(target);
    var n = units.length;
    var steps = [];
    var buf = [];

    function randInt(lo, hi) {
      return lo + Math.floor(rand() * (hi - lo + 1));
    }
    function gauss() {
      var u1 = Math.max(rand(), 1e-9);
      var u2 = rand();
      return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    }
    // Right skewed multiplier with mean 1: most keystrokes a little quicker
    // than average, a few much slower.
    function skew(sigma) {
      return Math.exp(sigma * gauss() - (sigma * sigma) / 2);
    }

    var wpm = p.wpmMin + rand() * (p.wpmMax - p.wpmMin);
    var base = 60000 / (wpm * 5);
    var wordMult = 1;
    var burstLeft = 0;
    var carry = 0; // extra wait added to the next typed character
    var tag = null; // typo kind to stamp on the next typed step
    var rolled = new Array(n); // unit positions that already had their one chance of a typo
    var pauseRolled = new Array(n);

    function pushType(ch, wait) {
      var st = { op: 'type', ch: ch, wait: Math.max(0, Math.round(wait + carry)) };
      carry = 0;
      if (tag) {
        st.typo = tag;
        tag = null;
      }
      steps.push(st);
      buf.push(ch);
    }
    function pushBack(wait, mark) {
      var st = { op: 'back', wait: Math.max(0, Math.round(wait)) };
      if (mark) st[mark] = true;
      steps.push(st);
      buf.pop();
    }
    function pushPause(wait) {
      steps.push({ op: 'pause', wait: Math.max(0, Math.round(wait)) });
    }

    function isWordChar(u) {
      return !!u && u.safe && u.s !== ' ';
    }
    function isWordStart(i) {
      return units[i].s !== ' ' && units[i].s !== '\n' && (i === 0 || units[i - 1].s === ' ' || /\n/.test(units[i - 1].s));
    }
    // What the text looked like just before position i: "sentence" after . ! ?
    // or a line break, "clause" after , ; : and "" otherwise.
    function boundaryBefore(i) {
      var j = i - 1;
      while (j >= 0 && units[j].s === ' ') j--;
      if (j < 0) return '';
      if (/\n/.test(units[j].s) || /^[.!?]$/.test(units[j].s)) return 'sentence';
      if (/^[,;:]$/.test(units[j].s)) return 'clause';
      return '';
    }

    function keyDelay(ch, i) {
      var prev = buf.length ? buf[buf.length - 1] : '';
      if (ch.length > 1 && !/^\r?\n$/.test(ch)) {
        // an emoji or another composed character: found, not typed
        return 450 + rand() * 1100;
      }
      var f = 1;
      var lower = ch.toLowerCase();
      var pl = prev.toLowerCase();
      if (!prev) f *= 1.4;
      else if (/\n/.test(prev)) f *= 1.8;
      else if (prev === ' ') {
        f *= 1.22;
        var b = boundaryBefore(i);
        if (b === 'sentence') f *= 1.5;
        else if (b === 'clause') f *= 1.2;
      } else if (COMMON[pl + lower]) f *= 0.74;
      else if (pl === lower) f *= 0.82;
      if (/\n/.test(ch)) f *= 2.2;
      else if (ch === ' ') f *= 0.9;
      else if (lower !== ch.toUpperCase() && ch === ch.toUpperCase()) f *= 1.35; // capital, needs shift
      else if (/[0-9]/.test(ch)) f *= 1.25;
      else if (SHIFT_SYMBOL_RE.test(ch)) f *= 1.5;
      else if (lower === ch.toUpperCase()) f *= 1.3; // other punctuation
      var noise = skew(0.32);
      if (rand() < 0.025) noise *= 2 + rand() * 2; // a short hesitation
      var ms = base * f * wordMult * noise;
      var lo = Math.min(28, base * 0.5);
      if (ms < lo) ms = lo;
      if (ms > base * 7) ms = base * 7;
      return ms;
    }

    // Word level rhythm: a speed for the word, the odd burst of quick words,
    // and now and then a thinking pause before it.
    function startWord(i) {
      if (burstLeft > 0) {
        burstLeft--;
        wordMult = 0.72 + rand() * 0.12;
      } else {
        wordMult = 0.88 + rand() * 0.3;
        if (rand() < 0.12) burstLeft = randInt(2, 5);
      }
      if (pauseRolled[i]) return;
      pauseRolled[i] = true;
      if (i === 0) return;
      var b = boundaryBefore(i);
      var chance = p.pauseRate * (b === 'sentence' ? 3 : b === 'clause' ? 1.5 : 1);
      if (rand() < Math.min(0.9, chance)) {
        var ms = 450 + 900 * skew(0.6);
        pushPause(Math.min(6000, ms));
      }
    }

    function typeUnit(i) {
      if (isWordStart(i)) startWord(i);
      pushType(units[i].s, keyDelay(units[i].s, i));
    }

    function backDelay() {
      var ms = base * 0.45 * (0.8 + rand() * 0.5);
      return Math.max(45, Math.min(130, ms));
    }

    function pickKind(i) {
      var u = units[i];
      var next = units[i + 1];
      if (u.s === ' ') return 'space';
      var opts = [];
      if (neighbours(u.s).length) opts.push(['adjacent', 0.36]);
      if (next && next.letter && next.s.toLowerCase() !== u.s.toLowerCase()) opts.push(['transpose', 0.18]);
      opts.push(['double', 0.14]);
      if (next && next.safe) opts.push(['drop', 0.14]);
      if (u.s.toLowerCase() !== u.s.toUpperCase()) opts.push(['case', isWordStart(i) ? 0.2 : 0.07]);
      var total = opts.reduce(function (a, o) {
        return a + o[1];
      }, 0);
      var r = rand() * total;
      for (var k = 0; k < opts.length; k++) {
        r -= opts[k][1];
        if (r < 0) return opts[k][0];
      }
      return opts[opts.length - 1][0];
    }

    function eligible(i) {
      var u = units[i];
      if (!u.safe) return false;
      if (u.letter) return true;
      // a missed space, only between two plain letters
      return u.s === ' ' && i > 0 && units[i - 1].letter && !!units[i + 1] && units[i + 1].letter;
    }

    // How many more characters are typed before the mistake is noticed:
    // 0 to 6, or the rest of the word.
    function noticeAfter(from) {
      if (rand() < 0.28) {
        var c = 0;
        while (from + c < n && isWordChar(units[from + c]) && c < 12) c++;
        return c;
      }
      return Math.floor(Math.pow(rand(), 1.6) * 7);
    }

    // One optional "rephrase": at the end of some word, delete the last few
    // words and type them again. Only over spans made entirely of safe units.
    var rewrite = null;
    if (n > 0 && rand() < p.rewriteRate) {
      var ends = [];
      for (var e = 1; e <= n; e++) {
        if (isWordChar(units[e - 1]) && (e === n || !isWordChar(units[e]))) ends.push(e);
      }
      if (ends.length) {
        var wantWords = randInt(2, 4);
        var first = randInt(Math.floor(ends.length * 0.3), ends.length - 1);
        for (var c = 0; c < ends.length && !rewrite; c++) {
          var at = ends[(first + c) % ends.length];
          var s = at;
          var words = 0;
          while (s > 0 && units[s - 1].safe && words < wantWords) {
            if (units[s - 1].s !== ' ' && (s - 1 === 0 || units[s - 2].s === ' ' || !units[s - 2].safe)) words++;
            s--;
          }
          if (words >= 1 && at - s >= 4) rewrite = { at: at, from: s };
        }
      }
    }

    var err = null; // the open mistake: { at: buffer length to return to, resume: unit index, left }
    var i = 0;
    var guard = 0;
    var limit = n * 40 + 1000;

    while (guard++ < limit) {
      if (err) {
        var atEnd = i >= n;
        if (atEnd || !units[i].safe || err.left <= 0) {
          var firstBack = true;
          while (buf.length > err.at) {
            pushBack(firstBack ? 180 + rand() * rand() * 900 : backDelay(), firstBack ? 'fix' : null);
            firstBack = false;
          }
          i = err.resume;
          err = null;
          tag = null;
          carry += 60 + rand() * 200;
          continue;
        }
        typeUnit(i);
        err.left--;
        i++;
        continue;
      }
      if (rewrite && i === rewrite.at) {
        pushPause(700 + rand() * 1800);
        var firstDel = true;
        while (buf.length > rewrite.from) {
          pushBack(firstDel ? 150 + rand() * 250 : Math.max(40, backDelay() * 0.8), firstDel ? 'rewrite' : null);
          firstDel = false;
        }
        pushPause(350 + rand() * 1200);
        i = rewrite.from;
        rewrite = null;
        continue;
      }
      if (i >= n) break;

      if (!rolled[i]) {
        rolled[i] = true;
        if (eligible(i) && rand() < p.typoRate) {
          var u = units[i];
          var kind = pickKind(i);
          var here = buf.length;
          if (isWordStart(i)) startWord(i);
          if (kind === 'adjacent') {
            var nb = neighbours(u.s);
            var wrong = nb[randInt(0, nb.length - 1)];
            if (u.s !== u.s.toLowerCase()) wrong = wrong.toUpperCase();
            tag = kind;
            pushType(wrong, keyDelay(u.s, i));
            i += 1;
          } else if (kind === 'case') {
            tag = kind;
            pushType(u.s === u.s.toLowerCase() ? u.s.toUpperCase() : u.s.toLowerCase(), keyDelay(u.s, i));
            i += 1;
          } else if (kind === 'double') {
            tag = kind;
            pushType(u.s, keyDelay(u.s, i));
            pushType(u.s, Math.max(30, base * (0.35 + rand() * 0.3)));
            i += 1;
          } else if (kind === 'transpose') {
            tag = kind;
            pushType(units[i + 1].s, keyDelay(units[i + 1].s, i));
            pushType(u.s, keyDelay(u.s, i) * 0.8);
            i += 2;
          } else {
            // "drop" and "space": the character is simply not typed
            tag = kind;
            i += 1;
          }
          var left = noticeAfter(i);
          if (kind === 'drop' || kind === 'space') left = Math.max(1, left);
          err = { at: here, resume: i - (kind === 'transpose' ? 2 : 1), left: left };
          continue;
        }
      }

      typeUnit(i);
      i++;
    }

    if (replay(steps) !== target) return plainPlan(units, base);
    return steps;
  }

  // Safety net: a plan with no mistakes at an even pace.
  function plainPlan(units, base) {
    return units.map(function (u) {
      return { op: 'type', ch: u.s, wait: Math.round(base) };
    });
  }

  return {
    DEFAULT_PROFILE: DEFAULT_PROFILE,
    canonical: canonical,
    splitGraphemes: splitGraphemes,
    fallbackGraphemes: fallbackGraphemes,
    protectedRanges: protectedRanges,
    analyse: analyse,
    neighbours: neighbours,
    normaliseProfile: normaliseProfile,
    planTyping: planTyping,
    replay: replay,
    summary: summary
  };
});
