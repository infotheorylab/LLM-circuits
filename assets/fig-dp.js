/* The best circuit as a tree, with a slider for the price of a query.

   Each slider stop is a price at which the dynamic program's best circuit
   changes; between stops the tree, its chance of a mistake and its average
   spend stay the same, so a finer slider would only repeat itself. On arrival
   the price sweeps from high to low and the tree grows. The amber path is what
   the circuit does on the hard prompt, whose three models answer harmful,
   safe, harmful.

   This screen comes before the prompt classifier (the next screen), so the
   dynamic program uses what a circuit knows without one: a prior of one half
   and each model's overall accuracy, which gives every prompt the same tree.
   With the hard prompt's own prior and accuracies the best circuit asks at
   most one model (Gemma 4 26B, then Gemma 4 31B as the price falls), so its
   tree would never grow past one question. */
(function () {
  'use strict';
  var h = LC.h, svgEl = h.svgEl, label = h.label;
  var MODELS = LC.MODELS;
  var PROMPT = LC.PROMPTS.hard;
  var PRIOR = 0.5, ACC = LC.POOLED, ANSWERS = PROMPT.answers;
  var ROOT_KEY = new Array(MODELS.length + 1).join('.');
  var WORD = ['safe', 'harmful'];

  /* ------------------------------------------------------------ the stops */

  function shape(memo, key) {
    var r = memo[key];
    if (r.act === 'stop') return 'S' + r.predict;
    return 'A' + r.i + '(' + shape(memo, child(key, r.i, 0)) + ',' + shape(memo, child(key, r.i, 1)) + ')';
  }
  function child(key, i, x) { return key.substr(0, i) + x + key.substr(i + 1); }

  // scan prices from high to low on a geometric grid and keep each new tree
  var STOPS = (function () {
    var out = [], last = null;
    for (var k = 0; k <= 160; k++) {
      var lam = 0.5 * Math.pow(0.002, k / 160);
      var memo = LC.dp.solve(PRIOR, lam, ACC), s = shape(memo, ROOT_KEY);
      if (s !== last) { out.push({ lam: lam, memo: memo }); last = s; }
    }
    return out;
  })();

  function onPath(key) {
    for (var i = 0; i < key.length; i++) if (key[i] !== '.' && +key[i] !== ANSWERS[i]) return false;
    return true;
  }
  // the tree of one stop: kids[0] follows a "safe" answer, kids[1] a "harmful" one
  function treeOf(memo) {
    function node(key, depth, ans) {
      var r = memo[key];
      var n = { key: key, r: r, depth: depth, ans: ans, on: onPath(key), kids: [] };
      if (r.act === 'ask') n.kids = [0, 1].map(function (x) { return node(child(key, r.i, x), depth + 1, x); });
      return n;
    }
    return node(ROOT_KEY, 0, null);
  }
  function walk(n, fn) { fn(n); n.kids.forEach(function (k) { walk(k, fn); }); }
  function coins(c) {
    var r = Math.abs(c - Math.round(c)) < 0.05 ? String(Math.round(c)) : c.toFixed(1);
    return r === '1' ? '1 coin' : r + ' coins';
  }

  /* ----------------------------------------------------------- the figure */

  LC.figure('dp', function (fig, ctx) {
    h.head(fig, 'The best circuit at each price');
    var ui = controls(fig);
    var cs = getComputedStyle(fig);
    var W = fig.clientWidth ? Math.round(fig.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) : 560;
    var svg = h.makeSvg(fig, W, 400);

    // sizes measured in the page's fonts so that boxes fit their words
    var probe = svgEl('g', { 'class': 'station' }, svg);
    var nameW = Math.max.apply(null, MODELS.map(function (m) { return label(probe, 0, 0, m.name, 'st-name').getComputedTextLength(); }));
    // the coins row as kit.station draws it: 11 units per coin, then the word
    var coinW = Math.max.apply(null, MODELS.map(function (m) {
      return m.coins * 11 + 4 + label(probe, 0, 0, m.coins === 1 ? '1 coin' : m.coins + ' coins', 'st-sub').getComputedTextLength();
    }));
    var leafProbe = svgEl('g', { 'class': 'dpx-leaf' }, svg);
    var leafTextW = Math.max(label(leafProbe, 0, 0, 'harmful', 'v').getComputedTextLength(),
      label(leafProbe, 0, 0, 'predict', 'p').getComputedTextLength());
    var ansW = WORD.map(function (w) { return label(svg, 0, 0, w, 'dpx-ans').getComputedTextLength(); });
    svg.innerHTML = '';
    var S = { w: Math.ceil(Math.max(nameW, coinW)) + 34, h: 52 };   // a model to ask
    var L = { w: Math.ceil(leafTextW) + 26, h: 52 };      // stop and predict
    var BAR = 30, BAND = 52;                              // parent bottom to bar, parent bottom to child top

    var VW = W;                       // the viewBox width; W unless the tree needs a little more
    var current = null, seq = 0, manual = false;

    function size(n) { return n.r.act === 'ask' ? S : L; }

    /* Wide: a top-down tree. Siblings sit as far apart as the width allows,
       and never closer than their rows need. */
    function layoutWide(root) {
      var GAP = 14, minD = 0;
      function contour(n) {
        var b = size(n), c = { L: [-b.w / 2], R: [b.w / 2] };
        if (!n.kids.length) return c;
        var a = contour(n.kids[0]), z = contour(n.kids[1]), D = 0;
        for (var i = 0; i < Math.min(a.L.length, z.L.length); i++) D = Math.max(D, a.R[i] - z.L[i] + GAP);
        // keep the two answer words apart when they sit over the bar
        D = Math.max(D, ansW[0] / 2 + ansW[1] / 2 + 30, minD);
        n.kids[0].dx = -D / 2; n.kids[1].dx = D / 2;
        for (var j = 0; j < Math.max(a.L.length, z.L.length); j++) {
          var ls = [], rs = [];
          if (j < a.L.length) { ls.push(a.L[j] - D / 2); rs.push(a.R[j] - D / 2); }
          if (j < z.L.length) { ls.push(z.L[j] + D / 2); rs.push(z.R[j] + D / 2); }
          c.L.push(Math.min.apply(null, ls)); c.R.push(Math.max.apply(null, rs));
        }
        return c;
      }
      var c, lo, hi;
      for (minD = 240; minD >= 0; minD -= 10) {
        c = contour(root);
        lo = Math.min.apply(null, c.L); hi = Math.max.apply(null, c.R);
        if (hi - lo <= VW - 2) break;
      }
      root.x = VW / 2 - (lo + hi) / 2;
      root.span = hi - lo;
      walk(root, function (n) { n.kids.forEach(function (k) { k.x = n.x + k.dx; }); });
      return root;
    }

    /* Narrow: two columns, safe on the left and harmful on the right. Only the
       path of this prompt is opened; a branch it does not take shows its first
       model as a dashed box. */
    function layoutNarrow(root) {
      var gap = Math.min(40, VW - 2 * S.w - 4);
      var xs = [VW / 2 - gap / 2 - S.w / 2, VW / 2 + gap / 2 + S.w / 2];
      root.x = VW / 2;
      (function place(n) {
        n.kids.forEach(function (k, x) {
          k.x = xs[x];
          if (!k.on && k.kids.length) { k.ghost = true; k.kids = []; }
          place(k);
        });
      })(root);
      return root;
    }

    // between 520 and about 560 pixels the full tree is a little wider than the
    // figure: widen the viewBox (words shrink by a few percent) instead of clipping
    if (ctx.narrow) VW = Math.max(W, 2 * S.w + 12);
    else STOPS.forEach(function (stop) { VW = Math.max(VW, Math.ceil(layoutWide(treeOf(stop.memo)).span + 2)); });

    var layer = svgEl('g', {}, svg);
    var card = promptCard(svg, VW);
    var top = card.h + 30;
    function rowY(d) { return top + d * (S.h + BAND); }

    // one height for every stop, so the page does not move as the tree grows
    var deepest = 0;
    STOPS.forEach(function (stop) {
      var root = treeOf(stop.memo);
      if (ctx.narrow) layoutNarrow(root);
      walk(root, function (n) { deepest = Math.max(deepest, n.depth); });
    });
    svg.setAttribute('viewBox', '0 0 ' + VW + ' ' + Math.ceil(rowY(deepest) + S.h + 34));

    function draw(stop) {
      var root = treeOf(stop.memo);
      if (ctx.narrow) layoutNarrow(root); else layoutWide(root);
      var g = svgEl('g', { 'class': 'dpx-tree' }, layer);
      var edges = svgEl('g', {}, g), words = svgEl('g', {}, g), nodes = svgEl('g', {}, g), amber = svgEl('g', {}, g);
      var items = [], path = [];
      var stem = svgEl('path', { 'class': 'dpx-edge on', d: 'M' + root.x + ',' + (card.h + 1) + ' V' + rowY(0) }, amber);
      path.push({ edge: stem, node: null });

      walk(root, function (n) {
        var b = size(n), y = rowY(n.depth);
        var ng = svgEl('g', { 'class': 'dpx-node' }, nodes);
        if (n.r.act === 'ask' && !n.ghost) {
          var st = LC.kit.station(ng, n.x - b.w / 2, y, MODELS[n.r.i], { w: b.w, h: b.h });
          n.light = function () { st.state('on'); };
        } else if (n.ghost) {
          var gh = LC.kit.station(ng, n.x - b.w / 2, y, MODELS[n.r.i], { w: S.w, h: S.h });
          gh.state('ghost');
          n.light = function () {};
        } else {
          var lg = svgEl('g', { 'class': 'dpx-leaf' }, ng);
          svgEl('rect', { x: n.x - b.w / 2, y: y, width: b.w, height: b.h, rx: 12 }, lg);
          label(lg, n.x, y + 21, 'predict', 'p', { 'text-anchor': 'middle' });
          label(lg, n.x, y + 40, WORD[n.r.predict], 'v', { 'text-anchor': 'middle' });
          n.light = function () { lg.setAttribute('class', 'dpx-leaf on'); };
        }
        n.bottom = y + b.h;
        items.push({ el: ng, depth: n.depth });

        n.kids.forEach(function (k) {
          var y0 = y + b.h, yb = y0 + BAR, cy = rowY(n.depth + 1), dx = k.x - n.x;
          var r = Math.min(10, Math.abs(dx) / 2), s = dx < 0 ? -1 : 1, d;
          if (Math.abs(dx) < 1) d = 'M' + n.x + ',' + y0 + ' V' + cy;
          else d = 'M' + n.x + ',' + y0 + ' V' + (yb - r) + ' Q' + n.x + ',' + yb + ' ' + (n.x + s * r) + ',' + yb +
            ' H' + (k.x - s * r) + ' Q' + k.x + ',' + yb + ' ' + k.x + ',' + (yb + r) + ' V' + cy;
          var e = svgEl('path', { 'class': 'dpx-edge', d: d }, edges);
          // wide: the answer sits over the bar where it turns down to its child;
          // narrow: beside the stem, on its branch's side, since the far column
          // holds the previous row's other box
          var t;
          if (ctx.narrow) t = label(words, n.x + (k.ans ? 10 : -10), yb - 9, WORD[k.ans], 'dpx-ans', { 'text-anchor': k.ans ? 'start' : 'end' });
          else t = label(words, k.x, yb - 10, WORD[k.ans], 'dpx-ans', { 'text-anchor': 'middle' });
          items.push({ el: e, depth: k.depth, edge: true });
          items.push({ el: t, depth: k.depth });
          if (n.on && k.on) {
            var a = svgEl('path', { 'class': 'dpx-edge on', d: d }, amber);
            path.push({ edge: a, node: k, word: t });
          }
        });
      });

      // what this prompt costs on its path
      var spent = 0, leaf = null;
      walk(root, function (n) { if (n.on && n.r.act === 'ask' && !n.ghost) spent += MODELS[n.r.i].coins; if (n.on && !n.kids.length) leaf = n; });
      var spentT = label(amber, leaf.x, leaf.bottom + 24, 'spent ' + coins(spent), 'dpx-spent', { 'text-anchor': 'middle' });
      return { g: g, root: root, items: items, path: path, spent: spentT };
    }

    // grow the tree row by row, then trace this prompt's path in amber
    async function grow(t, live, fast) {
      var maxD = 0;
      t.items.forEach(function (it) { maxD = Math.max(maxD, it.depth); it.el.style.opacity = 0; });
      t.path.forEach(function (p) { prep(p.edge); });
      t.spent.style.opacity = 0;
      for (var d = 0; d <= maxD; d++) {
        var row = t.items.filter(function (it) { return it.depth === d; });
        row.forEach(function (it) { if (it.edge) prep(it.el); });
        await h.tween(fast ? 160 : 280, function (u) {
          row.forEach(function (it) { it.el.style.opacity = u; if (it.edge) it.el.style.strokeDashoffset = it.el.len * (1 - u); });
        });
        if (!live()) return;
      }
      if (!fast) { await h.sleep(250); if (!live()) return; }
      for (var i = 0; i < t.path.length; i++) {
        var p = t.path[i];
        await h.tween(fast ? 140 : 340, function (u) { p.edge.style.strokeDashoffset = p.edge.len * (1 - u); });
        if (!live()) return;
        (p.node || t.root).light();
        if (p.word) p.word.setAttribute('class', 'dpx-ans on');
      }
      await h.tween(fast ? 120 : 300, function (u) { t.spent.style.opacity = u; });
    }
    function prep(el) {
      var len = el.getTotalLength();
      el.style.strokeDasharray = len + ' ' + len; el.style.strokeDashoffset = len;
      el.len = len;
    }

    // the old tree fades out while the new one grows in its place
    async function show(k, fast) {
      var mine = ++seq, live = function () { return mine === seq; };
      ui.set(k);
      Array.prototype.slice.call(layer.children).forEach(function (c) { if (!current || c !== current.g) c.remove(); });
      var old = current;
      current = draw(STOPS[k]);
      if (old) h.tween(fast ? 120 : 260, function (u) { old.g.style.opacity = 1 - u; }).then(function () { old.g.remove(); });
      await grow(current, live, fast);
    }

    ui.input.addEventListener('input', function () { manual = true; show(+ui.input.value, true); });
    current = draw(STOPS[0]);
    current.root.light();
    ui.set(0);

    return async function (alive) {
      manual = false;
      for (var k = 0; k < STOPS.length; k++) {
        if (!alive() || manual) return;
        await show(k, false);
        if (!alive() || manual) return;
        if (k < STOPS.length - 1) await h.sleep(k === 0 ? 800 : 1300);
      }
    };
  });

  /* The prompt, in a card no wider than its lines need, centred on the root. */
  function promptCard(svg, W) {
    var full = LC.kit.promptCard(svg, 0, 0, W - 2, PROMPT.text), lines = full.h, w = W - 2, lo = W * 0.5;
    full.g.remove();
    while (w - 8 >= lo) {
      var c = LC.kit.promptCard(svg, 0, 0, w - 8, PROMPT.text), hh = c.h;
      c.g.remove();
      if (hh > lines) break;
      w -= 8;
    }
    var x = Math.round((W - w) / 2);
    var card = LC.kit.promptCard(svg, x, 1, w, PROMPT.text);
    return card;
  }

  /* The slider and the two readouts, in HTML above the tree. */
  function controls(fig) {
    var old = fig.querySelector('.dpx-ui');
    if (old) old.remove();
    var box = document.createElement('div');
    box.className = 'dpx-ui';
    box.innerHTML =
      '<div class="dpx-ctl">' +
        '<label class="dpx-k" for="dpx-price">Price per query</label>' +
        '<div class="dpx-range">' +
          '<input type="range" id="dpx-price" min="0" max="' + (STOPS.length - 1) + '" step="1" value="0" />' +
          '<div class="dpx-ticks" aria-hidden="true">' + STOPS.map(function () { return '<i></i>'; }).join('') + '</div>' +
          '<div class="dpx-ends" aria-hidden="true"><span>high</span><span>low</span></div>' +
        '</div>' +
      '</div>' +
      '<div class="dpx-read" aria-live="polite">' +
        '<div class="dpx-stat"><span class="l">Chance of a mistake</span><b data-k="err"></b></div>' +
        '<div class="dpx-stat"><span class="l">Average spend</span><b data-k="cost"></b></div>' +
      '</div>';
    var headEl = fig.querySelector('.fig-head');
    fig.insertBefore(box, headEl ? headEl.nextSibling : fig.firstChild);
    var input = box.querySelector('input'), err = box.querySelector('[data-k="err"]'), cost = box.querySelector('[data-k="cost"]');
    return {
      input: input,
      set: function (k) {
        var r = STOPS[k].memo[ROOT_KEY];
        input.value = k;
        input.setAttribute('aria-valuetext', 'price ' + (k + 1) + ' of ' + STOPS.length + ', from high to low');
        err.textContent = LC.h.pct(r.err);
        cost.textContent = coins(r.cost);
      }
    };
  }
})();
