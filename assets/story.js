/* Story screens for index.html (Circuits of LLM Classifiers).

   Navigation: the progress rail and the "next" button follow whichever screen
   holds the middle of the window.

   Figures: each [data-fig] is drawn once the web fonts are ready and plays the
   first time its screen scrolls into view; the noisy-measurement figure replays
   on each visit. The Replay button also runs a figure again.
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
    if (str.indexOf('$') >= 0) mathSpans(t, str); else t.textContent = str;
    return t;
  }
  /* Math between $...$ is set in the KaTeX (Computer Modern) faces that katex.min.css
     declares: single letters italic (.mi), words, digits and punctuation upright (.mr),
     and _x a subscript. Falls back to the serif stack if KaTeX did not load. */
  function mathSpans(t, str) {
    var parts = str.split('$');
    for (var i = 0; i < parts.length; i++) {
      if (!parts[i]) continue;
      if (i % 2 === 0) { svgEl('tspan', {}, t).textContent = parts[i]; continue; }
      var re = /_([A-Za-z\u0370-\u03FF])|([A-Za-z\u0370-\u03FF]{2,})|([A-Za-z\u0370-\u03FF])|([^A-Za-z\u0370-\u03FF_]+)/g, m;
      while ((m = re.exec(parts[i]))) {
        if (m[1]) {
          svgEl('tspan', { 'class': 'mi', dy: 3, style: 'font-size:75%' }, t).textContent = m[1];
          svgEl('tspan', { dy: -3 }, t).textContent = '\u200B';
        } else if (m[2]) svgEl('tspan', { 'class': 'mr' }, t).textContent = m[2];
        else if (m[3]) svgEl('tspan', { 'class': 'mi' }, t).textContent = m[3];
        else svgEl('tspan', { 'class': 'mr' }, t).textContent = m[4];
      }
    }
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

  function policyTrace(lam, answers) {
    var memo = solveDP(lam), key = '...', steps = [];
    while (memo[key].act === 'ask') {
      var i = memo[key].i, answer = answers[i];
      steps.push({ i: i, answer: answer });
      key = key.substr(0, i) + answer + key.substr(i + 1);
    }
    return steps;
  }

  function settingLabel(lam) {
    return 'Setting: ' + (lam <= .2 ? 'Prioritize Accuracy' : lam >= 4 ? 'Prioritize Cost' : 'Balance Cost and Accuracy');
  }

  function setSettingHeading(node, lam) {
    node.textContent = '';
    var prefix = document.createElement('span');
    prefix.className = 'setting-prefix'; prefix.textContent = 'Circuit Setting:';
    node.appendChild(prefix);
    node.appendChild(document.createTextNode(' ' + settingLabel(lam).replace('Setting: ', '')));
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

  /* Keep the prompt's estimated belief fixed while lambda changes the circuit. */
  (function () {
    var out = document.getElementById('cover-out');
    if (!out) return;
    var el = function (id) { return document.getElementById(id); };
    var diagram = el('cover-diagram'), frame = diagram.closest('.cover-circuit');
    var viewport = diagram.closest('.circuit-viewport');
    var W = ['cw0', 'cw1', 'cw2', 'cw3', 'cw4', 'cw5', 'cw6'].map(el);
    var N = ['cn0', 'cn1', 'cn2'].map(el);
    var models = ['cover-model-0', 'cover-model-1', 'cover-model-2'].map(el);
    var answers = ['cover-branch-1', 'cover-answer-1', 'cover-answer-2'].map(el);
    var input = el('cover-prompt-wire'), balanced = el('cover-balanced-wire'), prediction = el('cover-predict');
    var stages = W.concat(models, answers, [input, balanced, prediction]);
    stages.forEach(function (n) { addClass(n, 'reveal-step'); });
    addClass(frame, 'is-animating');
    var ticket = 0, running = false, automatic = !REDUCE, inView = false, setting = 0;
    function alignSource() {
      var flow = frame.querySelector('.cover-flow');
      var matrix = diagram.getScreenCTM();
      var entry = new DOMPoint(0, 172).matrixTransform(matrix);
      flow.style.setProperty('--entry-y', (entry.y - flow.getBoundingClientRect().top) + 'px');
      var border = new DOMPoint(el('cover-board').getBoundingClientRect().left, entry.y).matrixTransform(matrix.inverse());
      input.setAttribute('d', 'M' + border.x + ',172 H48');
      var name = models[0].querySelector('.model-name');
      var baseline = new DOMPoint(+name.getAttribute('x'), +name.getAttribute('y')).matrixTransform(name.getScreenCTM());
      var source = frame.querySelector('.cover-source svg');
      var caption = baseline.matrixTransform(source.getScreenCTM().inverse());
      el('cover-prior').setAttribute('y', caption.y);
    }
    alignSource();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(alignSource);
    window.addEventListener('resize', alignSource);
    if ('ResizeObserver' in window) new ResizeObserver(alignSource).observe(el('cover-board'));
    function reveal(n, follow) {
      addClass(n, 'is-visible');
      if (follow && !REDUCE && viewport.scrollWidth > viewport.clientWidth) {
        var r = n.getBoundingClientRect(), v = viewport.getBoundingClientRect();
        viewport.scrollTo({ left: viewport.scrollLeft + r.left - v.left - (viewport.clientWidth - r.width) / 2, behavior: 'smooth' });
      }
    }
    async function play(value) {
      var mine = ++ticket, alive = function () { return mine === ticket; };
      var lam = [.2, 1, 4][value], trace = policyTrace(lam, [0, 1, 0]);
      var state = { q: Q0, calls: 0, cost: 0 };
      running = true; setting = value;
      setSettingHeading(el('cover-weight-value'), lam);
      frame.dataset.weight = ['accuracy', 'balance', 'cost'][value];
      stages.forEach(function (n) { rmClass(n, 'is-visible'); });
      W.concat([input, balanced]).forEach(function (w) { rmClass(w, 'live'); });
      N.forEach(function (n) { rmClass(n, 'lit'); });
      viewport.scrollLeft = 0;
      function numbers() {
        el('cover-belief').textContent = pct(state.q);
        el('cover-calls').textContent = state.calls;
        el('cover-cost').textContent = '$' + state.cost.toFixed(2);
      }
      async function pause(ms) { await sleep(ms); return alive(); }
      async function send(w) {
        if (!alive()) return false;
        reveal(w); addClass(w, 'live');
        await sleep(650); return alive();
      }
      numbers();
      if (!await pause(300) || !await send(input)) return;
      if (!trace.length) {
        if (!await send(W[3])) return;
      } else {
        if (!await send(trace[0].i === 1 ? balanced : W[0])) return;
        for (var j = 0; j < trace.length; j++) {
          var step = trace[j];
          reveal(models[step.i], true); addClass(N[step.i], 'lit');
          if (!await pause(850)) return;
          state.q = post(state.q, step.i, step.answer);
          state.calls++; state.cost += INST[step.i].cost; numbers();
          answers[step.i].textContent = step.answer ? 'says safe' : 'says harmful';
          reveal(answers[step.i]);
          if (!await pause(400)) return;
          if (j < trace.length - 1 && !await send(trace[j + 1].i === 1 ? W[1] : W[2])) return;
        }
        if (!await send(trace[trace.length - 1].i === 1 ? W[4] : W[5]) || !await send(W[6])) return;
      }
      out.textContent = 'P(safe)=' + pct(state.q);
      reveal(prediction, true); running = false;
      if (automatic) setTimeout(function () {
        if (alive() && inView && !document.hidden) play((value + 1) % 3);
      }, 2200);
    }
    if (REDUCE) { play(setting); return; }
    if ('IntersectionObserver' in window) {
      var observer = new IntersectionObserver(function (entries) {
        var visible = entries.some(function (entry) { return entry.isIntersecting && entry.intersectionRatio >= .25; });
        if (visible && !inView) { inView = true; if (!running) play(setting); }
        else if (!visible && inView) { inView = false; ticket++; running = false; }
      }, { threshold: [0, .25] });
      observer.observe(diagram);
    } else { inView = true; play(setting); }
  })();

  /* ----------------------------------------------------------------- figures */

  var figures = {};

  /* Noisy instruments: one prompt, six calls to a cheap model and six to an
     expensive one. Chips pop in one at a time, then a tally. */
  figures.noisy = function (fig) {
    var s = makeSvg(fig, 560, 150);

    var ROWS = [
      { name: 'LLM1', sub: 'small model', cost: 'cost 1× per call', cls: 'c0', ans: [1, 1, 0, 1, 0, 1] },
      { name: 'LLM2', sub: 'large model', cost: 'cost 6× per call', cls: 'c2', ans: [1, 1, 1, 1, 0, 1] }
    ];
    var rows = ROWS.map(function (r, k) {
      var y = 42 + k * 70;
      label(s, 100, y - 3, r.sub, 't-' + r.cls, { 'text-anchor': 'end', style: 'font-size:11.5px;font-weight:600' });
      label(s, 100, y + 13, r.cost, 't-muted', { 'text-anchor': 'end', style: 'font-size:10.5px' });
      svgEl('circle', { 'class': 'inst ' + r.cls, cx: 145, cy: y, r: 20 }, s);
      label(s, 145, y + 4, r.name, 't-ink t-b', { 'text-anchor': 'middle', style: 'font-size:10.5px' });
      var chips = r.ans.map(function (a, j) {
        var g = svgEl('g', { style: 'opacity:0' }, s);
        var x = 190 + j * 58;
        svgEl('rect', { 'class': 'chip ' + (a ? 'h' : 's'), x: x, y: y - 14, width: 52, height: 28, rx: 7 }, g);
        label(g, x + 26, y + 4, a ? 'harmful' : 'safe', 't-s ' + (a ? 't-alert' : 't-ok'), { 'text-anchor': 'middle' });
        return g;
      });
      return { chips: chips };
    });
    return async function (alive) {
      rows.forEach(function (r) { r.chips.forEach(function (c) { show(c, 0); }); });
      await sleep(300); if (!alive()) return;
      for (var k = 0; k < rows.length; k++) {
        var r = rows[k];
        for (var j = 0; j < r.chips.length; j++) {
          await sleep(j ? 260 : 200); if (!alive()) return;
          show(r.chips[j], 1);
        }
        await sleep(500); if (!alive()) return;
      }
    };
  };

  /* The comparison uses the same model cards, answer badges, and readouts as the cover. */
  figures.circuits = function (fig) {
    var s = makeSvg(fig, 800, 320);
    var seg = fig.querySelector('.seg'), cap = fig.querySelector('[data-role="cap"]');
    var frame = fig.querySelector('.circuit-comparison'), viewport = fig.querySelector('.circuit-viewport');
    var TYPES = ['Majority voting', 'Routing', 'Cascade', 'LMCircuit'];
    var CAPS = [
      'Majority voting asks every instrument at once and takes the most common answer.',
      'Routing predicts which single instrument suits the prompt and asks only that one.',
      'A cascade asks in a fixed order and stops at the first confident answer. Here the cheap model is unsure, so the more expensive model decides.',
      'LMCircuit lets the next query depend on the prompt and all the answers so far, choosing the model that best minimizes the remaining uncertainty, and stops when the belief is sure.'
    ];
    var cur = 0, token = 0, interacted = false, finished = function () {};
    var gW = svgEl('g', {}, s), gN = svgEl('g', {}, s);
    if (!REDUCE) addClass(frame, 'is-animating');
    TYPES.forEach(function (type, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.setAttribute('role', 'radio'); b.textContent = type;
      b.setAttribute('aria-checked', i === 0 ? 'true' : 'false');
      b.addEventListener('click', function () { interacted = true; select(i); run(i, false); });
      seg.appendChild(b);
    });
    function select(i) {
      cur = i;
      Array.prototype.forEach.call(seg.children, function (b, j) { b.setAttribute('aria-checked', j === i ? 'true' : 'false'); });
    }
    function stage(n) { addClass(n, 'reveal-step'); return n; }
    function reveal(n, follow) {
      addClass(n, 'is-visible');
      if (follow && !REDUCE && viewport.scrollWidth > viewport.clientWidth) {
        var r = n.getBoundingClientRect(), v = viewport.getBoundingClientRect();
        viewport.scrollTo({ left: viewport.scrollLeft + r.left - v.left - (viewport.clientWidth - r.width) / 2, behavior: 'smooth' });
      }
    }
    function box(x, y, w, h, text) {
      var g = svgEl('g', { transform: 'translate(' + x + ' ' + y + ')' }, gN);
      svgEl('rect', { 'class': 'cbox', width: w, height: h, rx: 12 }, g);
      label(g, w / 2, h / 2 + 5, text, '', { 'text-anchor': 'middle' });
      return g;
    }
    function model(x, y, i) {
      var g = stage(svgEl('g', { transform: 'translate(' + x + ' ' + y + ')', 'data-model': i }, gN));
      var card = svgEl('rect', { 'class': 'cn ' + INST[i].cls, width: 112, height: 64, rx: 14 }, g);
      label(g, 56, 28, INST[i].name, 'model-name', { 'text-anchor': 'middle' });
      // Use plain text here because the currency symbol is not a math delimiter.
      svgEl('text', { 'class': 'model-cost', x: 56, y: 47, 'text-anchor': 'middle' }, g).textContent = '$' + INST[i].cost.toFixed(2) + ' / call';
      return { group: g, card: card };
    }
    function badge(x, y, answer) {
      var g = stage(svgEl('g', { 'class': 'branch-badge', transform: 'translate(' + x + ' ' + y + ')', 'data-answer': answer }, gN));
      svgEl('rect', { width: 126, height: 26, rx: 13 }, g);
      label(g, 63, 17, answer === 1 ? 'says safe' : 'says harmful', '', { 'text-anchor': 'middle' });
      return g;
    }
    function wire(d, alt) { return stage(svgEl('path', { 'class': 'cw' + (alt ? ' alt' : ''), d: d }, gW)); }
    function curve(x1, y1, x2, y2) { var mx = (x1 + x2) / 2; return 'M' + x1 + ',' + y1 + ' C' + mx + ',' + y1 + ' ' + mx + ',' + y2 + ' ' + x2 + ',' + y2; }
    function build(t, lam) {
      lam = lam === undefined ? .2 : lam;
      s.setAttribute('viewBox', t === 3 ? '0 0 1020 360' : '0 0 800 320');
      fig.querySelector('[data-readout="belief"]').parentElement.hidden = t !== 3;
      frame.classList.toggle('has-setting', t === 3);
      fig.dataset.circuitType = ['voting', 'routing', 'cascade', 'adaptive'][t];
      var heading = fig.querySelector('[data-role="comparison-heading"]');
      heading.hidden = t !== 3;
      if (t === 3) setSettingHeading(heading, lam); else heading.textContent = '';
      gW.innerHTML = ''; gN.innerHTML = '';
      viewport.scrollLeft = 0;
      var state = { q: t === 3 ? Q0 : .5, calls: 0, cost: 0 };
      function numbers() {
        fig.querySelector('[data-readout="belief"]').textContent = pct(state.q);
        fig.querySelector('[data-readout="calls"]').textContent = state.calls;
        fig.querySelector('[data-readout="cost"]').textContent = '$' + state.cost.toFixed(2);
      }
      numbers();
      box(8, t === 3 ? 145 : 128, 100, 54, 'Prompt');
      var prediction = stage(svgEl('g', { transform: t === 3 ? 'translate(824 126)' : t === 2 ? 'translate(622 32)' : 'translate(622 123)', 'data-prediction': '' }, gN));
      svgEl('rect', { 'class': 'prediction', width: 170, height: t === 3 ? 92 : 64, rx: 14 }, prediction);
      var title = label(prediction, 85, 21, '', 'prediction-title', { 'text-anchor': 'middle' });
      var output = label(prediction, 85, 45, '', 'prediction-output', { 'text-anchor': 'middle' });
      function result(answer) {
        title.textContent = t === 3 ? '' : 'OUTPUT';
        output.textContent = t === 3 ? 'P(safe)=' + pct(state.q) : (answer ? 'safe' : 'harmful');
        if (t === 3) output.setAttribute('y', 53);
        reveal(prediction, true);
      }
      async function send(w, alive) {
        if (!alive()) return false;
        w.style.opacity = ''; reveal(w); addClass(w, 'live');
        await sleep(550);
        return alive();
      }
      async function query(node, i, answer, chip, alive) {
        if (!alive()) return false;
        reveal(node.group, true); node.group.style.opacity = '1'; addClass(node.card, 'lit');
        await sleep(650); if (!alive()) return false;
        if (t === 3) state.q = post(state.q, i, answer);
        state.calls++; state.cost += INST[i].cost;
        numbers(); reveal(chip);
        await sleep(350);
        return alive();
      }
      if (t === 0) {
        var ys = [40, 155, 270], answers = [0, 1, 0], models = [], chips = [], incoming = [], outgoing = [];
        ys.forEach(function (y, i) {
          models.push(model(280, y - 32, i));
          chips.push(badge(432, i === 0 ? 6 : i === 1 ? 113 : 284, answers[i]));
          incoming.push(wire(curve(108, 155, 280, y)));
          outgoing.push(wire(curve(392, y, 622, 155)));
        });
        return async function (alive) {
          await sleep(300); if (!alive()) return;
          await Promise.all(incoming.map(function (w) { return send(w, alive); })); if (!alive()) return;
          await Promise.all(models.map(function (node, i) { return query(node, i, answers[i], chips[i], alive); })); if (!alive()) return;
          await Promise.all(outgoing.map(function (w) { return send(w, alive); })); if (!alive()) return;
          result(answers.reduce(function (sum, a) { return sum + a; }, 0) >= 2 ? 1 : 0);
        };
      }
      if (t === 1) {
        var router = stage(box(160, 128, 100, 54, 'Router'));
        var start = wire('M108,155 H160'), routeNodes = [], routeIn = [], routeOut = [];
        [40, 155, 270].forEach(function (y, i) {
          routeNodes.push(model(360, y - 32, i));
          routeIn.push(wire(curve(260, 155, 360, y), i !== 1));
          routeOut.push(wire(curve(472, y, 622, 155), i !== 1));
        });
        var routedAnswer = badge(488, 113, 0);
        routeNodes.forEach(function (node, i) {
          [node.group, routeIn[i], routeOut[i]].forEach(function (n) { reveal(n); n.style.opacity = '.2'; });
        });
        return async function (alive) {
          await sleep(300); if (!await send(start, alive)) return;
          reveal(router, true);
          await sleep(400); if (!await send(routeIn[1], alive)) return;
          if (!await query(routeNodes[1], 1, 0, routedAnswer, alive)) return;
          if (!await send(routeOut[1], alive)) return;
          result(0);
        };
      }
      if (t === 2) {
        var first = model(176, 123, 0), second = model(322, 123, 1), third = model(468, 123, 2);
        var firstAnswer = badge(169, 214, 1), secondAnswer = badge(315, 214, 1);
        var unsure = stage(label(gN, 232, 258, 'not confident', 'comparison-note', { 'text-anchor': 'middle' }));
        var enter = wire('M108,155 H176'), next = wire('M288,155 H322');
        var unused = wire('M434,155 H468', true);
        var stop = wire('M378,123 V80 Q378,64 394,64 H622');
        stop.setAttribute('data-cascade-output', '');
        [first, second, third].forEach(function (node) { reveal(node.group); node.group.style.opacity = '.2'; });
        [enter, next, unused].forEach(function (w) { reveal(w); w.style.opacity = '.2'; });
        return async function (alive) {
          await sleep(300); if (!await send(enter, alive)) return;
          if (!await query(first, 0, 1, firstAnswer, alive)) return;
          reveal(unsure);
          if (!await send(next, alive)) return;
          if (!await query(second, 1, 1, secondAnswer, alive)) return;
          if (!await send(stop, alive)) return;
          result(1);
        };
      }
      var network = svgEl('g', { transform: 'translate(158 143)', 'data-lightweight-network': '' }, gN);
      var layers = [[{ x: 6, y: 12 }, { x: 6, y: 29 }, { x: 6, y: 46 }], [{ x: 28, y: 5 }, { x: 28, y: 21 }, { x: 28, y: 37 }, { x: 28, y: 53 }], [{ x: 50, y: 18 }, { x: 50, y: 40 }]];
      layers.forEach(function (layer, index) {
        if (index) layers[index - 1].forEach(function (from) { layer.forEach(function (to) {
          svgEl('line', { x1: from.x, y1: from.y, x2: to.x, y2: to.y, stroke: '#91A7DE', 'stroke-width': 1.2 }, network);
        }); });
      });
      layers.forEach(function (layer) { layer.forEach(function (p) {
        svgEl('circle', { cx: p.x, cy: p.y, r: 3.5, fill: '#3155EB' }, network);
      }); });
      label(gN, 186, 223, 'Lightweight Network', 'comparison-source', { 'text-anchor': 'middle' });
      label(gN, 282, 154, 'P(safe)=' + pct(Q0), 'comparison-source', { 'text-anchor': 'middle', 'data-source-belief': '' });
      function adaptiveModel(x, y, i, answer) {
        var g = stage(svgEl('g', { transform: 'translate(' + x + ' ' + y + ')', 'data-model': i }, gN));
        var card = svgEl('rect', { 'class': 'cn ' + INST[i].cls, width: 120, height: 92, rx: 14 }, g);
        label(g, 60, 28, INST[i].name, 'model-name', { 'text-anchor': 'middle' });
        svgEl('text', { 'class': 'model-cost', x: 60, y: 47, 'text-anchor': 'middle' }, g).textContent = '$' + INST[i].cost.toFixed(2) + ' / call';
        var output = stage(label(g, 60, 75, answer ? 'says safe' : 'says harmful', 'model-output', { 'text-anchor': 'middle', 'data-answer': answer }));
        return { group: g, card: card, answer: output };
      }
      var modelNodes = [adaptiveModel(350, 126, 0, 0), adaptiveModel(590, 24, 1, 1), adaptiveModel(590, 228, 2, 0)];
      var promptToNetwork = wire('M108,172 H158');
      var networkToModel = wire('M216,172 H350');
      var second = wire('M470,172 H510 Q526,172 526,156 V86 Q526,70 542,70 H590');
      var third = wire('M650,116 V228');
      var exit = wire('M710,274 H752 Q768,274 768,258 V188 Q768,172 784,172 H824');
      var trace = policyTrace(lam, [0, 1, 0]);
      return async function (alive) {
        await sleep(300); if (!await send(promptToNetwork, alive)) return;
        if (!await send(networkToModel, alive)) return;
        for (var j = 0; j < trace.length; j++) {
          var step = trace[j];
          if (!await query(modelNodes[step.i], step.i, step.answer, modelNodes[step.i].answer, alive)) return;
          if (j < trace.length - 1 && !await send(trace[j + 1].i === 1 ? second : third, alive)) return;
        }
        if (!await send(exit, alive)) return;
        result(state.q >= .5 ? 1 : 0);
      };
    }
    function run(t, walk, lam) {
      lam = lam === undefined ? .2 : lam;
      var mine = ++token, alive = function () { return mine === token; };
      var play = build(t, lam);
      if (cap) cap.textContent = CAPS[t];
      fig.querySelector('[data-replay]').classList.remove('nudge');
      (async function () {
        await play(alive); if (!alive()) return;
        if (walk && t < TYPES.length - 1) {
          await sleep(1900); if (!alive()) return;
          select(t + 1); run(t + 1, true);
        } else { finished(); }
      })();
    }
    build(0);
    return function (alive, onDone) {
      finished = onDone || function () {};
      if (interacted) return Promise.resolve();
      select(0); run(0, !REDUCE);
      return Promise.resolve();
    };
  };

  /* The dynamic program displays only actions, answers, and updated beliefs. */
  figures.dp = function (fig) {
    var W = 760, s = makeSvg(fig, W, 410), selected = 1;
    var buttons = fig.querySelectorAll('[data-lambda]');
    var errOut = fig.querySelector('[data-role="err"]'), costOut = fig.querySelector('[data-role="cost"]');
    var gE = svgEl('g', {}, s), gN = svgEl('g', {}, s);
    var ANSWERS = [0, 1, 0];
    function tree(memo, key, q, depth) {
      var r = memo[key], n = { key: key, q: q, depth: depth, r: r, kids: [] };
      if (r.act === 'ask') [1, 0].forEach(function (answer) {
        var next = key.substr(0, r.i) + answer + key.substr(r.i + 1);
        var child = tree(memo, next, post(q, r.i, answer), depth + 1);
        child.answer = answer; n.kids.push(child);
      });
      return n;
    }
    function leaves(n) { return n.kids.length ? n.kids.reduce(function (sum, child) { return sum + leaves(child); }, 0) : 1; }
    function layout(n, left, right) {
      n.x = (left + right) / 2; n.y = 18 + n.depth * 102;
      var total = leaves(n), x = left;
      n.kids.forEach(function (child) {
        var width = (right - left) * leaves(child) / total;
        layout(child, x, x + width); x += width;
      });
    }
    function onPath(n) { return n.key.split('').every(function (c, i) { return c === '.' || +c === ANSWERS[i]; }); }
    function render() {
      var memo = solveDP(selected);
      buttons.forEach(function (button) { button.setAttribute('aria-pressed', +button.dataset.lambda === selected ? 'true' : 'false'); });
      var root = tree(memo, '...', Q0, 0); layout(root, 16, W - 16);
      gE.innerHTML = ''; gN.innerHTML = '';
      errOut.textContent = pct(root.r.err); costOut.textContent = '$' + root.r.cost.toFixed(2);
      (function draw(n) {
        var hot = onPath(n);
        n.kids.forEach(function (child) {
          var active = hot && onPath(child);
          svgEl('path', { 'class': 'dp-edge' + (active ? ' active' : ''), d: 'M' + n.x + ',' + (n.y + 60) + ' C' + n.x + ',' + (n.y + 82) + ' ' + child.x + ',' + (child.y - 24) + ' ' + child.x + ',' + child.y }, gE);
          label(gE, (n.x + child.x) / 2, n.y + 85, child.answer ? 'safe' : 'harmful', 'dp-answer' + (active ? ' active' : ''), { 'text-anchor': 'middle' });
          draw(child);
        });
        var cls = 'dp-node' + (hot ? ' active' : '');
        cls += n.r.act === 'ask' ? ' dp-model ' + INST[n.r.i].cls : ' dp-predict';
        var node = svgEl('g', { 'class': cls, transform: 'translate(' + (n.x - 56) + ' ' + n.y + ')', 'data-action': n.r.act, 'data-state': n.key }, gN);
        svgEl('rect', { width: 112, height: 60, rx: 12 }, node);
        if (n.r.act === 'ask') {
          label(node, 56, 25, INST[n.r.i].name, 'dp-action', { 'text-anchor': 'middle' });
          label(node, 56, 45, 'P(safe)=' + pct(n.q), 'dp-probability', { 'text-anchor': 'middle' });
        } else {
          label(node, 56, 35, 'P(safe)=' + pct(n.q), 'dp-probability', { 'text-anchor': 'middle', style: 'font-size:14px;font-weight:800' });
        }
      })(root);
    }
    buttons.forEach(function (button) { button.addEventListener('click', function () { selected = +button.dataset.lambda; render(); }); });
    render();
    return function () { render(); return Promise.resolve(); };
  };

  /* Gluing it together. Panel 1: fit the two-headed model once. Panel 2: the
     fitted model feeds the dynamic program, which emits the circuit. Step 3:
     while the circuit runs, each answer enters the history and the belief updates. */
  figures.glue = function (fig) {
    var s = makeSvg(fig, 720, 620), wires = [], neurons = [], synapses = [];
    function wire(d) { var w = svgEl('path', { 'class': 'glue-wire', d: d }, s); wires.push(w); return w; }
    function panel(y, h, title) {
      svgEl('rect', { 'class': 'glue-panel', x: 12, y: y, width: 696, height: h, rx: 18 }, s);
      label(s, 32, y + 36, title, 'glue-panel-title');
    }
    function network(cols) {
      cols.forEach(function (col, i) {
        if (i) cols[i-1][1].forEach(function (y0) { col[1].forEach(function (y1) {
          synapses.push(svgEl('line', { 'class': 'glue-synapse', x1: cols[i-1][0], y1: y0, x2: col[0], y2: y1 }, s));
        }); });
      });
      cols.forEach(function (col) { col[1].forEach(function (y) {
        neurons.push(svgEl('circle', { 'class': 'glue-neuron', cx: col[0], cy: y, r: 5 }, s));
      }); });
    }
    panel(16, 300, '1   Fit a probabilistic model');
    [[100, 'prompt z'], [196, 'history']].forEach(function (item) {
      svgEl('rect', { 'class': 'glue-equation-bg', x: 44, y: item[0], width: 126, height: 58, rx: 12 }, s);
      label(s, 107, item[0]+35, item[1], 'glue-label', { 'text-anchor': 'middle' });
    });
    network([[240,[144,178,212]],[282,[132,160,188,216]],[324,[140,230]]]);
    label(s, 282, 104, '$f_θ$', 'glue-label', { 'text-anchor': 'middle' });
    wire('M170,129 H206 Q218,129 218,141 V144 H235');
    wire('M170,225 H206 Q218,225 218,213 V212 H235');
    wire('M330,140 H400'); wire('M330,230 H400');
    var outputs = svgEl('g', { 'class': 'glue-step' }, s);
    [[110, '$η$ = $P(safe | z, history)$'], [200, '$ν_i$ = $P(i says safe)$']].forEach(function (item) {
      svgEl('rect', { 'class': 'glue-equation-bg', x: 400, y: item[0], width: 284, height: 60, rx: 12 }, outputs);
      label(outputs, 414, item[0]+37, item[1], 'glue-equation');
    });
    panel(340, 260, '2   Generate the circuit');
    network([[64,[444,472,500]],[104,[432,458,484,510]],[144,[452,492]]]);
    label(s, 104, 548, '$f_θ$', 'glue-label', { 'text-anchor': 'middle' });
    wire('M150,472 H236');
    var dp = label(s, 318, 479, 'Dynamic program', 'glue-dp', { 'text-anchor': 'middle' });
    label(s, 318, 414, '$λ$', 'glue-label', { 'text-anchor': 'middle' });
    wire('M318,424 V451'); wire('M406,472 H468');
    var tree = svgEl('g', { 'class': 'glue-step' }, s);
    svgEl('path', { 'class': 'glue-wire lit', d: 'M532,472 H554 V430 H586 M554,472 V530 H586 M650,430 H680 V452 M650,530 H680 V492' }, tree);
    [[468,452,'LLM1','var(--cost-0)'],[586,410,'LLM2','var(--cost-1)'],[586,510,'LLM3','var(--cost-2)']].forEach(function (item) {
      svgEl('rect', { x: item[0], y: item[1], width: 64, height: 40, rx: 10, style: 'fill:'+item[3] }, tree);
      label(tree, item[0]+32, item[1]+25, item[2], 'glue-circuit-name', { 'text-anchor': 'middle' });
    });
    svgEl('rect', { x: 666, y: 452, width: 28, height: 40, rx: 8, style: 'fill:var(--ink)' }, tree);
    svgEl('path', { d: 'M673,466 H687 M673,478 H683', stroke: 'white', 'stroke-width': 2, 'stroke-linecap': 'round' }, tree);
    return async function (alive) {
      wires.concat(neurons,synapses,[dp]).forEach(function (n) { rmClass(n,'lit'); });
      show(outputs,0); show(tree,0);
      await sleep(300); if (!alive()) return;
      wires.slice(0,2).forEach(function (n) { addClass(n,'lit'); });
      neurons.concat(synapses).forEach(function (n) { addClass(n,'lit'); });
      await sleep(550); if (!alive()) return;
      wires.slice(2,4).forEach(function (n) { addClass(n,'lit'); }); show(outputs,1);
      await sleep(650); if (!alive()) return;
      wires.slice(4,6).forEach(function (n) { addClass(n,'lit'); }); addClass(dp,'lit');
      await sleep(500); if (!alive()) return;
      addClass(wires[6],'lit'); show(tree,1);
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
      if (fig.dataset.fig === 'noisy') {
        var visible = false;
        var visitObserver = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            var nowVisible = entry.isIntersecting && entry.intersectionRatio >= .4;
            if (nowVisible && !visible) { visible = true; start(); }
            else if (!nowVisible && visible) { visible = false; run++; }
          });
        }, { threshold: [0, .4] });
        visitObserver.observe(fig);
        return;
      }
      var io = new IntersectionObserver(function (entries) {
        if (entries.some(function (e) { return e.isIntersecting; })) { io.disconnect(); start(); }
      }, { threshold: 0.4 });
      io.observe(fig);
    });
  }

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(mountFigures);
  else mountFigures();
})();
