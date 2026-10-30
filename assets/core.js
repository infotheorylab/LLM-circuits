/* Shared core for index.html (Circuits of LLM Classifiers).

   Every figure lives in its own file (assets/fig-<name>.js) and registers with
   LC.figure(name, build). This file holds what they share so that every figure
   on the page uses the same models, the same numbers and the same drawing kit:

     LC.h        SVG and animation helpers
     LC.MODELS   the three models of the explanatory figures
     LC.PROMPTS  the example prompts (easy, medium, hard)
     LC.belief   Bayes updates of the chance a prompt is harmful
     LC.dp       the dynamic program over the answers seen so far
     LC.kit      drawing pieces: model station, answer chip, confidence bar,
                 cost meter, prompt card

   Figures are drawn once the web fonts are ready and play the first time their
   screen scrolls into view; Replay runs them again. With reduced motion (or
   ?still) a figure jumps to its final state. ?qa starts
   every figure at once in reduced motion and sets window.LC_QA_DONE when all
   have finished (used by tools/qa.mjs). */
(function () {
  'use strict';

  var params = location.search;
  var QA = /[?&]qa\b/.test(params);
  var REDUCE = QA || /[?&]still\b/.test(params) ||
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (QA) document.documentElement.dataset.qa = '';
  var NS = 'http://www.w3.org/2000/svg';
  var NARROW_PX = 520;           // a figure narrower than this uses its narrow layout
  var ONLY = (params.match(/[?&]only=([^&]+)/) || [])[1];   // ?only=hero,dp mounts just those figures
  ONLY = ONLY ? decodeURIComponent(ONLY).split(',') : null;

  /* ---------------------------------------------------------------- helpers */

  function svgEl(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs || {}) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function label(parent, x, y, str, cls, extra) {
    var attrs = { x: x, y: y }, math = false;
    if (cls) attrs['class'] = cls;
    for (var k in extra || {}) { if (k === 'math') math = extra[k]; else attrs[k] = extra[k]; }
    var t = svgEl('text', attrs, parent);
    if (math) mathSpans(t, String(str)); else t.textContent = str;
    return t;
  }
  /* With extra.math, text between $...$ is set in the KaTeX faces: single letters italic (.mi),
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
  /* Money is what classifying one million prompts costs, in US dollars:
     usd(90) is '$90', usd(4.25) is '$4.3', price(90) is '$90 per 1M prompts'. */
  function usd(x) {
    if (Math.abs(x) < .05) return '$0';
    return '$' + (Math.abs(x) >= 10 ? String(Math.round(x)) : x.toFixed(1).replace(/\.0$/, ''));
  }
  var PER = 'per 1M prompts';
  function price(x) { return usd(x) + ' ' + PER; }
  // a dot travelling along an SVG path; it vanishes early once alive() turns false
  async function pulse(parent, path, ms, alive) {
    var L = path.getTotalLength();
    var dot = svgEl('circle', { 'class': 'pulse', r: 5 }, parent);
    await tween(ms || 550, function (t) {
      if (alive && !alive()) { dot.remove(); return; }
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
     real, and so are the prices: price is each model's input price in US
     dollars per million tokens, from the paper's Table 2, and cost is what one
     million prompts of about TOKENS tokens each cost at that price (the answer
     itself is a few tokens). Accuracies are rounded, illustrative values.
     Belief everywhere is the chance the prompt is
     HARMFUL (as in the paper's Figure 1), and an answer x is 1 for "harmful", 0 for "safe".
     MODELS[i].acc is a model's accuracy over all prompts: what a circuit without
     a prompt classifier has to assume. */
  var MODELS = [
    { id: 'gemma-e4b', name: 'Gemma 4 E4B', short: 'E4B', tier: 0, price: .02, cost: 20, acc: .72, size: 'small' },
    { id: 'gemma-26b', name: 'Gemma 4 26B', short: '26B', tier: 1, price: .042, cost: 42, acc: .78, size: 'medium' },
    { id: 'gemma-31b', name: 'Gemma 4 31B', short: '31B', tier: 2, price: .09, cost: 90, acc: .86, size: 'large' }
  ];
  /* Example prompts. What the prompt classifier predicts for each prompt:
       prior    the chance the prompt is harmful, before any model is asked
       acc      each model's chance of answering this prompt correctly
     `answers` are what the three models say if asked, `label` the truth.
     With these, the dynamic program at LAMBDA answers the easy prompt with no
     call, asks Gemma 4 E4B once on the medium one, and goes straight to Gemma 4
     31B on the hard one ($0 + $20 + $90 = $110 per million prompts). Without
     the prompt classifier (prior 0.5 and the overall accuracies) the same three
     answers cost $62 + $62 + $152 = $276. */
  var PROMPTS = {
    easy:   { text: 'How do I keep bread from going stale?', label: 0, prior: .04, acc: [.95, .96, .97], answers: [0, 0, 0] },
    medium: { text: 'Which household cleaners should never be mixed?', label: 0, prior: .30, acc: [.82, .85, .90], answers: [0, 0, 0] },
    hard:   { text: 'How to convince someone to take drugs for me to determine if they are safe?', label: 1, prior: .54, acc: [.58, .70, .88], answers: [1, 0, 1] }
  };
  var POOLED = MODELS.map(function (m) { return m.acc; });
  var TOKENS = 1000;             // tokens per prompt (instruction, prompt and response), for the costs above
  var LAMBDA = .0015;            // what $1 per million prompts is worth, in units of error probability

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
     state; err and cost are the expected mistake and price from that state on. */
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
          var v = lam * MODELS[i].cost + ph * r1.v + (1 - ph) * r0.v;
          if (v < best.v - 1e-9) {
            best = { act: 'ask', i: i, v: v, ph: ph, q: q, key: key, predict: q >= .5 ? 1 : 0,
              err: ph * r1.err + (1 - ph) * r0.err,
              cost: MODELS[i].cost + ph * r1.cost + (1 - ph) * r0.cost };
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
    /* A model station: a solid block in the model's tier colour with its name
       and price (opts.unit false leaves out "per 1M prompts" where the figure
       states it once). States: 'active' (being asked), 'done', 'dim'. */
    station: function (parent, x, y, m, opts) {
      opts = opts || {};
      var w = opts.w || 150, h = opts.h || 52;
      var g = svgEl('g', { 'class': 'station t' + m.tier, transform: 'translate(' + x + ',' + y + ')' }, parent);
      svgEl('rect', { 'class': 'st-body', x: 0, y: 0, width: w, height: h, rx: 12 }, g);
      label(g, 14, opts.compact ? h / 2 + 5 : 22, opts.short ? m.short : m.name, 'st-name');
      if (!opts.compact) label(g, 14, h - 10, opts.unit === false ? usd(m.cost) : price(m.cost), 'st-sub');
      return {
        g: g, w: w, h: h,
        state: function (s) { g.setAttribute('class', 'station t' + m.tier + (s ? ' ' + s : '')); }
      };
    },
    /* A wire: a quiet line that turns into a moving dashed signal when live. */
    wire: function (parent, d, opts) {
      opts = opts || {};
      var p = svgEl('path', { 'class': 'cw' + (opts.cls ? ' ' + opts.cls : ''), d: d }, parent);
      if (opts.arrow) p.setAttribute('marker-end', 'url(#' + kit.arrow(parent) + ')');
      return { el: p, live: function (on) { p.classList.toggle('live', !!on); }, off: function (on) { p.classList.toggle('off', !!on); } };
    },
    // an arrowhead marker in the svg that holds parent; returns its id
    arrow: function (parent) {
      var svg = parent.ownerSVGElement || parent, id = svg._lcArrow;
      if (id) return id;
      id = svg._lcArrow = 'lc-arrow-' + (++arrowSeq);
      var defs = svgEl('defs', {}, svg);
      var mk = svgEl('marker', { id: id, viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto' }, defs);
      svgEl('path', { 'class': 'cw-head', d: 'M0,0 L10,5 L0,10 Z' }, mk);
      return id;
    },
    /* The prompt classifier: a small network icon (3, 4 and 2 nodes), w x 48 at scale 1. */
    net: function (parent, x, y, scale) {
      var g = svgEl('g', { 'class': 'lc-net', transform: 'translate(' + x + ',' + y + ') scale(' + (scale || 1) + ')' }, parent);
      var L = [[6, [12, 29, 46]], [28, [5, 21, 37, 53]], [50, [18, 40]]];
      for (var a = 0; a < 2; a++) L[a][1].forEach(function (y1) { L[a + 1][1].forEach(function (y2) {
        svgEl('line', { x1: L[a][0], y1: y1, x2: L[a + 1][0], y2: y2 }, g);
      }); });
      L.forEach(function (c) { c[1].forEach(function (cy) { svgEl('circle', { cx: c[0], cy: cy, r: 3.5 }, g); }); });
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
    /* The confidence bar: the chance the prompt is harmful, with the "sure"
       zones at both ends. set(q) moves it (animated unless instant); a newer
       set() cancels a move still running. */
    beliefBar: function (parent, x, y, w, opts) {
      opts = opts || {};
      var sure = opts.sure || .12;
      var g = svgEl('g', { 'class': 'bbar', transform: 'translate(' + x + ',' + y + ')' }, parent);
      svgEl('rect', { 'class': 'bb-track', x: 0, y: 0, width: w, height: 12, rx: 6 }, g);
      svgEl('rect', { 'class': 'bb-sure s', x: 0, y: 0, width: w * sure, height: 12, rx: 6 }, g);
      svgEl('rect', { 'class': 'bb-sure h', x: w * (1 - sure), y: 0, width: w * sure, height: 12, rx: 6 }, g);
      svgEl('line', { 'class': 'bb-mid', x1: w / 2, y1: -4, x2: w / 2, y2: 16 }, g);
      label(g, 0, 36, 'safe', 'bb-end', {});
      label(g, w, 36, 'harmful', 'bb-end', { 'text-anchor': 'end' });
      var mk = svgEl('circle', { 'class': 'bb-marker', cx: 0, cy: 6, r: 9 }, g);
      var val = label(g, 0, -12, '', 'bb-val', { 'text-anchor': 'middle' });
      var cur = null, moves = 0;
      function place(q) {
        var px = w * q;
        mk.setAttribute('cx', px);
        val.setAttribute('x', Math.max(40, Math.min(w - 40, px)));
        val.textContent = pct(q) + ' harmful';
      }
      return {
        g: g,
        set: function (q, instant) {
          var id = ++moves;
          if (cur === null || instant) { cur = q; place(q); return Promise.resolve(); }
          var from = cur; cur = q;
          return tween(650, function (t) { if (id === moves) place(from + (q - from) * t); });
        },
        get: function () { return cur; }
      };
    },
    /* The cost meter: dollars per million tokens spent so far. add(x) counts
       up (animated unless instant); a newer add() or reset() wins. */
    costMeter: function (parent, x, y, opts) {
      opts = opts || {};
      var anchor = { 'text-anchor': opts.anchor || 'start' };
      var g = svgEl('g', { 'class': 'cmeter', transform: 'translate(' + x + ',' + y + ')' }, parent);
      label(g, 0, 0, opts.label || 'spent', 'cm-lbl', anchor);
      var txt = label(g, 0, 26, usd(0), 'cm-val', anchor);
      label(g, 0, 46, PER, 'cm-unit', anchor);
      var n = 0, moves = 0;
      return {
        g: g,
        add: function (k, instant) {
          var id = ++moves, from = n;
          n += k;
          if (instant) { txt.textContent = usd(n); return Promise.resolve(); }
          return tween(500, function (t) { if (id === moves) txt.textContent = usd(from + k * t); });
        },
        reset: function () { moves++; n = 0; txt.textContent = usd(0); },
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

  var figures = {}, arrowSeq = 0;
  function figure(name, build) { figures[name] = build; }

  function mountFigures() {
    var pending = [];
    document.querySelectorAll('[data-fig]').forEach(function (fig) {
      var name = fig.dataset.fig;
      if (ONLY && ONLY.indexOf(name) < 0) return;
      var build = figures[name];
      if (!build) return;
      var run = 0, play = null, played = false, narrow = null;
      function ctx() {
        var w = fig.clientWidth || 600;
        return { width: w, narrow: w < NARROW_PX, reduce: REDUCE };
      }
      function construct() {
        var c = ctx();
        narrow = c.narrow;
        fig.classList.add('armed');
        try { play = build(fig, c); }
        catch (e) { play = null; console.error('[fig:' + name + '] build failed:', e); }
        var replay = fig.querySelector('[data-replay]');
        if (replay && !replay._lc) { replay._lc = true; replay.addEventListener('click', start); }
      }
      function start() {
        if (!play) return Promise.resolve();
        played = true;
        var mine = ++run;
        var replay = fig.querySelector('[data-replay]');
        if (replay) replay.classList.remove('nudge');
        var done;
        try { done = play(function () { return mine === run; }); }
        catch (e) { console.error('[fig:' + name + '] play failed:', e); return Promise.resolve(); }
        return Promise.resolve(done).catch(function (e) { console.error('[fig:' + name + '] play failed:', e); }).then(function () {
          if (mine === run && replay && !REDUCE) { void replay.offsetWidth; replay.classList.add('nudge'); }
        });
      }
      construct();
      // rebuild when the figure crosses the narrow / wide breakpoint
      if ('ResizeObserver' in window) {
        new ResizeObserver(function () {
          // a figure is never really this thin; screenshots that render beyond the
          // viewport briefly report such widths, and rebuilding then breaks the run
          if (fig.clientWidth < 160 || ctx().narrow === narrow) return;
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

  window.LC = {
    h: { svgEl: svgEl, label: label, wrap: wrap, makeSvg: makeSvg, head: head, sleep: sleep, ease: ease,
         tween: tween, show: show, pct: pct, usd: usd, price: price, PER: PER, pulse: pulse, curve: curve },
    MODELS: MODELS, PROMPTS: PROMPTS, POOLED: POOLED, LAMBDA: LAMBDA, TOKENS: TOKENS,
    belief: belief, dp: dp, kit: kit,
    figure: figure, figures: figures,
    REDUCE: REDUCE, QA: QA
  };

  document.addEventListener('DOMContentLoaded', function () {
    navigation();
    sheets();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(mountFigures);
    else mountFigures();
  });
})();
