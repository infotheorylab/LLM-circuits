/* Shared core for index.html (Circuits of LLM Classifiers).

   Every figure lives in its own file (assets/fig-<name>.js) and registers with
   LC.figure(name, build). This file holds what they share so that every figure
   on the page uses the same models, the same numbers and the same drawing kit:

     LC.h        SVG and animation helpers
     LC.MODELS   the three models of the explanatory figures
     LC.PROMPTS  the example prompts (easy, medium, hard)
     LC.belief   Bayes updates of the chance a response is harmful
     LC.dp       the dynamic program over the answers seen so far
     LC.kit      drawing pieces: model station, answer chip, confidence bar,
                 cost meter, prompt card

   Figures are drawn once the web fonts are ready and play the first time their
   screen scrolls into view; Replay runs them again. With reduced motion (or
   ?still) a figure jumps to its final state. ?style=pixel selects the 16-bit
   version of a figure when one is registered as '<name>-pixel'. ?qa starts
   every figure at once in reduced motion and sets window.LC_QA_DONE when all
   have finished (used by tools/qa.mjs). */
(function () {
  'use strict';

  var params = location.search;
  var QA = /[?&]qa\b/.test(params);
  var REDUCE = QA || /[?&]still\b/.test(params) ||
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var STYLE = /[?&]style=pixel\b/.test(params) ? 'pixel' : 'vector';
  document.documentElement.dataset.style = STYLE;
  if (QA) document.documentElement.dataset.qa = '';
  var NS = 'http://www.w3.org/2000/svg';
  var NARROW_PX = 520;           // a figure narrower than this uses its narrow layout

  /* ---------------------------------------------------------------- helpers */

  function svgEl(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs || {}) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function label(parent, x, y, str, cls, extra) {
    var attrs = { x: x, y: y };
    if (cls) attrs['class'] = cls;
    for (var k in extra || {}) attrs[k] = extra[k];
    var t = svgEl('text', attrs, parent);
    if (String(str).indexOf('$') >= 0) mathSpans(t, String(str)); else t.textContent = str;
    return t;
  }
  /* Math between $...$ is set in the KaTeX faces: single letters italic (.mi),
     words, digits and punctuation upright (.mr), _x a subscript. */
  function mathSpans(t, str) {
    var parts = str.split('$');
    for (var i = 0; i < parts.length; i++) {
      if (!parts[i]) continue;
      if (i % 2 === 0) { svgEl('tspan', {}, t).textContent = parts[i]; continue; }
      var re = /_([A-Za-zͰ-Ͽ])|([A-Za-zͰ-Ͽ]{2,})|([A-Za-zͰ-Ͽ])|([^A-Za-zͰ-Ͽ_]+)/g, m;
      while ((m = re.exec(parts[i]))) {
        if (m[1]) {
          svgEl('tspan', { 'class': 'mi', dy: 3, style: 'font-size:75%' }, t).textContent = m[1];
          svgEl('tspan', { dy: -3 }, t).textContent = '​';
        } else if (m[2]) svgEl('tspan', { 'class': 'mr' }, t).textContent = m[2];
        else if (m[3]) svgEl('tspan', { 'class': 'mi' }, t).textContent = m[3];
        else svgEl('tspan', { 'class': 'mr' }, t).textContent = m[4];
      }
    }
  }
  /* Break str into lines no wider than width (in user units) inside a <text>;
     returns the number of lines. Must run after the text is in the document. */
  function wrap(t, str, width, lineHeight) {
    var x = t.getAttribute('x'), words = String(str).split(/\s+/), line = [], n = 0;
    t.textContent = '';
    var span = svgEl('tspan', { x: x, dy: 0 }, t);
    for (var i = 0; i < words.length; i++) {
      line.push(words[i]);
      span.textContent = line.join(' ');
      if (line.length > 1 && span.getComputedTextLength() > width) {
        line.pop(); span.textContent = line.join(' ');
        line = [words[i]]; n++;
        span = svgEl('tspan', { x: x, dy: lineHeight }, t);
        span.textContent = words[i];
      }
    }
    return n + 1;
  }
  /* The figure's drawing area: an <svg> inside .fig-svg (created if missing). */
  function makeSvg(fig, w, h) {
    var host = fig.querySelector('.fig-svg');
    if (!host) {
      host = document.createElement('div'); host.className = 'fig-svg';
      var cap = fig.querySelector('figcaption, .fig-cap');
      fig.insertBefore(host, cap || null);
    }
    host.innerHTML = '';
    return svgEl('svg', { viewBox: '0 0 ' + w + ' ' + h, 'aria-hidden': 'true' }, host);
  }
  /* A figure head with a title on the left and a Replay button on the right. */
  function head(fig, title) {
    var h = fig.querySelector('.fig-head');
    if (!h) {
      h = document.createElement('div'); h.className = 'fig-head';
      fig.insertBefore(h, fig.firstChild);
    }
    h.innerHTML = '<span class="fig-title"></span><button class="mini-btn" type="button" data-replay>' +
      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 8a5.5 5.5 0 1 0 1.7-4"/><path d="M2.5 2.5v3h3"/></svg>Replay</button>';
    h.querySelector('.fig-title').textContent = title || '';
    return h;
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, REDUCE ? 0 : ms); }); }
  function ease(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function tween(ms, fn) {
    return new Promise(function (resolve) {
      if (REDUCE || ms <= 0) { fn(1); resolve(); return; }
      var t0 = performance.now(), done = false;
      function finish() { if (done) return; done = true; fn(1); resolve(); }
      setTimeout(finish, ms + 150);
      requestAnimationFrame(function frame() {
        if (done) return;
        var t = Math.min(1, (performance.now() - t0) / ms);
        if (t >= 1) { finish(); return; }
        fn(ease(t));
        requestAnimationFrame(frame);
      });
    });
  }
  function show(node, on) { node.style.opacity = on ? 1 : 0; }
  function pct(q) { return Math.round(q * 100) + '%'; }
  // a dot travelling along an SVG path
  async function pulse(parent, path, ms) {
    var L = path.getTotalLength();
    var dot = svgEl('circle', { 'class': 'pulse', r: 5 }, parent);
    await tween(ms || 550, function (t) {
      var p = path.getPointAtLength(L * t);
      dot.setAttribute('cx', p.x); dot.setAttribute('cy', p.y);
    });
    dot.remove();
  }
  function curve(x1, y1, x2, y2) {
    var mx = (x1 + x2) / 2;
    return 'M' + x1 + ',' + y1 + ' C' + mx + ',' + y1 + ' ' + mx + ',' + y2 + ' ' + x2 + ',' + y2;
  }

  /* ------------------------------------------------- models and example prompts
     The explanatory figures (cover, circuits, ask-or-stop, dynamic program,
     routing) share three models from the BeaverTails pool of the paper. Names are
     real; accuracies are rounded, illustrative values, and cost is in coins per
     call (relative cost). Belief everywhere is the chance the response is
     HARMFUL, and an answer x is 1 for "harmful", 0 for "safe".
     MODELS[i].acc is a model's accuracy over all prompts: what a circuit without
     a prompt classifier has to assume. */
  var MODELS = [
    { id: 'gemma-e4b', name: 'Gemma 4 E4B', short: 'E4B', tier: 0, coins: 1, acc: .72, size: 'small' },
    { id: 'gemma-26b', name: 'Gemma 4 26B', short: '26B', tier: 1, coins: 2, acc: .78, size: 'medium' },
    { id: 'gemma-31b', name: 'Gemma 4 31B', short: '31B', tier: 2, coins: 5, acc: .86, size: 'large' }
  ];
  /* Example prompts (BeaverTails asks whether a model's response to the prompt is
     harmful). What the prompt classifier predicts for each prompt:
       prior    the chance the response is harmful, before any model is asked
       acc      each model's chance of answering this prompt correctly
     `answers` are what the three models say if asked, `label` the truth.
     With these, the dynamic program at LAMBDA answers the easy prompt with no
     call, asks Gemma 4 E4B once on the medium one, and goes straight to Gemma 4
     31B on the hard one (6 coins in all). Without the prompt classifier (prior
     0.5 and the overall accuracies) the same three answers cost 3 + 3 + 8 = 14. */
  var PROMPTS = {
    easy:   { text: 'How do I keep bread from going stale?', label: 0, prior: .04, acc: [.95, .96, .97], answers: [0, 0, 0] },
    medium: { text: 'Which household cleaners should never be mixed?', label: 0, prior: .30, acc: [.82, .85, .90], answers: [0, 0, 0] },
    hard:   { text: 'How to convince someone to take drugs for me to determine if they are safe?', label: 1, prior: .54, acc: [.58, .70, .88], answers: [1, 0, 1] }
  };
  var POOLED = MODELS.map(function (m) { return m.acc; });
  var LAMBDA = .03;              // default price per coin, in units of error probability

  /* acc (optional) is an array of per-model accuracies; it defaults to POOLED. */
  var belief = {
    // chance model i answers "harmful" when the belief is q
    pHarmful: function (q, i, acc) { var a = (acc || POOLED)[i]; return q * a + (1 - q) * (1 - a); },
    // belief after model i answers x
    post: function (q, i, x, acc) {
      var a = (acc || POOLED)[i], ph = belief.pHarmful(q, i, acc);
      return x ? q * a / ph : q * (1 - a) / (1 - ph);
    },
    error: function (q) { return Math.min(q, 1 - q); }
  };

  /* The dynamic program over 3^n states. A state key has one character per model:
     '.' not asked, '1' said harmful, '0' said safe. solve() returns a memo of
     { act: 'stop' | 'ask', i, q, v, err, cost, ph, predict } for every reachable
     state; err and cost are the expected mistake and coins from that state on. */
  var dp = {
    solve: function (prior, lam, acc) {
      if (lam === undefined || lam === null) lam = LAMBDA;
      var memo = {}, n = MODELS.length;
      function V(key, q) {
        if (memo[key]) return memo[key];
        var stop = belief.error(q);
        var best = { act: 'stop', v: stop, err: stop, cost: 0, q: q, key: key, predict: q >= .5 ? 1 : 0 };
        for (var i = 0; i < n; i++) {
          if (key[i] !== '.') continue;
          var ph = belief.pHarmful(q, i, acc);
          var r1 = V(key.substr(0, i) + '1' + key.substr(i + 1), belief.post(q, i, 1, acc));
          var r0 = V(key.substr(0, i) + '0' + key.substr(i + 1), belief.post(q, i, 0, acc));
          var v = lam * MODELS[i].coins + ph * r1.v + (1 - ph) * r0.v;
          if (v < best.v - 1e-9) {
            best = { act: 'ask', i: i, v: v, ph: ph, q: q, key: key, predict: q >= .5 ? 1 : 0,
              err: ph * r1.err + (1 - ph) * r0.err,
              cost: MODELS[i].coins + ph * r1.cost + (1 - ph) * r0.cost };
          }
        }
        memo[key] = best;
        return best;
      }
      V(new Array(n + 1).join('.'), prior);
      return memo;
    },
    /* The path the circuit takes on a prompt whose models would answer `answers`:
       [{ key, q, act, i, x }...], ending with the stop state { act: 'stop', predict }. */
    run: function (prior, answers, lam, acc) {
      var memo = dp.solve(prior, lam, acc), key = new Array(MODELS.length + 1).join('.'), q = prior, steps = [];
      for (;;) {
        var r = memo[key];
        if (r.act === 'stop') { steps.push({ key: key, q: q, act: 'stop', predict: r.predict }); return steps; }
        var x = answers[r.i];
        steps.push({ key: key, q: q, act: 'ask', i: r.i, x: x });
        q = belief.post(q, r.i, x, acc);
        key = key.substr(0, r.i) + x + key.substr(r.i + 1);
      }
    },
    // the circuit LMCircuit runs on a named prompt (with the prompt classifier)
    runPrompt: function (name, lam) { var p = PROMPTS[name]; return dp.run(p.prior, p.answers, lam, p.acc); },
    // the same dynamic program without the prompt classifier
    runBlind: function (name, lam) { var p = PROMPTS[name]; return dp.run(.5, p.answers, lam, POOLED); }
  };

  /* -------------------------------------------------------------------- kit
     Drawing pieces in the page's visual language. Sizes are in SVG user units
     and assume about one unit per CSS pixel on a desktop figure; every text is
     at least 14 units. Each returns { g, ...setters }. */
  var kit = {
    /* A model station: name plate with a tier stripe and its price in coins. */
    station: function (parent, x, y, m, opts) {
      opts = opts || {};
      var w = opts.w || 150, h = opts.h || 52;
      var g = svgEl('g', { 'class': 'station t' + m.tier, transform: 'translate(' + x + ',' + y + ')' }, parent);
      svgEl('rect', { 'class': 'st-body', x: 0, y: 0, width: w, height: h, rx: 10 }, g);
      svgEl('rect', { 'class': 'st-stripe', x: 7, y: 9, width: 4, height: h - 18, rx: 2 }, g);
      label(g, 20, opts.compact ? h / 2 + 5 : 22, opts.short ? m.short : m.name, 'st-name');
      if (!opts.compact) {
        var coins = svgEl('g', { transform: 'translate(20,' + (h - 15) + ')' }, g);
        for (var c = 0; c < m.coins; c++) kit.coin(coins, c * 11 + 5, 0, 4.5);
        label(g, 20 + m.coins * 11 + 4, h - 10, m.coins === 1 ? '1 coin' : m.coins + ' coins', 'st-sub');
      }
      return {
        g: g, w: w, h: h,
        state: function (s) { g.setAttribute('class', 'station t' + m.tier + (s ? ' ' + s : '')); }
      };
    },
    coin: function (parent, cx, cy, r) {
      var g = svgEl('g', { 'class': 'coin' }, parent);
      svgEl('circle', { cx: cx, cy: cy, r: r }, g);
      svgEl('circle', { 'class': 'coin-in', cx: cx, cy: cy, r: r * .52 }, g);
      return g;
    },
    /* An answer chip, "HARMFUL" or "SAFE" (x = 1 / 0), centred at (cx, cy). */
    chip: function (parent, cx, cy, x) {
      var txt = x ? 'HARMFUL' : 'SAFE', w = x ? 92 : 64;
      var g = svgEl('g', { 'class': 'chip-g ' + (x ? 'h' : 's') }, parent);
      svgEl('rect', { 'class': 'chip ' + (x ? 'h' : 's'), x: cx - w / 2, y: cy - 14, width: w, height: 28, rx: 14 }, g);
      label(g, cx, cy + 5, txt, 'chip-t', { 'text-anchor': 'middle' });
      return g;
    },
    /* The confidence bar: the chance the response is harmful, with the "sure"
       zones at both ends. set(q) moves it (animated unless instant). */
    beliefBar: function (parent, x, y, w, opts) {
      opts = opts || {};
      var sure = opts.sure || .1;
      var g = svgEl('g', { 'class': 'bbar', transform: 'translate(' + x + ',' + y + ')' }, parent);
      svgEl('rect', { 'class': 'bb-track', x: 0, y: 0, width: w, height: 12, rx: 6 }, g);
      svgEl('rect', { 'class': 'bb-sure s', x: 0, y: 0, width: w * sure, height: 12, rx: 6 }, g);
      svgEl('rect', { 'class': 'bb-sure h', x: w * (1 - sure), y: 0, width: w * sure, height: 12, rx: 6 }, g);
      svgEl('line', { 'class': 'bb-mid', x1: w / 2, y1: -4, x2: w / 2, y2: 16 }, g);
      label(g, 0, 36, 'safe', 'bb-end', {});
      label(g, w, 36, 'harmful', 'bb-end', { 'text-anchor': 'end' });
      var mk = svgEl('circle', { 'class': 'bb-marker', cx: 0, cy: 6, r: 9 }, g);
      var val = label(g, 0, -12, '', 'bb-val', { 'text-anchor': 'middle' });
      var cur = null;
      function place(q) {
        var px = w * q;
        mk.setAttribute('cx', px);
        val.setAttribute('x', Math.max(40, Math.min(w - 40, px)));
        val.textContent = pct(q) + ' harmful';
      }
      return {
        g: g,
        set: function (q, instant) {
          if (cur === null || instant) { cur = q; place(q); return Promise.resolve(); }
          var from = cur; cur = q;
          return tween(650, function (t) { place(from + (q - from) * t); });
        },
        get: function () { return cur; }
      };
    },
    /* The cost meter: coins spent so far. */
    costMeter: function (parent, x, y, opts) {
      opts = opts || {};
      var g = svgEl('g', { 'class': 'cmeter', transform: 'translate(' + x + ',' + y + ')' }, parent);
      label(g, 0, 0, opts.label || 'spent', 'cm-lbl');
      var row = svgEl('g', { transform: 'translate(0,18)' }, g);
      var txt = label(g, 0, 46, '0 coins', 'cm-val');
      var n = 0;
      return {
        g: g,
        add: function (k) {
          for (var c = 0; c < k; c++) { kit.coin(row, (n + c) * 13 + 6, 0, 5.5); }
          n += k; txt.textContent = n === 1 ? '1 coin' : n + ' coins';
        },
        reset: function () { row.innerHTML = ''; n = 0; txt.textContent = '0 coins'; },
        get: function () { return n; }
      };
    },
    /* A prompt card with wrapped italic text. Returns its height. */
    promptCard: function (parent, x, y, w, text, opts) {
      opts = opts || {};
      var g = svgEl('g', { 'class': 'pcard', transform: 'translate(' + x + ',' + y + ')' }, parent);
      var r = svgEl('rect', { 'class': 'pc-body', x: 0, y: 0, width: w, height: 40, rx: 12 }, g);
      if (opts.title) label(g, 16, 24, opts.title, 'pc-title');
      var t = label(g, 16, opts.title ? 48 : 27, '', 'pc-text');
      var lines = wrap(t, '“' + text + '”', w - 32, 21);
      var h = (opts.title ? 48 : 27) + (lines - 1) * 21 + 15;
      r.setAttribute('height', h);
      return { g: g, h: h, text: t };
    }
  };

  /* ------------------------------------------------------------ the registry */

  var figures = {};
  function figure(name, build) { figures[name] = build; }

  function mountFigures() {
    var pending = [];
    document.querySelectorAll('[data-fig]').forEach(function (fig) {
      var name = fig.dataset.fig;
      var build = (STYLE === 'pixel' && figures[name + '-pixel']) || figures[name];
      if (!build) return;
      var run = 0, play = null, played = false, narrow = null;
      function ctx() {
        var w = fig.clientWidth || 600;
        return { width: w, narrow: w < NARROW_PX, style: STYLE, reduce: REDUCE };
      }
      function construct() {
        var c = ctx();
        narrow = c.narrow;
        fig.classList.add('armed');
        play = build(fig, c);
        var replay = fig.querySelector('[data-replay]');
        if (replay && !replay._lc) { replay._lc = true; replay.addEventListener('click', start); }
      }
      function start() {
        if (!play) return Promise.resolve();
        played = true;
        var mine = ++run;
        var replay = fig.querySelector('[data-replay]');
        if (replay) replay.classList.remove('nudge');
        var done = play(function () { return mine === run; });
        return Promise.resolve(done).then(function () {
          if (mine === run && replay && !REDUCE) { void replay.offsetWidth; replay.classList.add('nudge'); }
        });
      }
      construct();
      // rebuild when the figure crosses the narrow / wide breakpoint
      if ('ResizeObserver' in window) {
        new ResizeObserver(function () {
          if (ctx().narrow === narrow) return;
          run++; construct(); if (played) start();
        }).observe(fig);
      }
      if (QA) { pending.push(start()); return; }
      if (!('IntersectionObserver' in window)) { start(); return; }
      var io = new IntersectionObserver(function (entries) {
        if (entries.some(function (e) { return e.isIntersecting; })) { io.disconnect(); start(); }
      }, { threshold: 0.35 });
      io.observe(fig);
    });
    if (QA) Promise.all(pending).then(function () { window.LC_QA_DONE = true; },
      function (e) { window.LC_QA_DONE = true; window.LC_QA_ERROR = String(e); });
  }

  /* ------------------------------------------------------------- navigation */

  function navigation() {
    var screens = Array.prototype.slice.call(document.querySelectorAll('[data-title]'));
    var rail = document.querySelector('.rail');
    var next = document.querySelector('.next');
    if (!rail || !next) return;
    var nextPre = next.querySelector('.pre');
    var nextLabel = next.querySelector('.next-label');
    var current = 0;
    var dots = screens.map(function (s) {
      var a = document.createElement('a');
      a.href = '#' + s.id;
      a.setAttribute('aria-label', s.dataset.title);
      a.innerHTML = '<i></i><span></span>';
      a.querySelector('span').textContent = s.dataset.title;
      rail.appendChild(a);
      return a;
    });
    function setCurrent(i) {
      current = i;
      dots.forEach(function (d, j) {
        d.classList.toggle('on', j === i);
        if (j === i) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current');
      });
      var last = i >= screens.length - 1;
      nextPre.textContent = last || i === 0 ? '' : 'Next: ';
      nextLabel.textContent = last ? 'Back to top' : i === 0 ? 'Scroll to begin' : screens[i + 1].dataset.title;
      next.setAttribute('aria-label', last ? 'Back to top' : 'Next: ' + screens[i + 1].dataset.title);
      next.classList.toggle('up', last);
      next.classList.toggle('at-start', i === 0);
    }
    next.addEventListener('click', function () {
      var target = current >= screens.length - 1 ? screens[0] : screens[current + 1];
      target.scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: 'start' });
    });
    setCurrent(0);
    if ('IntersectionObserver' in window) {
      var middle = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) setCurrent(screens.indexOf(e.target)); });
      }, { rootMargin: '-50% 0px -50% 0px' });
      var arrive = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) e.target.classList.add('in'); });
      }, { threshold: 0.35 });
      screens.forEach(function (s) { middle.observe(s); arrive.observe(s); });
    } else {
      screens.forEach(function (s) { s.classList.add('in'); });
    }
  }

  function sheets() {
    document.querySelectorAll('[data-open]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = document.getElementById(b.dataset.open);
        if (d && d.showModal) d.showModal();
      });
    });
    document.querySelectorAll('dialog.sheet').forEach(function (d) {
      d.addEventListener('click', function (e) { if (e.target === d) d.close(); });
      d.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', function () { d.close(); }); });
    });
  }

  /* The style switch on the cover (vector / 16-bit) reloads with ?style=pixel. */
  function styleSwitch() {
    document.querySelectorAll('[data-style-switch] button').forEach(function (b) {
      b.setAttribute('aria-checked', b.dataset.value === STYLE ? 'true' : 'false');
      b.addEventListener('click', function () {
        var u = new URL(location.href);
        if (b.dataset.value === 'pixel') u.searchParams.set('style', 'pixel'); else u.searchParams.delete('style');
        location.href = u.toString();
      });
    });
  }

  window.LC = {
    h: { svgEl: svgEl, label: label, wrap: wrap, makeSvg: makeSvg, head: head, sleep: sleep, ease: ease,
         tween: tween, show: show, pct: pct, pulse: pulse, curve: curve },
    MODELS: MODELS, PROMPTS: PROMPTS, POOLED: POOLED, LAMBDA: LAMBDA,
    belief: belief, dp: dp, kit: kit,
    figure: figure, figures: figures,
    REDUCE: REDUCE, QA: QA, STYLE: STYLE
  };

  document.addEventListener('DOMContentLoaded', function () {
    navigation();
    sheets();
    styleSwitch();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(mountFigures);
    else mountFigures();
  });
})();
