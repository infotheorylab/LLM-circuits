/* The results chart: accuracy against average cost per item on five tasks.

   Every value is read from the paper's Figure 4 (data/frontier.json, made by
   scripts/extract_frontier.py), so nothing here is computed by the page. On
   arrival the single models drop in, then majority voting, then the eight
   routing and cascading methods as quiet lines, then the LMCircuit curve with
   its 95% interval bars. Three markers on the curve (low, medium, high
   budget) say how many calls the circuit makes there and to which models,
   read from the calls-per-model panel of the same figure.

   Colours follow the page: green / blue / red diamonds are cheap / mid /
   expensive models (the paper's own shading groups them the same way), amber
   is what the circuit does, grey is everything else. */
(function () {
  'use strict';
  var h = LC.h, svgEl = h.svgEl, label = h.label;

  var TASKS = [
    { key: 'beavertails', tab: 'Safety', name: 'BeaverTails', ask: 'Is a model response unsafe?' },
    { key: 'politicause', tab: 'Political science', name: 'PolitiCAUSE', ask: 'Does a sentence state a causal relation?' },
    { key: 'arena', tab: 'Human preference', name: 'Arena', ask: 'Which of two responses do people prefer?' },
    { key: 'healthbench', tab: 'Health', name: 'HealthBench', ask: 'Does a response meet a criterion written by physicians?' },
    { key: 'decision_index', tab: 'Decision models', name: 'Decision Index', ask: 'Six decision tasks, answered by decision models.' }
  ];
  // the eight baselines, in the order of the Baselines sheet
  var BASELINES = ['RouteLLM', 'HybridLLM', 'CARROT', 'Cascade Routing', 'Consistency Cascade',
    'Cascaded Selective', 'FrugalGPT', 'Adaptive-Consistency'];
  var X_MIN = 0.003, X_MAX = 4.086;          // the paper's axis limits
  var LOW = 0.01, MID = 0.1;                 // the high budget is the curve's last interval bar
  var BAND_MIN_PLOT = 760;                   // below this plot width the notes go under the chart

  var current = 'beavertails';               // survives a rebuild at the breakpoint
  var asked = (location.search.match(/[?&]frontier=([a-z_]+)/) || [])[1];
  if (asked && TASKS.some(function (t) { return t.key === asked; })) current = asked;
  var seq = 0;                               // every draw takes a number; older ones stop
  var DATA = null;
  function load() {
    if (!DATA) DATA = fetch('./data/frontier.json').then(function (r) {
      if (!r.ok) throw new Error('frontier.json: ' + r.status);
      return r.json();
    });
    return DATA;
  }
  function meta(key) { return TASKS.filter(function (t) { return t.key === key; })[0]; }

  /* ------------------------------------------------------------ numbers */

  function log10(x) { return Math.log(x) / Math.LN10; }
  function sig2(c) { return String(+c.toPrecision(2)); }
  function fmtAcc(a) { return a.toFixed(1) + '%'; }
  function fmtCalls(n) { return n < 1 ? n.toFixed(2) : n.toFixed(1); }

  // the paper shades its judges green, blue and red from cheap to expensive
  function tierOf(hex) {
    var r = parseInt(hex.substr(1, 2), 16), g = parseInt(hex.substr(3, 2), 16), b = parseInt(hex.substr(5, 2), 16);
    return g > r && g >= b ? 0 : b > r ? 1 : 2;
  }

  // accuracy on the drawn curve at cost X (matplotlib joins vertices straight in log x)
  function curveAt(pts, X) {
    if (X <= pts[0].cost) return pts[0].acc;
    for (var i = 1; i < pts.length; i++) {
      if (pts[i].cost >= X) {
        var a = pts[i - 1], b = pts[i], span = log10(b.cost) - log10(a.cost);
        var f = span > 0 ? (log10(X) - log10(a.cost)) / span : 0;
        return a.acc + f * (b.acc - a.acc);
      }
    }
    return pts[pts.length - 1].acc;
  }

  // calls per item to each model at the grid point nearest to cost X
  function callsAt(T, X) {
    var c = T.calls, best = 0;
    for (var i = 1; i < c.x.length; i++) {
      if (Math.abs(log10(c.x[i]) - log10(X)) < Math.abs(log10(c.x[best]) - log10(X))) best = i;
    }
    var per = c.models.map(function (m) {
      return { name: m, n: Math.max(0, c.bands[m].hi[best] - c.bands[m].lo[best]) };
    });
    var total = per.reduce(function (s, p) { return s + p.n; }, 0);
    per.sort(function (a, b) { return b.n - a.n; });
    return { total: total, per: per };
  }

  // "almost all to Gemma 4B", "mostly to A and B", "spread over 6 models"
  function mixText(c) {
    var p = c.per, t = c.total;
    function nm(q) { return q.name.replace(/ /g, '\u00a0'); }
    if (t < 0.005) return 'no model calls';
    var s1 = p[0].n / t, s2 = p[1] ? p[1].n / t : 0;
    if (s1 >= 0.9) return 'almost all to ' + nm(p[0]);
    if (s1 >= 0.6) return 'mostly to ' + nm(p[0]);
    if (s1 + s2 >= 0.65) return 'mostly to ' + nm(p[0]) + ' and ' + nm(p[1]);
    return 'spread over ' + p.filter(function (q) { return q.n / t >= 0.05; }).length + ' models';
  }

  function budgets(T) {
    var lm = T.lmcircuit, bars = lm.filter(function (p) { return p.lo !== null; });
    return [
      { name: 'Low budget', letter: 'A', cost: LOW },
      { name: 'Medium budget', letter: 'B', cost: MID },
      { name: 'High budget', letter: 'C', cost: bars[bars.length - 1].cost }
    ].map(function (b) {
      b.acc = curveAt(lm, b.cost);
      b.calls = callsAt(T, b.cost);
      b.value = fmtCalls(b.calls.total) + ' calls per item';
      b.mix = mixText(b.calls);
      return b;
    });
  }

  // y domain: everything drawn, with a little air; ticks on a round step
  function domain(T) {
    var v = [];
    function add(p) { v.push(p.acc); if (p.lo !== null && p.lo !== undefined) v.push(p.lo, p.hi); }
    T.models.forEach(add); T.other_judges.forEach(function (p) { v.push(p.acc); });
    add(T.majority); T.lmcircuit.forEach(add);
    BASELINES.forEach(function (b) { (T.baselines[b] || []).forEach(add); });
    var lo = Math.min.apply(null, v), hi = Math.max.apply(null, v), pad = Math.max(0.3, (hi - lo) * 0.05);
    lo -= pad; hi += pad;
    var step = [1, 2, 5, 10, 20].filter(function (s) { return (hi - lo) / s <= 7; })[0] || 20;
    var ticks = [];
    for (var t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) ticks.push(t);
    return { lo: lo, hi: hi, ticks: ticks };
  }

  /* LC.h.wrap, but breaking only at plain spaces, so a name joined with
     no-break spaces stays on one line. Returns the number of lines. */
  function wrapWords(t, str, width, lineHeight) {
    var x = t.getAttribute('x'), words = String(str).split(/ +/), line = [], n = 0;
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

  /* ------------------------------------------------------------ geometry */

  // does the segment a-b cross the rectangle r? (Liang-Barsky clipping)
  function segHits(ax, ay, bx, by, r) {
    var dx = bx - ax, dy = by - ay, t0 = 0, t1 = 1;
    var p = [-dx, dx, -dy, dy], q = [ax - r.x, r.x + r.w - ax, ay - r.y, r.y + r.h - ay];
    for (var i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] < 0) return false; continue; }
      var t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
    return true;
  }
  function overlap(a, b, pad) {
    return a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
  }

  /* Labels go where they touch nothing: no other text, mark, line or grid
     line, and stay inside the plot. A label that finds no such place is left
     to the tooltip. */
  function placer(bounds) {
    var rects = [], segs = [];
    return {
      rect: function (r) { rects.push(r); },
      seg: function (ax, ay, bx, by) { segs.push([ax, ay, bx, by]); },
      poly: function (pts) { for (var i = 1; i < pts.length; i++) segs.push([pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]]); },
      clear: function (ax, ay, bx, by, skip) {
        for (var i = 0; i < rects.length; i++) if (rects[i] !== skip && segHits(ax, ay, bx, by, rects[i])) return false;
        return true;
      },
      fits: function (r, skip) {
        if (r.x < bounds.x0 + 2 || r.x + r.w > bounds.x1 - 2 || r.y < bounds.y0 + 2 || r.y + r.h > bounds.y1 - 2) return false;
        for (var i = 0; i < rects.length; i++) if (rects[i] !== skip && overlap(r, rects[i], 2)) return false;
        // lines are tested against the glyphs' middle, where they would cross the letters
        var core = { x: r.x - 1, y: r.y + r.h * 0.18, w: r.w + 2, h: r.h * 0.64 };
        for (var j = 0; j < segs.length; j++) if (segHits(segs[j][0], segs[j][1], segs[j][2], segs[j][3], core)) return false;
        return true;
      }
    };
  }

  /* ------------------------------------------------------------ shapes */

  function diamond(s) { return 'M0,' + -s + 'L' + s + ',0L0,' + s + 'L' + -s + ',0Z'; }
  function star(R, r) {
    var d = '';
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r : R;
      d += (i ? 'L' : 'M') + (rr * Math.cos(a)).toFixed(2) + ',' + (rr * Math.sin(a)).toFixed(2);
    }
    return d + 'Z';
  }
  function linePath(pts) {
    return pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join('');
  }
  // a vertical interval bar with short caps
  function ciBar(parent, x, ylo, yhi, cls, cap) {
    var g = svgEl('g', { 'class': cls }, parent);
    svgEl('line', { x1: x, y1: ylo, x2: x, y2: yhi }, g);
    svgEl('line', { x1: x - cap, y1: yhi, x2: x + cap, y2: yhi }, g);
    svgEl('line', { x1: x - cap, y1: ylo, x2: x + cap, y2: ylo }, g);
    return g;
  }

  /* ------------------------------------------------------------ the frame */

  function frame(W, narrow) {
    if (narrow) {
      var ph = Math.round(Math.max(240, Math.min(300, W * 0.8)));
      var L = { W: W, narrow: true, x0: 34, x1: W - 12, y0: 30, fs: 13 };
      L.y1 = L.y0 + ph;
      L.xticks = [0.01, 0.1, 1];
      L.rowsTop = L.y1 + 84;
      return L;
    }
    var M = { W: W, narrow: false, x0: 60, x1: W - 22, fs: 14 };
    M.band = M.x1 - M.x0 >= BAND_MIN_PLOT;
    M.y0 = M.band ? 98 : 14;
    M.y1 = M.y0 + Math.round(Math.max(300, Math.min(370, W * 0.36)));
    M.xticks = [0.003, 0.01, 0.03, 0.1, 0.3, 1, 3];
    M.rowsTop = M.y1 + 82;
    return M;
  }

  /* ------------------------------------------------------------ controls */

  function controls(fig, onSelect) {
    var old = fig.querySelector('.fx-ui');
    if (old) old.remove();
    var box = document.createElement('div');
    box.className = 'fx-ui';
    var head = fig.querySelector('.fig-head');
    head.parentNode.insertBefore(box, head.nextSibling);

    var tabs = document.createElement('div');
    tabs.className = 'fx-tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Task');
    var buttons = TASKS.map(function (t) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.dataset.task = t.key;
      b.textContent = t.tab;
      b.addEventListener('click', function () { onSelect(t.key); });
      tabs.appendChild(b);
      return b;
    });
    // arrow keys move along the tabs, as in any tab list
    tabs.addEventListener('keydown', function (e) {
      var i = buttons.indexOf(document.activeElement);
      if (i < 0 || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
      var j = (i + (e.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length;
      buttons[j].focus(); onSelect(TASKS[j].key); e.preventDefault();
    });
    box.appendChild(tabs);

    var sub = document.createElement('p');
    sub.className = 'fx-sub';
    var subName = document.createElement('b'), subAsk = document.createElement('span');
    sub.appendChild(subName); sub.appendChild(subAsk);
    box.appendChild(sub);

    var leg = document.createElement('div');
    leg.className = 'fx-legend';
    function item(s, keySvg, text) {
      var li = document.createElement('span');
      li.className = 'fx-li';
      li.dataset.s = s;
      li.innerHTML = keySvg;                 // fixed markup written here, no data in it
      var t = document.createElement('span');
      t.textContent = text;
      li.appendChild(t);
      leg.appendChild(li);
      return li;
    }
    var items = {
      lm: item('lm', '<svg class="fx-key" viewBox="0 0 28 16" aria-hidden="true"><line class="k-lm" x1="2" y1="9" x2="26" y2="9"/><line class="k-ci" x1="14" y1="3" x2="14" y2="15"/></svg>', 'LMCircuit'),
      maj: item('maj', '<svg class="fx-key" viewBox="0 0 16 16" aria-hidden="true"><path class="k-maj" transform="translate(8,8.6)" d="' + star(7, 3) + '"/></svg>', 'Majority voting'),
      mod: item('mod', '<svg class="fx-key" viewBox="0 0 40 16" aria-hidden="true"><path class="k-t0" d="M7,3L12,8L7,13L2,8Z"/><path class="k-t1" d="M20,3L25,8L20,13L15,8Z"/><path class="k-t2" d="M33,3L38,8L33,13L28,8Z"/></svg>', 'Single models, cheap to expensive'),
      bl: item('bl', '<svg class="fx-key" viewBox="0 0 28 16" aria-hidden="true"><line class="k-bl" x1="2" y1="9" x2="26" y2="9"/></svg>',
        'Eight routing and cascading methods')
    };
    box.appendChild(leg);

    return {
      set: function (key) {
        buttons.forEach(function (b) {
          var on = b.dataset.task === key;
          b.setAttribute('aria-selected', on ? 'true' : 'false');
          b.tabIndex = on ? 0 : -1;
        });
        var m = meta(key);
        subName.textContent = m.name;
        subAsk.textContent = m.ask;
      },
      legend: function (which, on) {
        (which === 'all' ? Object.keys(items) : [which]).forEach(function (k) { items[k].classList.toggle('fx-wait', !on); });
      }
    };
  }

  /* ------------------------------------------------------------ the figure */

  LC.figure('frontier', function (fig, ctx) {
    h.head(fig, 'Accuracy and cost on five tasks');
    var ui = controls(fig, select);
    ui.set(current);
    var cs = getComputedStyle(fig);
    var W = Math.round((fig.clientWidth || 900) - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
    var L = frame(W, ctx.narrow);
    var svg = h.makeSvg(fig, W, L.rowsTop);
    // the marks carry their own labels for screen readers, so the chart is not hidden
    svg.removeAttribute('aria-hidden');
    svg.setAttribute('role', 'group');
    var host = svg.parentNode;
    var tip = document.createElement('div');
    tip.className = 'fx-tip';
    tip.setAttribute('aria-hidden', 'true');
    host.appendChild(tip);
    var root = svgEl('g', {}, svg);
    var state = null;                        // what is drawn now, for hover and highlight
    var drawn = false;
    var rowsMax = null;
    // on a touch screen a tooltip stays until the next tap outside the marks
    if (!fig._fxDown) {
      fig._fxDown = true;
      fig.addEventListener('pointerdown', function (e) {
        if (fig._fxOff && !(e.target.closest && e.target.closest('.fx-hits'))) fig._fxOff();
      });
    }
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + (L.band && !L.narrow ? L.y1 + 62 : L.rowsTop + 3 * 70 - 6));

    // the tallest set of note rows over the five tasks, so a tab switch never moves the page
    function rowsHeight(D) {
      if (rowsMax !== null) return rowsMax;
      var probe = label(svg, 36, -100, '', 'n-m');
      var most = 0;
      TASKS.forEach(function (t) {
        var y = 0;
        budgets(D.tasks[t.key]).forEach(function (b) { y += 14 + 19 * wrapWords(probe, b.value + ', ' + b.mix, W - 38, 19) + 18; });
        most = Math.max(most, y);
      });
      probe.remove();
      rowsMax = L.rowsTop + most - 6;
      return rowsMax;
    }

    /* -------------------------------------------------- tooltip */

    function showTip(x, y, rows) {
      tip.textContent = '';
      rows.forEach(function (r) {
        var d = document.createElement('div');
        d.className = r[0];
        d.textContent = r[1];
        tip.appendChild(d);
      });
      tip.classList.add('on');
      var k = svg.getBoundingClientRect().width / W;
      var tw = tip.offsetWidth, th = tip.offsetHeight, hw = host.clientWidth;
      var left = Math.max(0, Math.min(hw - tw, x * k - tw / 2));
      var top = y * k - th - 14;
      if (top < 0) top = y * k + 16;
      tip.style.left = left + 'px';
      tip.style.top = top + 'px';
    }
    function hideTip() { tip.classList.remove('on'); }

    function highlight(name) {
      if (!state) return;
      state.blines.forEach(function (b) { b.g.classList.toggle('hl', b.name === name); });
      svg.classList.toggle('fx-dim', !!name);
    }

    /* -------------------------------------------------- tab switch */

    function select(key) {
      if (key === current && drawn) return;
      current = key;
      ui.set(key);
      hideTip();
      var mine = ++seq;
      draw(key, 'switch', function () { return mine === seq && svg.isConnected; }).catch(fail);
    }

    function fail(e) {
      console.error('[fig:frontier]', e);
      host.querySelectorAll('.fx-err').forEach(function (n) { n.remove(); });
      var p = document.createElement('p');
      p.className = 'fx-err';
      p.textContent = 'The chart could not load its data. The paper’s figure is in the PDF below.';
      host.appendChild(p);
    }

    /* -------------------------------------------------- one task */

    async function draw(key, mode, live) {
      var D = await load();
      if (!live()) return;
      var T = D.tasks[key];
      var B = budgets(T);
      var dom = domain(T);
      var lx0 = log10(X_MIN), lx1 = log10(X_MAX);
      function sx(c) { return L.x0 + (log10(Math.max(c, X_MIN)) - lx0) / (lx1 - lx0) * (L.x1 - L.x0); }
      function sy(a) { return L.y1 - (a - dom.lo) / (dom.hi - dom.lo) * (L.y1 - L.y0); }
      var anim = !ctx.reduce;

      if (mode === 'switch' && drawn && anim) {
        await h.tween(160, function (t) { root.style.opacity = 1 - t; });
        if (!live()) return;
      }
      root.innerHTML = '';
      root.style.opacity = 1;
      svg.classList.remove('fx-dim', 'fx-ready');
      hideTip();
      svg.setAttribute('aria-label', meta(key).name + ': accuracy against average cost per item');

      var P = placer(L);
      var layers = {};
      ['axes', 'base', 'refs', 'lm', 'marks', 'notes', 'labels', 'hits'].forEach(function (n) {
        layers[n] = svgEl('g', { 'class': 'fx-' + n }, root);
      });
      layers.hits.classList.add('qa-ignore');

      /* axes and grid */
      var ax = layers.axes;
      dom.ticks.forEach(function (t) {
        var y = sy(t);
        if (L.y1 - y < 16) return;
        svgEl('line', { 'class': 'fx-grid', x1: L.x0, y1: y, x2: L.x1, y2: y }, ax);
        label(ax, L.x0 - 9, y + L.fs * 0.35, String(t), 'fx-tick', { 'text-anchor': 'end' });
        P.seg(L.x0, y, L.x1, y);
      });
      svgEl('line', { 'class': 'fx-axis', x1: L.x0, y1: L.y1, x2: L.x1, y2: L.y1 }, ax);
      L.xticks.forEach(function (c) {
        var x = sx(c);
        svgEl('line', { 'class': 'fx-axis', x1: x, y1: L.y1, x2: x, y2: L.y1 + 5 }, ax);
        label(ax, x, L.y1 + 21, String(c), 'fx-tick', { 'text-anchor': 'middle' });
      });
      if (L.narrow) {
        label(ax, 0, 16, 'Accuracy (%)', 'fx-axt');
        var xt = label(ax, (L.x0 + L.x1) / 2, L.y1 + 44, '', 'fx-axt', { 'text-anchor': 'middle' });
        h.wrap(xt, 'Average cost per item (relative to the priciest model)', L.x1 - L.x0, 18);
      } else {
        label(ax, (L.x0 + L.x1) / 2, L.y1 + 48, 'Average cost per item (relative to the priciest model)', 'fx-axt', { 'text-anchor': 'middle' });
        label(ax, 0, 0, 'Accuracy (%)', 'fx-axt', { 'text-anchor': 'middle', transform: 'translate(16,' + ((L.y0 + L.y1) / 2) + ') rotate(-90)' });
      }

      /* routing and cascading methods: thin grey lines */
      var blines = [];
      BASELINES.forEach(function (name) {
        var pts = T.baselines[name];
        if (!pts || !pts.length) return;
        var xy = pts.map(function (p) { return [sx(p.cost), sy(p.acc)]; });
        var g = svgEl('g', { 'class': 'fx-bl' }, layers.base);
        var ext = Math.abs(xy[xy.length - 1][0] - xy[0][0]) + Math.abs(xy[xy.length - 1][1] - xy[0][1]);
        if (xy.length > 1 && ext > 3) { svgEl('path', { d: linePath(xy) }, g); P.poly(xy); }
        else {
          // a method that reaches a single operating point is drawn as one small ring
          svgEl('circle', { 'class': 'fx-bl-pt', cx: xy[0][0], cy: xy[0][1], r: 3.5 }, g);
          P.rect({ x: xy[0][0] - 5, y: xy[0][1] - 5, w: 10, h: 10 });
        }
        var bars = svgEl('g', { 'class': 'fx-bl-bars' }, g);
        pts.forEach(function (p, i) { if (p.lo !== null) ciBar(bars, xy[i][0], sy(p.lo), sy(p.hi), 'fx-bl-ci', 3); });
        blines.push({ name: name, g: g, pts: pts, xy: xy });
      });

      /* other leaderboard models (Decision Index): small grey diamonds, as in the paper */
      var others = T.other_judges.map(function (p) {
        var x = sx(p.cost), y = sy(p.acc);
        var g = svgEl('g', { 'class': 'fx-other', transform: 'translate(' + x + ',' + y + ')' }, layers.refs);
        svgEl('path', { d: diamond(4) }, g);
        P.rect({ x: x - 5, y: y - 5, w: 10, h: 10 });
        return { g: g, x: x, y: y, p: p };
      });

      /* majority voting */
      var mj = T.majority, mjx = sx(mj.cost), mjy = sy(mj.acc);
      var mjg = svgEl('g', { 'class': 'fx-maj' }, layers.refs);
      ciBar(mjg, mjx, sy(mj.lo), sy(mj.hi), 'fx-maj-ci', 3.5);
      svgEl('path', { d: star(9, 3.8), transform: 'translate(' + mjx + ',' + mjy + ')' }, mjg);
      P.seg(mjx, sy(mj.lo), mjx, sy(mj.hi));
      var mjRect = { x: mjx - 10, y: mjy - 10, w: 20, h: 20 };
      P.rect(mjRect);

      /* single models, cheapest first */
      var models = T.models.slice().sort(function (a, b) { return a.cost - b.cost; }).map(function (m) {
        var x = sx(m.cost), y = sy(m.acc);
        var g = svgEl('g', { 'class': 'fx-mod t' + tierOf(m.color), transform: 'translate(' + x + ',' + y + ')' }, layers.marks);
        svgEl('path', { d: diamond(L.narrow ? 6 : 6.5) }, g);
        var r = { x: x - 8, y: y - 8, w: 16, h: 16 };
        P.rect(r);
        return { m: m, g: g, x: x, y: y, rect: r, lbl: null };
      });

      /* LMCircuit: the curve and its interval bars */
      var lm = T.lmcircuit, lmxy = lm.map(function (p) { return [sx(p.cost), sy(p.acc)]; });
      var cum = [0];
      for (var i = 1; i < lmxy.length; i++) cum.push(cum[i - 1] + Math.hypot(lmxy[i][0] - lmxy[i - 1][0], lmxy[i][1] - lmxy[i - 1][1]));
      var lmLen = cum[cum.length - 1];
      var lmBars = [];
      lm.forEach(function (p, k) {
        if (p.lo === null) return;
        var g = ciBar(layers.lm, lmxy[k][0], sy(p.lo), sy(p.hi), 'fx-ci', 4);
        lmBars.push({ g: g, at: cum[k] / lmLen });
        P.seg(lmxy[k][0], sy(p.lo), lmxy[k][0], sy(p.hi));
        P.seg(lmxy[k][0] - 4, sy(p.hi), lmxy[k][0] + 4, sy(p.hi));
      });
      var lmPath = svgEl('path', { 'class': 'fx-lm', d: linePath(lmxy) }, layers.lm);
      P.poly(lmxy);

      /* the three budgets: a marker on the curve and a short note */
      var lettered = L.narrow || !L.band;
      var marks = B.map(function (b) {
        var x = sx(b.cost), y = sy(b.acc);
        var g = svgEl('g', { 'class': 'fx-mk', transform: 'translate(' + x + ',' + y + ')' }, layers.notes);
        svgEl('circle', { r: 6 }, g);
        var r = { x: x - 9, y: y - 9, w: 18, h: 18 };
        P.rect(r);
        return { b: b, g: g, x: x, y: y, rect: r, note: null, leader: null, letter: null };
      });
      var H = lettered ? notesRows(marks) : notesBand(marks);
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

      /* direct labels, most important first */
      function curveY(x) {
        if (x <= lmxy[0][0]) return lmxy[0][1];
        for (var k = 1; k < lmxy.length; k++) {
          if (lmxy[k][0] >= x) {
            var a = lmxy[k - 1], b = lmxy[k], f = b[0] > a[0] ? (x - a[0]) / (b[0] - a[0]) : 0;
            return a[1] + f * (b[1] - a[1]);
          }
        }
        return null;                         // past the end of the curve
      }
      function underCurve(r) {
        return [r.x, r.x + r.w].every(function (x) { var cy = curveY(x); return cy === null || r.y > cy + 6; });
      }
      function place(text, cls, px, py, m, cands, skip, far) {
        var t = label(layers.labels, 0, 0, text, 'fx-lbl ' + cls);
        var ok = cls === 'mod' ? function (r) { return P.fits(r, skip) && underCurve(r); } : function (r) { return P.fits(r, skip); };
        var bb = t.getBBox(), w = bb.width, hh = bb.height;
        function spots(m) {
          return {
            r: [px + m + 5, py - hh / 2], l: [px - m - 5 - w, py - hh / 2],
            a: [px - w / 2, py - m - 3 - hh], b: [px - w / 2, py + m + 3],
            ar: [px + m - 1, py - m - hh + 3], br: [px + m - 1, py + m - 3],
            al: [px - m + 1 - w, py - m - hh + 3], bl: [px - m + 1 - w, py + m - 3]
          };
        }
        function put(c) {
          t.setAttribute('x', (c[0] - bb.x).toFixed(1));
          t.setAttribute('y', (c[1] - bb.y).toFixed(1));
          var r = { x: c[0], y: c[1], w: w, h: hh };
          P.rect(r);
          return r;
        }
        var near = spots(m);
        for (var k = 0; far !== 'only' && k < cands.length; k++) {
          var c = near[cands[k]];
          if (ok({ x: c[0], y: c[1], w: w, h: hh })) { put(c); return { t: t }; }
        }
        // a model the notes name gets a label a little further out, joined by a short line
        for (var d = 1; far && d <= 4; d++) {
          var out = spots(m + 12 * d);
          for (var j = 0; j < cands.length; j++) {
            var e = out[cands[j]], r = { x: e[0], y: e[1], w: w, h: hh };
            var qx = Math.max(r.x, Math.min(r.x + w, px)), qy = Math.max(r.y + 3, Math.min(r.y + hh - 3, py));
            var len = Math.hypot(qx - px, qy - py), ux = (qx - px) / len, uy = (qy - py) / len;
            var a = [px + ux * (m + 3), py + uy * (m + 3)], b = [qx - ux * 3, qy - uy * 3];
            if (!ok(r) || !P.clear(a[0], a[1], b[0], b[1], skip)) continue;
            put(e);
            var ln = svgEl('line', { 'class': 'fx-tie', x1: a[0].toFixed(1), y1: a[1].toFixed(1), x2: b[0].toFixed(1), y2: b[1].toFixed(1) }, layers.labels);
            P.seg(a[0], a[1], b[0], b[1]);
            return { t: t, tie: ln };
          }
        }
        t.remove();
        return null;
      }
      var end = lmxy[lmxy.length - 1];
      var lmLbl = (place('LMCircuit', 'lm', end[0], end[1], 4, ['r', 'br', 'b', 'a']) || {}).t;
      // with the notes under the chart, a letter beside each marker names its row
      if (lettered) marks.forEach(function (o) {
        o.letter = (place(o.b.letter, 'letter', o.x, o.y, 6, ['a', 'al', 'ar', 'l', 'r', 'b', 'bl', 'br'], o.rect) || {}).t;
      });
      var mjLbl = (place('Majority voting', 'maj', mjx, mjy, 9, ['b', 'a', 'l', 'bl', 'al', 'r'], mjRect) || {}).t;
      // models the notes name come first, then the rest from the most accurate down
      var named = B.map(function (b) { return b.mix; }).join(' ').replace(/\u00a0/g, ' ');
      var order = models.slice().sort(function (a, b) {
        var na = named.indexOf(a.m.name) >= 0, nb = named.indexOf(b.m.name) >= 0;
        return na !== nb ? (na ? -1 : 1) : b.m.acc - a.m.acc;
      });
      var CANDS = ['r', 'l', 'b', 'a', 'br', 'ar', 'bl', 'al'];
      order.forEach(function (o) {
        var got = place(o.m.name, 'mod', o.x, o.y, 7, CANDS, o.rect);
        o.lbl = got && got.t;
      });
      order.forEach(function (o) {
        if (o.lbl || named.indexOf(o.m.name) < 0) return;
        var got = place(o.m.name, 'mod', o.x, o.y, 7, CANDS, o.rect, 'only');
        o.lbl = got && got.t; o.tie = got && got.tie;
      });

      /* notes above the plot, each hung from a thin line down to its marker */
      function notesBand(list) {
        var top = 8, prevRight = -Infinity;
        list.forEach(function (o, k) {
          var g = svgEl('g', { 'class': 'fx-note' }, layers.notes);
          var nextX = k < list.length - 1 ? sx(list[k + 1].b.cost) : W + 30;
          var tx = o.x + 9, ww = Math.min(220, nextX - tx - 22, W - tx - 2), anchor = 'start';
          if (ww < 150) { tx = o.x - 9; ww = Math.min(220, tx - prevRight - 22); anchor = 'end'; }
          var a = { 'text-anchor': anchor };
          label(g, tx, top + 14, o.b.name, 'n-h', a);
          label(g, tx, top + 35, o.b.value, 'n-v', a);
          var mt = label(g, tx, top + 55, '', 'n-m', a);
          wrapWords(mt, o.b.mix, ww, 19);
          var bb = g.getBBox();
          prevRight = bb.x + bb.width;
          o.note = g;
          o.leader = svgEl('line', { 'class': 'fx-leader', x1: o.x, y1: top + 2, x2: o.x, y2: o.y - 8 }, layers.notes);
          layers.notes.insertBefore(o.leader, layers.notes.firstChild);
          P.seg(o.x, L.y0, o.x, o.y - 8);
        });
        return L.y1 + 62;
      }
      /* or as lettered rows under the chart */
      function notesRows(list) {
        var y = L.rowsTop, x = 36;
        list.forEach(function (o) {
          var g = svgEl('g', { 'class': 'fx-note rows' }, layers.notes);
          var disc = svgEl('g', { 'class': 'fx-mk', transform: 'translate(6,' + (y + 9) + ')' }, g);
          svgEl('circle', { r: 6 }, disc);
          label(g, 16, y + 14, o.b.letter, 'fx-lbl letter');
          label(g, x, y + 14, o.b.name, 'n-h');
          var mt = label(g, x, y + 33, '', 'n-m');
          var n = wrapWords(mt, o.b.value + ', ' + o.b.mix, W - x - 2, 19);
          o.note = g;
          y += 14 + 19 * n + 18;
        });
        return Math.max(y - 6, rowsHeight(D));
      }

      /* hover and focus */
      function focusable(g, aria, onShow) {
        g.setAttribute('tabindex', '0');
        g.setAttribute('aria-label', aria);
        g.addEventListener('pointerenter', onShow);
        g.addEventListener('focus', onShow);
        g.addEventListener('click', function (e) { onShow(); e.stopPropagation(); });
        g.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') off(); });
        g.addEventListener('blur', off);
      }
      var lit = null;
      function on(node) { if (lit) lit.classList.remove('on'); lit = node; if (node) node.classList.add('on'); }
      function off() { on(null); hideTip(); highlight(null); }

      var hit = layers.hits;
      // the plot finds the nearest line: LMCircuit or one of the methods
      var area = svgEl('rect', { 'class': 'fx-area', x: L.x0, y: L.y0, width: L.x1 - L.x0, height: L.y1 - L.y0 }, hit);
      function nearestLine(px, py) {
        var best = null;
        function test(name, xy, pts) {
          for (var k = 0; k < xy.length; k++) {
            var d = Math.hypot(xy[k][0] - px, xy[k][1] - py);
            if (!best || d < best.d) best = { d: d, name: name, p: pts[k], x: xy[k][0], y: xy[k][1] };
          }
        }
        test('LMCircuit', lmxy, lm);
        blines.forEach(function (b) { test(b.name, b.xy, b.pts); });
        return best && best.d <= 16 ? best : null;
      }
      function lineTip(e) {
        var pt = svg.createSVGPoint();
        pt.x = e.clientX; pt.y = e.clientY;
        pt = pt.matrixTransform(svg.getScreenCTM().inverse());
        var n = nearestLine(pt.x, pt.y);
        if (!n) { off(); return; }
        on(null);
        highlight(n.name === 'LMCircuit' ? null : n.name);
        var rows = [['k', n.name], ['v', fmtAcc(n.p.acc) + ' accuracy'], ['d', 'cost ' + sig2(n.p.cost) + ' per item']];
        if (n.name === 'LMCircuit') rows.push(['d', fmtCalls(callsAt(T, n.p.cost).total) + ' calls per item']);
        if (n.p.lo !== null) rows.push(['d', '95% interval ' + n.p.lo.toFixed(1) + ' to ' + n.p.hi.toFixed(1)]);
        showTip(n.x, n.y, rows);
      }
      area.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') lineTip(e); });
      area.addEventListener('click', lineTip);
      area.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') off(); });

      others.forEach(function (o) {
        var c = svgEl('circle', { cx: o.x, cy: o.y, r: 11 }, hit);
        focusable(c, 'Leaderboard model outside the pool: ' + fmtAcc(o.p.acc) + ' accuracy, cost ' + sig2(o.p.cost), function () {
          on(o.g); showTip(o.x, o.y, [['k', 'Leaderboard model outside the pool'], ['v', fmtAcc(o.p.acc) + ' accuracy'], ['d', 'cost ' + sig2(o.p.cost) + ' per item']]);
        });
      });
      models.forEach(function (o) {
        var c = svgEl('circle', { cx: o.x, cy: o.y, r: 13 }, hit);
        focusable(c, o.m.name + ': ' + fmtAcc(o.m.acc) + ' accuracy, cost ' + sig2(o.m.cost), function () {
          on(o.g); showTip(o.x, o.y, [['k', o.m.name], ['v', fmtAcc(o.m.acc) + ' accuracy'], ['d', 'cost ' + sig2(o.m.cost) + ' per item']]);
        });
      });
      var mc = svgEl('circle', { cx: mjx, cy: mjy, r: 14 }, hit);
      var mjRows = [['k', 'Majority voting'], ['v', fmtAcc(mj.acc) + ' accuracy'],
        ['d', '95% interval ' + mj.lo.toFixed(1) + ' to ' + mj.hi.toFixed(1)], ['d', 'cost ' + sig2(mj.cost) + ' per item']];
      focusable(mc, 'Majority voting: ' + fmtAcc(mj.acc) + ' accuracy, cost ' + sig2(mj.cost), function () {
        on(mjg); showTip(mjx, mjy, mjRows);
      });
      marks.forEach(function (o) {
        var c = svgEl('circle', { cx: o.x, cy: o.y, r: 14 }, hit);
        var top3 = o.b.calls.per.slice(0, 3).filter(function (p) { return p.n >= 0.005; });
        var rows = [['k', 'LMCircuit, ' + o.b.name.toLowerCase()], ['v', fmtAcc(o.b.acc) + ' accuracy'],
          ['d', 'cost ' + sig2(o.b.cost) + ' per item'], ['d', o.b.value]];
        top3.forEach(function (p) { rows.push(['d', p.name + ': ' + fmtCalls(p.n) + ' calls']); });
        focusable(c, 'LMCircuit at a ' + o.b.name.toLowerCase() + ': ' + fmtAcc(o.b.acc) + ' accuracy, ' + o.b.value + ', ' + o.b.mix, function () {
          on(o.g); showTip(o.x, o.y, rows);
        });
      });

      state = { blines: blines };
      fig._fxOff = off;
      drawn = true;

      /* -------------------------------------------------- reveal */

      var lblOf = function (o) { return o.lbl; };
      var tieOf = function (o) { return o.tie; };
      function fade(nodes, ms) {
        nodes = nodes.filter(Boolean);
        nodes.forEach(function (n) { n.style.opacity = 0; });
        return h.tween(ms, function (t) { nodes.forEach(function (n) { n.style.opacity = t; }); });
      }
      function hideAll(nodes) { nodes.filter(Boolean).forEach(function (n) { n.style.opacity = 0; }); }
      var lmLabelNodes = [lmLbl];
      var markNodes = [];
      marks.forEach(function (o) { markNodes.push(o.g, o.note, o.leader, o.letter); });

      if (!anim) {
        ui.legend('all', true);
        svg.classList.add('fx-ready');
        return;
      }

      // everything that appears later starts hidden
      lmPath.style.strokeDasharray = lmLen + ' ' + lmLen;
      lmPath.style.strokeDashoffset = lmLen;
      lmPath.style.opacity = 0;
      hideAll(lmBars.map(function (b) { return b.g; }).concat(lmLabelNodes, markNodes));
      function drawCurve(ms) {
        lmPath.style.opacity = 1;
        return h.tween(ms, function (t) {
          lmPath.style.strokeDashoffset = lmLen * (1 - t);
          lmBars.forEach(function (b) { if (!b.shown && t >= b.at - 0.002) { b.shown = true; fade([b.g], 220); } });
        }).then(function () { lmPath.style.strokeDasharray = ''; lmPath.style.strokeDashoffset = ''; });
      }

      if (mode === 'switch') {
        ui.legend('all', true);
        await fade([layers.axes, layers.base, layers.refs, layers.marks].concat(models.map(lblOf), models.map(tieOf), [mjLbl]), 260);
        if (!live()) return;
        await drawCurve(700);
        if (!live()) return;
        fade(lmLabelNodes, 200);
        await fade(markNodes, 300);
        if (live()) svg.classList.add('fx-ready');
        return;
      }

      // the full sequence, about nine seconds
      ui.legend('all', false);
      hideAll([layers.axes, mjg, mjLbl].concat(blines.map(function (b) { return b.g; }),
        others.map(function (o) { return o.g; }), models.map(function (o) { return o.g; }), models.map(lblOf), models.map(tieOf)));
      await fade([layers.axes], 500);
      if (!live()) return;
      ui.legend('mod', true);
      for (var mi = 0; mi < models.length; mi++) {
        if (!live()) return;
        dropIn(models[mi]);
        await h.sleep(230);
      }
      await h.sleep(250);
      if (!live()) return;
      if (others.length) { fade(others.map(function (o) { return o.g; }), 400); await h.sleep(300); }
      ui.legend('maj', true);
      await fade([mjg, mjLbl], 450);
      await h.sleep(300);
      if (!live()) return;
      ui.legend('bl', true);
      for (var bi = 0; bi < blines.length; bi++) {
        if (!live()) return;
        fade([blines[bi].g], 600);
        await h.sleep(90);
      }
      await h.sleep(500);
      if (!live()) return;
      ui.legend('lm', true);
      await drawCurve(2000);
      if (!live()) return;
      fade(lmLabelNodes, 300);
      await h.sleep(350);
      for (var k = 0; k < marks.length; k++) {
        if (!live()) return;
        var o = marks[k];
        fade([o.g, o.letter], 260);
        if (o.leader) {
          var y2 = +o.leader.getAttribute('y2'), y1 = +o.leader.getAttribute('y1');
          o.leader.style.opacity = 1;
          await h.tween(300, function (t) { o.leader.setAttribute('y1', y2 + (y1 - y2) * t); });
        }
        await fade([o.note], 300);
        await h.sleep(180);
      }
      if (live()) svg.classList.add('fx-ready');

      function dropIn(o) {
        var x = o.x, y = o.y;
        h.tween(380, function (t) {
          o.g.style.opacity = t;
          o.g.setAttribute('transform', 'translate(' + x + ',' + (y - 16 * (1 - t)) + ')');
          if (o.lbl) o.lbl.style.opacity = t;
          if (o.tie) o.tie.style.opacity = t;
        });
      }
    }

    return async function play(alive) {
      var mine = ++seq;
      try { await draw(current, 'full', function () { return alive() && mine === seq; }); }
      catch (e) { fail(e); }
    };
  });
})();
