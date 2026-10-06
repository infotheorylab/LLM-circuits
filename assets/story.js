/* Story screens for index.html (Circuits of LLM Classifiers).

   Navigation: the progress rail and the "next" button follow whichever screen
   holds the middle of the window.

   Figures: each [data-fig] is drawn once the web fonts are ready and plays the
   first time its screen scrolls into view; the Replay button runs it again.
   With reduced motion a figure jumps straight to its final state. Colours come
   from CSS classes: green / blue / red = cheap / mid / expensive instrument,
   amber = the belief about the label and the path the circuit really takes. */
(function () {
  'use strict';

  var REDUCE = /[?&]still\b/.test(location.search) ||
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var NS = 'http://www.w3.org/2000/svg';

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
    t.textContent = str;
    return t;
  }
  function makeSvg(fig, w, h) {
    var host = fig.querySelector('.fig-svg');
    host.innerHTML = '';
    return svgEl('svg', { viewBox: '0 0 ' + w + ' ' + h, 'aria-hidden': 'true' }, host);
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
  function addClass(n, c) { n.classList.add(c); }
  function rmClass(n, c) { n.classList.remove(c); }

  // a pulse travelling along an SVG path
  async function pulse(parent, path, ms) {
    var L = path.getTotalLength();
    var dot = svgEl('circle', { 'class': 'pulse', r: 5 }, parent);
    await tween(ms || 550, function (t) {
      var p = path.getPointAtLength(L * t);
      dot.setAttribute('cx', p.x); dot.setAttribute('cy', p.y);
    });
    dot.remove();
  }
  function fadeGroup(parent) { return svgEl('g', { 'class': 'fade' }, parent); }

  /* ----------------------------------------------- the illustrative instruments
     Shared by the query-or-stop figure, the policy tree and the glue figure so
     that every number on the page agrees. Belief = P(response is safe). */
  var INST = [
    { name: 'LLM1', short: 'LLM1', acc: .72, cost: .06, cls: 'c0' },
    { name: 'LLM2', short: 'LLM2', acc: .78, cost: .10, cls: 'c1' },
    { name: 'LLM3', short: 'LLM3', acc: .86, cost: .45, cls: 'c2' }
  ];
  var Q0 = .46;                               // prior belief from the embedding
  function pSafe(q, i) { var a = INST[i].acc; return q * a + (1 - q) * (1 - a); }
  function post(q, i, x) {                    // Bayes update after instrument i says x (1 = safe)
    var a = INST[i].acc, ps = pSafe(q, i);
    return x ? q * a / ps : q * (1 - a) / (1 - ps);
  }
  // the dynamic program over 3^n states; returns a memo keyed by state string
  function solveDP(lam) {
    var memo = {};
    function V(key, q) {
      if (memo[key]) return memo[key];
      var stop = Math.min(q, 1 - q);
      var best = { act: 'stop', v: stop, err: stop, cost: 0, q: q, key: key };
      for (var i = 0; i < INST.length; i++) {
        if (key[i] !== '.') continue;
        var ps = pSafe(q, i);
        var k1 = key.substr(0, i) + '1' + key.substr(i + 1);
        var k0 = key.substr(0, i) + '0' + key.substr(i + 1);
        var r1 = V(k1, post(q, i, 1)), r0 = V(k0, post(q, i, 0));
        var v = lam * INST[i].cost + ps * r1.v + (1 - ps) * r0.v;
        if (v < best.v - 1e-9) {
          best = { act: 'ask', i: i, v: v, ps: ps, q: q, key: key,
            err: ps * r1.err + (1 - ps) * r0.err,
            cost: INST[i].cost + ps * r1.cost + (1 - ps) * r0.cost };
        }
      }
      memo[key] = best;
      return best;
    }
    V('...', Q0);
    return memo;
  }

  /* ------------------------------------------------------------- navigation */

  var screens = Array.prototype.slice.call(document.querySelectorAll('[data-title]'));
  var rail = document.querySelector('.rail');
  var next = document.querySelector('.next');
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

  /* ------------------------------------------------------------------ sheets */

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

  /* ------------------------------------------------------- cover circuit loop
     The adaptive circuit on the cover plays three routes in turn: LLM1 then
     LLM2, LLM1 then LLM3, and LLM1 alone when its answer already settles it. */
  (function () {
    var out = document.getElementById('cover-out');
    if (!out || REDUCE) return;
    var el = function (id) { return document.getElementById(id); };
    var W = ['cw0', 'cw1', 'cw2', 'cw3', 'cw4', 'cw5', 'cw6'].map(el);
    var N = ['cn0', 'cn1', 'cn2'].map(el);
    var ROUTES = [
      { steps: [W[0], N[0], W[1], N[1], W[4]], out: 'safe' },
      { steps: [W[0], N[0], W[2], N[2], W[5]], out: 'harmful' },
      { steps: [W[0], N[0], W[3]], out: 'safe' }
    ];
    var k = 0;
    async function loop() {
      for (;;) {
        var r = ROUTES[k % ROUTES.length]; k++;
        W.forEach(function (w) { w.classList.remove('live'); }); N.forEach(function (n) { n.classList.remove('lit'); });
        out.textContent = 'ŷ = ?';
        await sleep(600);
        for (var j = 0; j < r.steps.length; j++) {
          r.steps[j].classList.add(r.steps[j].tagName === 'circle' ? 'lit' : 'live');
          await sleep(450);
        }
        W[6].classList.add('live'); await sleep(450);
        out.textContent = 'ŷ = ' + r.out;
        await sleep(2200);
      }
    }
    loop();
  })();

  /* ----------------------------------------------------------------- figures */

  var figures = {};

  /* Noisy instruments: one prompt, six calls to a cheap model and six to an
     expensive one. Chips pop in one at a time, then a tally. */
  figures.noisy = function (fig) {
    var s = makeSvg(fig, 480, 300);
    svgEl('rect', { 'class': 'bubble', x: 16, y: 14, width: 448, height: 58, rx: 12 }, s);
    label(s, 30, 36, '“How to convince someone to take drugs for me to', 't-ink t-quote');
    label(s, 30, 55, 'determine if they are safe?”  + the model’s response', 't-ink t-quote');

    var ROWS = [
      { name: 'LLM1', sub: 'small model', cost: 'cost 1× per call', cls: 'c0', ans: [1, 1, 0, 1, 0, 1] },
      { name: 'LLM2', sub: 'large model', cost: 'cost 6× per call', cls: 'c2', ans: [1, 1, 1, 1, 0, 1] }
    ];
    var rows = ROWS.map(function (r, k) {
      var y = 118 + k * 86;
      svgEl('circle', { 'class': 'inst ' + r.cls, cx: 54, cy: y, r: 17 }, s);
      label(s, 54, y + 3.5, r.name, 't-ink t-b', { 'text-anchor': 'middle', style: 'font-size:9.5px' });
      label(s, 54, y + 34, r.sub, 't-xs t-' + r.cls, { 'text-anchor': 'middle' });
      label(s, 54, y + 46, r.cost, 't-xs t-muted', { 'text-anchor': 'middle' });
      var chips = r.ans.map(function (a, j) {
        var g = svgEl('g', { style: 'opacity:0' }, s);
        var x = 108 + j * 56;
        svgEl('rect', { 'class': 'chip ' + (a ? 'h' : 's'), x: x, y: y - 13, width: 50, height: 26, rx: 7 }, g);
        label(g, x + 25, y + 4, a ? 'harmful' : 'safe', 't-s ' + (a ? 't-alert' : 't-ok'), { 'text-anchor': 'middle' });
        return g;
      });
      var tally = label(s, 108, y + 36, '', 't-s t-ink', { style: 'opacity:0' });
      return { chips: chips, tally: tally, ans: r.ans };
    });
    var truth = label(s, 464, 290, 'Ground truth: harmful', 't-s t-alert', { 'text-anchor': 'end', style: 'opacity:0' });
    var note = label(s, 16, 290, 'cheaper = noisier, dearer = steadier', 't-s t-muted', { style: 'opacity:0' });

    return async function (alive) {
      rows.forEach(function (r) { r.chips.forEach(function (c) { show(c, 0); }); show(r.tally, 0); });
      show(truth, 0); show(note, 0);
      await sleep(300); if (!alive()) return;
      for (var k = 0; k < rows.length; k++) {
        var r = rows[k], h = 0;
        for (var j = 0; j < r.chips.length; j++) {
          await sleep(j ? 260 : 200); if (!alive()) return;
          show(r.chips[j], 1);
          h += r.ans[j];
        }
        await sleep(300); if (!alive()) return;
        r.tally.textContent = h + ' of ' + r.ans.length + ' calls say harmful';
        show(r.tally, 1);
        await sleep(500); if (!alive()) return;
      }
      show(truth, 1);
      await sleep(600); if (!alive()) return;
      show(note, 1);
    };
  };

  /* Circuits: four wirings of the same three instruments. A segmented control
     picks the wiring; on first arrival the figure walks through all four. */
  figures.circuits = function (fig) {
    var s = makeSvg(fig, 552, 250);
    var seg = fig.querySelector('.seg');
    var cap = fig.querySelector('[data-role="cap"]');
    var TYPES = ['Majority voting', 'Routing', 'Cascade', 'LMCircuit'];
    var CAPS = [
      'Majority voting asks every instrument at once and takes the most common answer. Three calls, every time.',
      'Routing predicts which single instrument suits the prompt and asks only that one. One call, but no second opinion.',
      'A cascade asks in a fixed order and stops at the first confident answer. Here the cheap model is unsure, so the mid model decides.',
      'LMCircuit lets the next query depend on all the answers so far, choosing the model that best fills the remaining uncertainty, and stops when the belief is sure. A learned prior over how well each model in the pool does on this prompt drives both choices.'
    ];
    var cur = 0, token = 0;
    var gW = svgEl('g', {}, s), gN = svgEl('g', {}, s), gP = svgEl('g', {}, s), gT = svgEl('g', {}, s);

    TYPES.forEach(function (t, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.setAttribute('role', 'radio'); b.textContent = t;
      b.setAttribute('aria-checked', i === 0 ? 'true' : 'false');
      b.addEventListener('click', function () { select(i); run(i, false); });
      seg.appendChild(b);
    });
    function select(i) {
      cur = i;
      Array.prototype.forEach.call(seg.children, function (b, j) { b.setAttribute('aria-checked', j === i ? 'true' : 'false'); });
    }

    function instNode(x, y, i) {
      var g = svgEl('g', {}, gN);
      var c = svgEl('circle', { 'class': 'inst ' + INST[i].cls, cx: x, cy: y, r: 16 }, g);
      label(g, x, y + 3.5, INST[i].short, 't-ink t-b', { 'text-anchor': 'middle', style: 'font-size:9.5px' });
      return c;
    }
    function box(x, y, w, h, txt, cls) {
      var r = svgEl('rect', { 'class': 'pbox', x: x, y: y, width: w, height: h, rx: 8 }, gN);
      label(gN, x + w / 2, y + h / 2 + 4, txt, cls || 't-s t-ink', { 'text-anchor': 'middle' });
      return r;
    }
    function wire(d, alt) { return svgEl('path', { 'class': 'wire' + (alt ? ' alt' : ''), d: d }, gW); }
    function say(x, y, a) {        // an answer chip above a node
      var g = svgEl('g', { style: 'opacity:0' }, gT);
      svgEl('rect', { 'class': 'chip ' + (a === null ? 'n' : a ? 'h' : 's'), x: x - 26, y: y - 38, width: 52, height: 20, rx: 6 }, g);
      label(g, x, y - 24, a === null ? 'unsure' : a ? 'harmful' : 'safe', 't-xs ' + (a === null ? 't-muted' : a ? 't-alert' : 't-ok'), { 'text-anchor': 'middle' });
      return g;
    }
    function curve(x1, y1, x2, y2) { var mx = (x1 + x2) / 2; return 'M' + x1 + ',' + y1 + ' C' + mx + ',' + y1 + ' ' + mx + ',' + y2 + ' ' + x2 + ',' + y2; }

    // build the static drawing for one type; returns its play script
    function build(t) {
      gW.innerHTML = ''; gN.innerHTML = ''; gP.innerHTML = ''; gT.innerHTML = '';
      var ZX = 34, ZY = 125, PX = 392, PY = 125;
      var z = svgEl('circle', { 'class': 'ag', cx: ZX, cy: ZY, r: 14 }, gN);
      label(gN, ZX, ZY + 4, 'z', 't-mono t-ink t-b', { 'text-anchor': 'middle' });
      label(gN, ZX, ZY + 32, 'prompt', 't-xs t-muted', { 'text-anchor': 'middle' });
      var pb = box(PX, PY - 17, 70, 34, 'predict');
      var outWire = wire('M' + (PX + 70) + ',' + PY + ' L' + (PX + 86) + ',' + PY);
      var out = label(gT, PX + 90, PY - 2, '', 't-mono t-ink t-b', { style: 'opacity:0' });
      var outLbl = label(gT, PX + 90, PY + 14, '', 't-s', { style: 'opacity:0' });
      var tally = label(gT, 16, 236, '', 't-s t-ink', { style: 'opacity:0' });
      var calls = 0;
      function result(a, n) {
        addClass(outWire, 'on');
        out.textContent = 'ŷ = ' + (a ? '1' : '0'); show(out, 1);
        outLbl.textContent = a ? 'harmful' : 'safe'; outLbl.setAttribute('class', 't-s ' + (a ? 't-alert' : 't-ok')); show(outLbl, 1);
        tally.textContent = n + (n === 1 ? ' call' : ' calls') + ' · cost ' + calls.toFixed(2); show(tally, 1);
      }

      if (t === 0) {                                   // majority voting
        var ys = [60, 125, 190], nodes = [], win = [], wout = [];
        ys.forEach(function (y, i) {
          win.push(wire(curve(ZX + 14, ZY, 196, y)));
          nodes.push(instNode(212, y, i));
          wout.push(wire(curve(228, y, PX, PY)));
        });
        label(gN, 212, 232, 'all three, in parallel', 't-xs t-muted', { 'text-anchor': 'middle' });
        return async function (alive) {
          await sleep(300); if (!alive()) return;
          await Promise.all(win.map(function (w) { return pulse(gP, w); })); if (!alive()) return;
          nodes.forEach(function (n) { addClass(n, 'lit'); });
          calls = INST[0].cost + INST[1].cost + INST[2].cost;
          var ans = [1, 0, 1], chips = ans.map(function (a, i) { return say(212, ys[i], a); });
          await sleep(350); if (!alive()) return;
          chips.forEach(function (c) { show(c, 1); });
          await sleep(500); if (!alive()) return;
          await Promise.all(wout.map(function (w) { return pulse(gP, w); })); if (!alive()) return;
          addClass(pb, 'lit'); result(1, 3);
        };
      }
      if (t === 1) {                                   // routing
        var rb = box(96, ZY - 17, 58, 34, 'router');
        var w0 = wire('M' + (ZX + 14) + ',' + ZY + ' L96,' + ZY);
        var ys2 = [78, 172], nodes2 = [], w1 = [], w2 = [];
        ys2.forEach(function (y, i) {
          w1.push(wire(curve(154, ZY, 236, y), i !== 0));
          nodes2.push(instNode(252, y, i === 0 ? 1 : 2));
          w2.push(wire(curve(268, y, PX, PY), i !== 0));
        });
        label(gN, 125, ZY + 36, 'picks one model', 't-xs t-muted', { 'text-anchor': 'middle' });
        return async function (alive) {
          await sleep(300); if (!alive()) return;
          await pulse(gP, w0); if (!alive()) return;
          addClass(rb, 'lit'); addClass(nodes2[1], 'dimmed'); addClass(w1[1], 'dimmed'); addClass(w2[1], 'dimmed');
          await sleep(350); if (!alive()) return;
          await pulse(gP, w1[0]); if (!alive()) return;
          addClass(nodes2[0], 'lit'); calls = INST[1].cost;
          var c = say(252, ys2[0], 1); await sleep(300); if (!alive()) return; show(c, 1);
          await sleep(500); if (!alive()) return;
          await pulse(gP, w2[0]); if (!alive()) return;
          addClass(pb, 'lit'); result(1, 1);
        };
      }
      if (t === 2) {                                   // cascade
        var xs = [130, 230, 330], nodes3 = [], fwd = [], up = [];
        fwd.push(wire('M' + (ZX + 14) + ',' + ZY + ' L' + (xs[0] - 16) + ',' + ZY));
        xs.forEach(function (x, i) {
          nodes3.push(instNode(x, ZY, i));
          if (i < 2) fwd.push(wire('M' + (x + 16) + ',' + ZY + ' L' + (xs[i + 1] - 16) + ',' + ZY));
          up.push(wire('M' + x + ',' + (ZY - 16) + ' C' + x + ',' + (ZY - 70) + ' ' + PX + ',' + (PY - 70) + ' ' + (PX + 10) + ',' + (PY - 17), true));
        });
        label(gN, 180, ZY + 16, 'unsure →', 't-xs t-muted', { 'text-anchor': 'middle' });
        label(gN, 280, ZY + 16, 'unsure →', 't-xs t-muted', { 'text-anchor': 'middle' });
        label(gN, 262, 232, 'fixed order, cheapest first, stop when confident', 't-xs t-muted', { 'text-anchor': 'middle' });
        return async function (alive) {
          await sleep(300); if (!alive()) return;
          await pulse(gP, fwd[0]); if (!alive()) return;
          addClass(nodes3[0], 'lit'); calls += INST[0].cost;
          var c0 = say(xs[0], ZY + 60, null); c0.setAttribute('transform', 'translate(0,0)');
          // put the chip below the node for cascades (the sure-wires run above)
          c0.firstChild.setAttribute('y', ZY + 24); c0.lastChild.setAttribute('y', ZY + 38);
          await sleep(300); if (!alive()) return; show(c0, 1);
          await sleep(600); if (!alive()) return;
          await pulse(gP, fwd[1]); if (!alive()) return;
          addClass(nodes3[1], 'lit'); calls += INST[1].cost;
          var c1 = say(xs[1], ZY + 60, 1); c1.firstChild.setAttribute('y', ZY + 24); c1.lastChild.setAttribute('y', ZY + 38);
          await sleep(300); if (!alive()) return; show(c1, 1);
          await sleep(500); if (!alive()) return;
          addClass(up[1], 'on'); rmClass(up[1], 'alt');
          await pulse(gP, up[1], 700); if (!alive()) return;
          addClass(nodes3[2], 'dimmed'); addClass(fwd[2], 'dimmed'); addClass(up[2], 'dimmed');
          addClass(pb, 'lit'); result(1, 2);
        };
      }
      // general circuit (LMCircuit)
      var bb = box(84, ZY - 17, 70, 34, 'belief 46%', 't-xs t-belief');
      var wz = wire('M' + (ZX + 14) + ',' + ZY + ' L84,' + ZY);
      var w1g = wire('M154,' + ZY + ' L196,' + ZY);
      var n0 = instNode(212, ZY, 0);
      var wUp = wire(curve(228, ZY, 296, 70), true), wDn = wire(curve(228, ZY, 296, 180));
      var n1 = instNode(312, 70, 1), n2 = instNode(312, 180, 2);
      var wo1 = wire(curve(328, 70, PX, PY), true), wo2 = wire(curve(328, 180, PX, PY));
      var wStop = wire(curve(228, ZY, PX, PY), true);
      label(gN, 262, 86, 'says safe → ask LLM2', 't-xs t-muted', { 'text-anchor': 'middle' });
      label(gN, 262, 176, 'says harmful → ask LLM3', 't-xs t-muted', { 'text-anchor': 'middle' });
      label(gN, 300, 118, 'sure → stop', 't-xs t-muted', { 'text-anchor': 'middle' });
      label(gN, 262, 236, 'next query and stopping depend on the prompt and the answers so far', 't-xs t-muted', { 'text-anchor': 'middle' });
      return async function (alive) {
        await sleep(300); if (!alive()) return;
        await pulse(gP, wz); if (!alive()) return;
        addClass(bb, 'lit');
        await sleep(300); if (!alive()) return;
        await pulse(gP, w1g); if (!alive()) return;
        addClass(n0, 'lit'); calls += INST[0].cost;
        var c0 = say(212, ZY, 1); await sleep(300); if (!alive()) return; show(c0, 1);
        await sleep(400); if (!alive()) return;
        [wUp, n1, wo1, wStop].forEach(function (n) { addClass(n, 'dimmed'); });
        addClass(wDn, 'on');
        await pulse(gP, wDn, 650); if (!alive()) return;
        addClass(n2, 'lit'); calls += INST[2].cost;
        var c2 = say(312, 180, 1); await sleep(300); if (!alive()) return; show(c2, 1);
        await sleep(500); if (!alive()) return;
        addClass(wo2, 'on');
        await pulse(gP, wo2, 650); if (!alive()) return;
        addClass(pb, 'lit'); result(1, 2);
      };
    }

    var active = null;   // the alive() guard for the current run
    function run(t, walk) {
      var mine = ++token;
      var alive = function () { return mine === token; };
      var play = build(t);
      if (cap) cap.textContent = CAPS[t];
      (async function () {
        await play(alive);
        if (!alive()) return;
        if (walk && t < TYPES.length - 1) {
          await sleep(1900); if (!alive()) return;
          select(t + 1); run(t + 1, true);
        } else {
          finished();
        }
      })();
    }
    var finished = function () {};
    return function (alive, onDone) {
      finished = onDone || function () {};
      select(0);
      run(0, true);
      return Promise.resolve();
    };
  };

  /* Query or stop: one Bellman comparison at the empty state. */
  figures.bellman = function (fig) {
    var s = makeSvg(fig, 480, 310);
    var BX = 40, BW = 400, BY = 58;
    var i = 0, c = INST[i].cost;
    var ps = pSafe(Q0, i), q1 = post(Q0, i, 1), q0 = post(Q0, i, 0);
    var e1 = Math.min(q1, 1 - q1), e0 = Math.min(q0, 1 - q0);
    var eStop = Math.min(Q0, 1 - Q0);
    var eAsk = ps * e1 + (1 - ps) * e0;
    var lamStar = (eStop - eAsk) / c;
    function X(q) { return BX + BW * q; }

    // the belief bar
    label(s, BX, 26, 'belief that the response is safe', 't-ink t-b');
    label(s, BX + BW, 26, 'now: ' + pct(Q0), 't-mono t-belief', { 'text-anchor': 'end' });
    svgEl('rect', { 'class': 'belief-bg', x: BX, y: BY - 5, width: BW, height: 10, rx: 5 }, s);
    svgEl('line', { 'class': 'mid', x1: X(.5), y1: BY - 13, x2: X(.5), y2: BY + 13 }, s);
    label(s, BX, BY + 26, '0%  (surely unsafe)', 't-xs t-muted');
    label(s, X(.5), BY + 26, '50%', 't-xs t-muted', { 'text-anchor': 'middle' });
    label(s, BX + BW, BY + 26, '(surely safe)  100%', 't-xs t-muted', { 'text-anchor': 'end' });
    var m = svgEl('circle', { 'class': 'marker', cx: X(Q0), cy: BY, r: 8 }, s);
    var g1 = svgEl('circle', { 'class': 'marker ghost', cx: X(Q0), cy: BY, r: 6, style: 'opacity:0' }, s);
    var g0 = svgEl('circle', { 'class': 'marker ghost', cx: X(Q0), cy: BY, r: 6, style: 'opacity:0' }, s);
    var l1 = label(s, X(q1), BY - 14, 'after \u201Csafe\u201D', 't-xs t-belief halo', { 'text-anchor': 'middle', style: 'opacity:0' });
    var l0 = label(s, X(q0), BY - 14, 'after \u201Cunsafe\u201D', 't-xs t-belief halo', { 'text-anchor': 'middle', style: 'opacity:0' });

    // option A: stop
    var A = fadeGroup(s);
    var AX = 24, AW = 150, CY = 112, CH = 156;
    svgEl('rect', { 'class': 'card', x: AX, y: CY, width: AW, height: CH, rx: 10 }, A);
    label(A, AX + 16, CY + 24, 'STOP', 't-mono t-ink t-b');
    label(A, AX + 16, CY + 46, 'predict the likelier label:', 't-xs t-muted');
    label(A, AX + 16, CY + 60, 'unsafe', 't-s t-alert');
    label(A, AX + 16, CY + 90, 'error', 't-xs t-muted');
    label(A, AX + 16, CY + 112, pct(eStop), 't-big t-ink t-b');
    label(A, AX + 16, CY + 138, 'cost 0', 't-xs t-muted');

    // option B: ask LLM1, laid out as a small table over the two answers
    var B = fadeGroup(s);
    var BXc = 190, BWc = 270;
    svgEl('rect', { 'class': 'card', x: BXc, y: CY, width: BWc, height: CH, rx: 10 }, B);
    label(B, BXc + 16, CY + 24, 'ASK', 't-mono t-ink t-b');
    label(B, BXc + 52, CY + 24, INST[i].name, 't-mono t-' + INST[i].cls);
    label(B, BXc + 100, CY + 24, 'pay ' + c.toFixed(2) + ' \u03BB now', 't-s t-ink');
    var COL = [BXc + 16, BXc + 86, BXc + 150, BXc + 222];
    var hdr = svgEl('g', { style: 'opacity:0' }, B);
    ['answer', 'how likely', 'belief after', 'error after'].forEach(function (h, k) { label(hdr, COL[k], CY + 52, h, 't-xs t-muted'); });
    svgEl('line', { 'class': 'axis', x1: BXc + 14, y1: CY + 58, x2: BXc + BWc - 14, y2: CY + 58 }, hdr);
    function row(y, ans, cls, p, q, e) {
      var g = svgEl('g', { style: 'opacity:0' }, B);
      label(g, COL[0], y, ans, 't-s ' + cls);
      label(g, COL[1], y, pct(p), 't-s t-ink');
      label(g, COL[2], y, pct(q) + ' safe', 't-s t-belief');
      label(g, COL[3], y, pct(e), 't-s t-ink');
      return g;
    }
    var r1 = row(CY + 78, 'safe', 't-ok', ps, q1, e1);
    var r0 = row(CY + 100, 'unsafe', 't-alert', 1 - ps, q0, e0);
    var eB = svgEl('g', { style: 'opacity:0' }, B);
    svgEl('line', { 'class': 'axis', x1: BXc + 14, y1: CY + 112, x2: BXc + BWc - 14, y2: CY + 112 }, eB);
    label(eB, BXc + 16, CY + 130, 'expected error after the answer', 't-xs t-muted');
    label(eB, BXc + 16, CY + 148, pct(eAsk), 't-big t-ink t-b');
    label(eB, BXc + 70, CY + 148, '= ' + pct(ps) + ' \u00D7 ' + pct(e1) + ' + ' + pct(1 - ps) + ' \u00D7 ' + pct(e0), 't-xs t-muted');

    var verdict = label(s, 240, 298, 'Asking wins whenever ' + pct(eStop) + ' \u2212 ' + pct(eAsk) + ' > ' + c.toFixed(2) + ' \u03BB, i.e. \u03BB < ' + lamStar.toFixed(1) + '. Then repeat from the new belief.', 't-s t-ink t-b', { 'text-anchor': 'middle', style: 'opacity:0' });
    var cardA = A.querySelector('rect'), cardB = B.querySelector('rect');

    return async function (alive) {
      [A, B, g1, g0, l1, l0, hdr, r1, r0, eB, verdict].forEach(function (n) { show(n, 0); });
      rmClass(cardA, 'on'); rmClass(cardB, 'on');
      g1.setAttribute('cx', X(Q0)); g0.setAttribute('cx', X(Q0));
      await sleep(400); if (!alive()) return;
      show(A, 1); addClass(cardA, 'on');
      await sleep(1000); if (!alive()) return;
      rmClass(cardA, 'on'); show(B, 1); addClass(cardB, 'on');
      await sleep(600); if (!alive()) return;
      show(g1, 1); show(g0, 1);
      await tween(900, function (t) {
        g1.setAttribute('cx', X(Q0 + (q1 - Q0) * t));
        g0.setAttribute('cx', X(Q0 + (q0 - Q0) * t));
      });
      if (!alive()) return;
      show(l1, 1); show(l0, 1); show(hdr, 1);
      await sleep(500); if (!alive()) return;
      show(r1, 1);
      await sleep(600); if (!alive()) return;
      show(r0, 1);
      await sleep(700); if (!alive()) return;
      show(eB, 1);
      await sleep(900); if (!alive()) return;
      rmClass(cardB, 'on');
      show(verdict, 1);
    };
  };

  /* The optimal circuit: a policy tree for one prompt, driven by a price slider.
     On first arrival the price sweeps from dear to cheap so the tree grows. */
  figures.dp = function (fig) {
    var W = 680, H = 300;
    var s = makeSvg(fig, W, H);
    var slider = fig.querySelector('#dp-lambda');
    var lamOut = fig.querySelector('[data-role="lam"]');
    var errOut = fig.querySelector('[data-role="err"]');
    var costOut = fig.querySelector('[data-role="cost"]');
    var noteOut = fig.querySelector('[data-role="note"]');
    var gE = svgEl('g', {}, s), gN = svgEl('g', {}, s);
    var ANSWERS = [1, 1, 1];     // the prompt's recorded answers: all three instruments say "safe"

    // the five weights at which the optimal circuit changes shape (slider index 0..4, large to small)
    var STOPS = [
      { lam: 0.2, txt: 'asks all three instruments when the answers leave it unsure' },
      { lam: 0.45, txt: 'asks LLM2 first; LLM1 and LLM3 only after an ambiguous answer' },
      { lam: 1, txt: 'asks LLM2 once, then predicts' },
      { lam: 2, txt: 'asks the cheap LLM1 once, then predicts' },
      { lam: 4, txt: 'predicts from the embedding alone, no query is worth its price' }
    ];
    function lamOf(v) { return STOPS[Math.max(0, Math.min(STOPS.length - 1, Math.round(v)))].lam; }
    function fmtLam(l) { return l >= 1 ? String(l) : l.toFixed(2).replace(/0$/, ''); }

    function treeOf(memo) {
      function node(key, q, depth) {
        var r = memo[key];
        var n = { key: key, q: q, depth: depth, r: r, kids: [] };
        if (r.act === 'ask') {
          var i = r.i;
          [1, 0].forEach(function (x) {
            var k2 = key.substr(0, i) + x + key.substr(i + 1);
            var child = node(k2, post(q, i, x), depth + 1);
            child.via = i; child.x = x; child.p = x ? r.ps : 1 - r.ps;
            n.kids.push(child);
          });
        }
        return n;
      }
      return node('...', Q0, 0);
    }
    function leaves(n) { return n.kids.length ? n.kids.reduce(function (a, k) { return a + leaves(k); }, 0) : 1; }
    function layout(n, x0, x1, y) {
      n.px = (x0 + x1) / 2; n.py = y;
      if (!n.kids.length) return;
      var total = leaves(n), x = x0;
      n.kids.forEach(function (k) {
        var w = (x1 - x0) * leaves(k) / total;
        layout(k, x, x + w, y + 84); x += w;
      });
    }
    function onPath(n) {           // is this node reached by the recorded answers?
      return n.key.split('').every(function (ch, i) { return ch === '.' || +ch === ANSWERS[i]; });
    }

    function render(lam, animate) {
      var memo = solveDP(lam);
      var root = treeOf(memo);
      layout(root, 20, W - 20, 36);
      gE.innerHTML = ''; gN.innerHTML = '';
      var rootR = memo['...'];
      lamOut.textContent = 'λ = ' + fmtLam(lam);
      errOut.textContent = pct(rootR.err);
      costOut.textContent = rootR.cost.toFixed(2);
      var stop = STOPS.filter(function (o) { return o.lam === lam; })[0];
      noteOut.textContent = stop ? stop.txt : (rootR.act === 'stop' ? 'predicts from the embedding alone' : 'first query: ' + INST[rootR.i].name);

      (function draw(n) {
        var hot = onPath(n);
        n.kids.forEach(function (k) {
          var d = 'M' + n.px + ',' + (n.py + 10) + ' C' + n.px + ',' + (n.py + 50) + ' ' + k.px + ',' + (k.py - 60) + ' ' + k.px + ',' + (k.py - 30);
          var e = svgEl('path', { 'class': 'edge' + (hot && onPath(k) ? ' on' : ''), d: d }, gE);
          if (animate) { e.style.opacity = 0; e.style.transitionDelay = (hot && onPath(k) ? 700 + n.depth * 220 : n.depth * 120 + 60) + 'ms'; }
          var mx = (n.px + k.px) / 2, my = (n.py + k.py) / 2 - 6;
          label(gE, mx, my, (k.x ? 'safe' : 'unsafe') + ' ' + pct(k.p), 't-xs halo ' + (hot && onPath(k) ? 't-belief' : 't-muted'), { 'text-anchor': 'middle' });
          draw(k);
        });
        var g = svgEl('g', { 'class': 'nd ' + (hot ? 'on' : 'off') }, gN);
        if (animate) { g.style.opacity = 0; g.style.transitionDelay = (n.depth * 120) + 'ms'; }
        var top = n.depth === 0 ? 'embedding @ ' + pct(n.q) : INST[n.via].name + ' @ ' + pct(n.q);
        label(g, n.px, n.py - 14, top, 't-xs ' + (n.depth === 0 ? 't-belief' : 't-' + INST[n.via].cls), { 'text-anchor': 'middle' });
        if (n.r.act === 'ask') {
          label(g, n.px, n.py + 2, 'asks ' + INST[n.r.i].name, 't-s t-ink', { 'text-anchor': 'middle' });
        } else {
          var lbl = 'predict ' + (n.q >= .5 ? 'safe' : 'unsafe');
          svgEl('rect', { 'class': 'stop-pill' + (hot ? ' on' : ''), x: n.px - 40, y: n.py - 10, width: 80, height: 20, rx: 10 }, g);
          label(g, n.px, n.py + 4, lbl, 't-xs ' + (n.q >= .5 ? 't-ok' : 't-alert'), { 'text-anchor': 'middle' });
        }
      })(root);
      if (animate) {
        void gN.offsetWidth;
        Array.prototype.forEach.call(gN.children, function (g) { g.style.opacity = ''; });
        Array.prototype.forEach.call(gE.querySelectorAll('path'), function (e) { e.style.opacity = ''; });
      }
    }

    slider.addEventListener('input', function () { manual = true; render(lamOf(+slider.value), true); });
    var manual = false;
    render(lamOf(+slider.value), false);

    return async function (alive) {
      manual = false;
      slider.classList.remove('nudge');
      // step through the five weights, large to small, so each distinct circuit is seen
      for (var k = STOPS.length - 1; k >= 0; k--) {
        if (!alive() || manual) return;
        slider.value = k;
        render(lamOf(k), true);
        await sleep(k === STOPS.length - 1 ? 1500 : 2300);
      }
      if (!alive()) return;
      slider.classList.add('nudge');
    };
  };

  /* Gluing it together. Panel 1: fit the two-headed model once. Panel 2: the
     fitted model feeds the dynamic program, which emits the circuit. Step 3:
     while the circuit runs, each answer enters the history and the belief updates. */
  figures.glue = function (fig) {
    var s = makeSvg(fig, 480, 362);
    // arrowheads: one grey, one blue; a wire swaps to the blue one when it lights up
    var defs = svgEl('defs', {}, s);
    [['glue-arr', 'var(--line-2)'], ['glue-arr-on', 'var(--accent)']].forEach(function (m) {
      var mk = svgEl('marker', { id: m[0], viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' }, defs);
      svgEl('path', { d: 'M0,0 L10,5 L0,10 z', style: 'fill:' + m[1] }, mk);
    });
    function arrow(d, alt) { return svgEl('path', { 'class': 'wire' + (alt ? ' alt' : ''), d: d, 'marker-end': 'url(#glue-arr)' }, s); }
    function lightWire(w) { addClass(w, 'on'); w.setAttribute('marker-end', 'url(#glue-arr-on)'); }
    function dimWire(w) { rmClass(w, 'on'); w.setAttribute('marker-end', 'url(#glue-arr)'); }
    function frame(y, h, title) {
      svgEl('rect', { x: 8, y: y, width: 464, height: h, rx: 10, style: 'fill:none;stroke:var(--line-2);stroke-dasharray:4 4' }, s);
      label(s, 18, y + 16, title, 't-s t-ink t-b halo');
    }

    /* ---- panel 1: fit once ---- */
    frame(6, 204, '1   Fit a probabilistic model once');
    svgEl('rect', { 'class': 'bubble', x: 20, y: 36, width: 140, height: 48, rx: 10 }, s);
    label(s, 30, 54, '\u201CHow to convince someone', 't-xs t-ink');
    label(s, 30, 68, 'to take drugs\u2026\u201D + response', 't-xs t-ink');
    var a1 = arrow('M160,60 L186,60');
    label(s, 250, 46, '\u03C6(z)  text embedding', 't-xs t-muted', { 'text-anchor': 'middle' });
    var emb = [];
    for (var k = 0; k < 12; k++) emb.push(svgEl('rect', { 'class': 'emb', x: 190 + k * 10, y: 52, width: 10, height: 14, style: 'opacity:.12' }, s));
    var a2 = arrow('M250,66 L250,90');
    var net = svgEl('rect', { 'class': 'pbox', x: 190, y: 94, width: 120, height: 90, rx: 10 }, s);
    label(s, 250, 110, 'f\u03B8', 't-mono t-ink t-b', { 'text-anchor': 'middle' });
    var neurons = [], syn = [];
    var L = [[206, [128, 150, 172]], [250, [134, 166]], [294, [128, 150, 172]]];
    L.forEach(function (col, ci) {
      if (ci) L[ci - 1][1].forEach(function (y0) { col[1].forEach(function (y1) {
        syn.push(svgEl('line', { 'class': 'syn', x1: L[ci - 1][0], y1: y0, x2: col[0], y2: y1 }, s));
      }); });
    });
    L.forEach(function (col) { col[1].forEach(function (y) { neurons.push(svgEl('circle', { 'class': 'neuron', cx: col[0], cy: y, r: 4 }, s)); }); });

    svgEl('rect', { 'class': 'card', x: 20, y: 96, width: 140, height: 88, rx: 10 }, s);
    label(s, 30, 112, 'history', 't-mono t-ink t-b');
    label(s, 150, 112, 'answers so far', 't-xs t-muted', { 'text-anchor': 'end' });
    var hist = INST.map(function (I, j) {
      var g = svgEl('g', { style: 'opacity:0' }, s);
      svgEl('rect', { 'class': 'chip s', x: 30, y: 120 + j * 20, width: 120, height: 16, rx: 5 }, g);
      label(g, 36, 132 + j * 20, I.name, 't-' + I.cls, { style: 'font-size:9px' });
      label(g, 144, 132 + j * 20, 'said safe', 't-ok', { 'text-anchor': 'end', style: 'font-size:9px' });
      return g;
    });
    var a3 = arrow('M160,140 L186,140');

    var a4 = arrow('M310,120 L338,120');
    var a5 = arrow('M310,166 L338,166');
    label(s, 344, 108, '\u03B7  belief  P(safe | z, history)', 't-xs t-belief');
    svgEl('rect', { 'class': 'bar-bg', x: 344, y: 114, width: 96, height: 12, rx: 6 }, s);
    var bFill = svgEl('rect', { 'class': 'belief-fill', x: 344, y: 114, width: 0, height: 12, rx: 6 }, s);
    var bTxt = label(s, 446, 124, '', 't-xs t-belief');
    label(s, 344, 150, '\u03BD\u1D62  P(i says safe | z, history)', 't-xs t-accent');
    var NU = [.48, .47, .47];
    var nuFill = INST.map(function (I, j) {
      var y = 156 + j * 12;
      label(s, 344, y + 8, I.short, 't-' + I.cls, { style: 'font-size:9px' });
      svgEl('rect', { 'class': 'bar-bg', x: 374, y: y, width: 86, height: 8, rx: 4 }, s);
      return svgEl('rect', { 'class': 'bar-fill ' + I.cls, x: 374, y: y, width: 0, height: 8, rx: 4 }, s);
    });
    var trainNote = label(s, 18, 200, 'trained with cross-entropy: \u03B7 against recorded labels, \u03BD against recorded calls', 't-xs t-muted', { style: 'opacity:0' });

    /* ---- panel 2: generate the circuit ---- */
    frame(222, 132, '2   Generate the circuit for any prompt and any \u03BB');
    var boxA = svgEl('rect', { 'class': 'pbox', x: 20, y: 252, width: 128, height: 56, rx: 10 }, s);
    label(s, 84, 272, 'fitted model f\u03B8', 't-s t-ink t-b', { 'text-anchor': 'middle' });
    label(s, 84, 288, '\u03B7 and \u03BD at every state', 't-xs t-muted', { 'text-anchor': 'middle' });
    var a6 = arrow('M148,280 L186,280');
    var dp = svgEl('rect', { 'class': 'pbox', x: 190, y: 252, width: 128, height: 56, rx: 10 }, s);
    label(s, 254, 272, 'dynamic program', 't-s t-ink t-b', { 'text-anchor': 'middle' });
    label(s, 254, 288, 'query or stop, weight \u03BB', 't-xs t-muted', { 'text-anchor': 'middle' });
    var a7 = arrow('M318,280 L356,280');
    var tree = svgEl('g', { style: 'opacity:0' }, s);
    svgEl('path', { 'class': 'edge on', d: 'M380,258 L380,272 L366,290' }, tree);
    svgEl('path', { 'class': 'edge', d: 'M380,272 L394,290' }, tree);
    svgEl('path', { 'class': 'edge on', d: 'M366,290 L358,306' }, tree);
    svgEl('path', { 'class': 'edge', d: 'M366,290 L374,306' }, tree);
    svgEl('circle', { 'class': 'inst c0', cx: 380, cy: 258, r: 5 }, tree);
    svgEl('circle', { 'class': 'inst c1', cx: 366, cy: 290, r: 5 }, tree);
    svgEl('circle', { 'class': 'marker', cx: 394, cy: 290, r: 4 }, tree);
    svgEl('circle', { 'class': 'marker', cx: 358, cy: 306, r: 4 }, tree);
    svgEl('circle', { 'class': 'marker', cx: 374, cy: 306, r: 4 }, tree);
    label(tree, 408, 276, 'the circuit', 't-xs t-ink t-b');
    label(tree, 408, 290, 'for this prompt', 't-xs t-muted');

    function setBelief(q) { bFill.setAttribute('width', 96 * q); bTxt.textContent = pct(q); }
    // the example state shown in the history box: LLM1 and LLM2 both said safe
    var HIST_N = 2, Q_HIST = post(post(Q0, 0, 1), 1, 1);

    return async function (alive) {
      emb.forEach(function (e) { e.style.opacity = .12; });
      neurons.forEach(function (n) { rmClass(n, 'lit'); }); syn.forEach(function (n) { rmClass(n, 'lit'); });
      [a1, a2, a3, a4, a5, a6, a7].forEach(dimWire);
      [net, boxA, dp].forEach(function (n) { rmClass(n, 'lit'); });
      hist.forEach(function (h) { show(h, 0); });
      [tree, trainNote].forEach(function (n) { show(n, 0); });
      setBelief(0); nuFill.forEach(function (f) { f.setAttribute('width', 0); });
      await sleep(300); if (!alive()) return;
      lightWire(a1);
      for (var k = 0; k < emb.length; k++) { emb[k].style.opacity = .25 + .75 * Math.abs(Math.sin(k * 1.7 + .4)); await sleep(60); }
      if (!alive()) return;
      await sleep(200); lightWire(a2);
      for (var h = 0; h < HIST_N; h++) { await sleep(300); if (!alive()) return; show(hist[h], 1); }
      lightWire(a3); await sleep(300); if (!alive()) return;
      addClass(net, 'lit');
      for (var c = 0; c < L.length; c++) {
        neurons.forEach(function (n) { if (+n.getAttribute('cx') === L[c][0]) addClass(n, 'lit'); });
        syn.forEach(function (l) { if (+l.getAttribute('x2') === L[c][0]) addClass(l, 'lit'); });
        await sleep(220);
      }
      if (!alive()) return;
      lightWire(a4); lightWire(a5);
      await Promise.all([
        tween(700, function (t) { setBelief(Q_HIST * t); }),
        tween(700, function (t) { nuFill.forEach(function (f, j) { f.setAttribute('width', 86 * NU[j] * t); }); })
      ]);
      if (!alive()) return;
      show(trainNote, 1);
      await sleep(900); if (!alive()) return;
      // panel 2
      addClass(boxA, 'lit'); await sleep(400); if (!alive()) return;
      lightWire(a6); await sleep(350); if (!alive()) return;
      addClass(dp, 'lit'); await sleep(400); if (!alive()) return;
      lightWire(a7); await sleep(300); if (!alive()) return;
      show(tree, 1);
      await sleep(1000); if (!alive()) return;
    };
  };

  /* ----------------------------------------------------------- figure runner */

  function mountFigures() {
    document.querySelectorAll('[data-fig]').forEach(function (fig) {
      var build = figures[fig.dataset.fig];
      if (!build) return;
      fig.classList.add('armed');
      var play = build(fig);
      if (!play) return;
      var run = 0;
      var replay = fig.querySelector('[data-replay]');
      function pulseReplay(mine) {
        if (mine !== run || !replay) return;
        void replay.offsetWidth;
        replay.classList.add('nudge');
      }
      function start() {
        var mine = ++run;
        if (replay) replay.classList.remove('nudge');
        var done = play(function () { return mine === run; }, function () { pulseReplay(mine); });
        // figures that return a promise pulse Replay when the run ends undisturbed;
        // the circuits figure instead calls the callback after its last wiring
        if (done && done.then && fig.dataset.fig !== 'circuits') done.then(function () { pulseReplay(mine); });
      }
      if (replay) replay.addEventListener('click', start);
      if (!('IntersectionObserver' in window)) { start(); return; }
      var io = new IntersectionObserver(function (entries) {
        if (entries.some(function (e) { return e.isIntersecting; })) { io.disconnect(); start(); }
      }, { threshold: 0.4 });
      io.observe(fig);
    });
  }

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(mountFigures);
  else mountFigures();
})();
