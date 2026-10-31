/* fig-calibration: LMCircuit's decisions are calibrated.
   A reliability diagram per task, one tab each, the same five tasks as the
   results chart. Held-out prompts are grouped in ten bins of the predicted
   probability; each point is a bin, at its mean prediction (x) and the share
   of it that truly has label 1 (y). A calibrated circuit sits on the diagonal.
     LMCircuit       the belief where the circuit stops, at a budget of 0.1
                     (amber, the colour of what the circuit does)
     Majority voting the share of votes for label 1 (grey, as on the results chart)
   Beside the chart, each one's expected calibration error. All values come from
   the lmcircuit reports (data/calibration.json, made by scripts/extract_calibration.py);
   nothing is computed here but positions.
   On arrival the diagonal draws, then majority voting, then LMCircuit. With
   reduced motion (or ?still, ?qa) the chart is drawn at once. */
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
  var BUDGET = '0.1';
  var PAD = 1.5;

  var DATA = null;
  function load() {
    if (!DATA) DATA = (window.LC_CALIBRATION_DATA ? Promise.resolve(window.LC_CALIBRATION_DATA)
      : fetch('./data/calibration.json').then(function (r) {
        if (!r.ok) throw new Error('calibration.json: ' + r.status);
        return r.json();
      }));
    return DATA;
  }
  function meta(key) { return TASKS.filter(function (t) { return t.key === key; })[0]; }
  function pts(c, sx, sy) {
    var out = [];
    c.rows.forEach(function (n, i) { if (n > 0) out.push([sx(c.predicted[i]), sy(c.observed[i])]); });
    return out;
  }
  function path(p) { return p.map(function (q, i) { return (i ? 'L' : 'M') + q[0].toFixed(1) + ',' + q[1].toFixed(1); }).join(''); }
  // a five-pointed star of outer radius r, centred on the origin (majority voting, as on the results chart)
  function star(r) {
    var d = '';
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
      d += (i ? 'L' : 'M') + (rr * Math.cos(a)).toFixed(2) + ',' + (rr * Math.sin(a)).toFixed(2);
    }
    return d + 'Z';
  }
  function pctErr(e) { var v = e * 100; return (v < 10 ? v.toFixed(1) : String(Math.round(v))) + '%'; }

  LC.figure('calib', function (fig, ctx) {
    var current = fig._task || (fig._task = TASKS[0].key);
    var seq = fig._seq || 0;

    /* ---- head: the task tabs, as on the results chart */
    var head = h.head(fig, '');
    var tabs = document.createElement('div');
    tabs.className = 'cb-tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Task');
    var buttons = TASKS.map(function (t) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.dataset.task = t.key;
      b.textContent = t.tab;
      b.addEventListener('click', function () { select(t.key); });
      tabs.appendChild(b);
      return b;
    });
    tabs.addEventListener('keydown', function (e) {
      var i = buttons.indexOf(document.activeElement);
      if (i < 0 || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
      var j = (i + (e.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length;
      buttons[j].focus(); select(TASKS[j].key); e.preventDefault();
    });
    head.replaceChild(tabs, head.querySelector('.fig-title'));

    var old = fig.querySelector('.cb-ui');
    if (old) old.remove();
    var ui = document.createElement('div');
    ui.className = 'cb-ui';
    head.parentNode.insertBefore(ui, head.nextSibling);
    var sub = document.createElement('p');
    sub.className = 'cb-sub';
    var subName = document.createElement('b'), subAsk = document.createElement('span');
    sub.appendChild(subName); sub.appendChild(subAsk);
    ui.appendChild(sub);
    var leg = document.createElement('div');
    leg.className = 'cb-legend';
    leg.innerHTML =     // fixed markup, no data in it
      '<span class="cb-li" data-s="lm"><svg class="cb-key" viewBox="0 0 28 16" aria-hidden="true"><line class="k-lm" x1="2" y1="8" x2="26" y2="8"/><circle class="k-lm-dot" cx="14" cy="8" r="3.5"/></svg>LMCircuit</span>' +
      '<span class="cb-li" data-s="maj"><svg class="cb-key" viewBox="0 0 28 16" aria-hidden="true"><line class="k-maj-l" x1="2" y1="8" x2="26" y2="8"/><path class="k-maj" transform="translate(14,8.6)" d="' + star(6) + '"/></svg>Majority voting</span>' +
      '<span class="cb-li" data-s="ref"><svg class="cb-key" viewBox="0 0 28 16" aria-hidden="true"><line class="k-ref" x1="2" y1="8" x2="26" y2="8"/></svg>Perfect calibration</span>';
    ui.appendChild(leg);

    /* ---- the frame: a square chart, the two errors beside it (under it when narrow) */
    var cs = getComputedStyle(fig);
    var W = Math.round((fig.clientWidth || 900) - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
    var side = W >= 640;
    var S = side ? Math.min(420, Math.round(W * 0.48)) : Math.min(380, W - 60);
    var L = { x0: 56, y0: 14 };
    L.x1 = L.x0 + S; L.y1 = L.y0 + S;
    var statX = side ? L.x1 + 64 : L.x0, statY = side ? L.y0 + 40 : L.y1 + 76;
    var H = side ? L.y1 + 58 : statY + 150;
    var svg = h.makeSvg(fig, W, H);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    var root = svgEl('g', { transform: 'translate(' + PAD + ',' + PAD + ')' }, svg);
    function sx(p) { return L.x0 + p * S; }
    function sy(p) { return L.y1 - p * S; }

    function draw(key, live) {
      return load().then(function (D) {
        if (!live()) return null;
        var T = D[key], lm = T.lmcircuit[BUDGET], mv = T.majority_vote, m = meta(key);
        subName.textContent = m.name; subAsk.textContent = m.ask;
        buttons.forEach(function (b) {
          var on = b.dataset.task === key;
          b.setAttribute('aria-selected', on ? 'true' : 'false');
          b.tabIndex = on ? 0 : -1;
        });
        svg.setAttribute('aria-label', m.name + ': reliability of LMCircuit and of majority voting');
        root.innerHTML = '';

        // axes and grid
        var ax = svgEl('g', {}, root);
        [0, 0.25, 0.5, 0.75, 1].forEach(function (t) {
          svgEl('line', { 'class': 'cb-grid', x1: sx(0), y1: sy(t), x2: sx(1), y2: sy(t) }, ax);
          svgEl('line', { 'class': 'cb-grid', x1: sx(t), y1: sy(0), x2: sx(t), y2: sy(1) }, ax);
          if (t === 0.25 || t === 0.75) return;
          var s = t === 0 ? '0' : t === 1 ? '1' : '0.5';
          label(ax, sx(0) - 9, sy(t) + 5, s, 'cb-tick', { 'text-anchor': 'end' });
          label(ax, sx(t), sy(0) + 22, s, 'cb-tick', { 'text-anchor': 'middle' });
        });
        svgEl('line', { 'class': 'cb-axis', x1: sx(0), y1: sy(0), x2: sx(1), y2: sy(0) }, ax);
        svgEl('line', { 'class': 'cb-axis', x1: sx(0), y1: sy(0), x2: sx(0), y2: sy(1) }, ax);
        label(ax, (sx(0) + sx(1)) / 2, sy(0) + 46, 'Predicted probability', 'cb-axt', { 'text-anchor': 'middle' });
        label(ax, 0, 0, 'Observed frequency', 'cb-axt', { 'text-anchor': 'middle', transform: 'translate(14,' + ((sy(0) + sy(1)) / 2) + ') rotate(-90)' });

        // perfect calibration
        var ref = svgEl('path', { 'class': 'cb-ref', d: 'M' + sx(0) + ',' + sy(0) + ' L' + sx(1) + ',' + sy(1) }, root);

        // majority voting: grey, stars
        var mvG = svgEl('g', { 'class': 'cb-mv' }, root), mp = pts(mv, sx, sy);
        var mvLine = svgEl('path', { 'class': 'cb-mv-l', d: path(mp) }, mvG);
        mp.forEach(function (q) { svgEl('path', { 'class': 'cb-mv-s', d: star(7), transform: 'translate(' + q[0].toFixed(1) + ',' + q[1].toFixed(1) + ')' }, mvG); });

        // LMCircuit: amber, dots
        var lmG = svgEl('g', { 'class': 'cb-lm' }, root), lp = pts(lm, sx, sy);
        var lmLine = svgEl('path', { 'class': 'cb-lm-l', d: path(lp) }, lmG);
        lp.forEach(function (q) { svgEl('circle', { 'class': 'cb-lm-d', cx: q[0].toFixed(1), cy: q[1].toFixed(1), r: 5 }, lmG); });

        // the two calibration errors
        var st = svgEl('g', { 'class': 'cb-stats' }, root);
        label(st, statX, statY, 'Calibration error', 'cb-st-k');
        label(st, statX, statY + 22, 'how far the points sit from the diagonal', 'cb-st-s');
        var rowLm = svgEl('g', { 'class': 'cb-st-row lm' }, st), rowMv = svgEl('g', { 'class': 'cb-st-row mv' }, st);
        label(rowLm, statX, statY + 76, pctErr(lm.ece), 'cb-st-v');
        label(rowLm, statX, statY + 100, 'LMCircuit', 'cb-st-n');
        label(rowMv, statX + (side ? 150 : 150), statY + 76, pctErr(mv.ece), 'cb-st-v');
        label(rowMv, statX + (side ? 150 : 150), statY + 100, 'Majority voting', 'cb-st-n');
        return { ref: ref, mvG: mvG, mvLine: mvLine, lmG: lmG, lmLine: lmLine, rowLm: rowLm, rowMv: rowMv };
      });
    }

    function stroke(el, ms, live) {
      var len = el.getTotalLength();
      el.style.strokeDasharray = len; el.style.strokeDashoffset = len;
      return h.tween(ms, function (t) { if (live()) el.style.strokeDashoffset = len * (1 - t); })
        .then(function () { el.style.strokeDasharray = ''; el.style.strokeDashoffset = ''; });
    }
    function fade(nodes, ms, live) {
      return h.tween(ms, function (t) { if (live()) nodes.forEach(function (n) { n.style.opacity = t; }); });
    }

    async function show(key, animate) {
      var mine = fig._seq = ++seq;
      var live = function () { return mine === seq && svg.isConnected; };
      current = fig._task = key;
      var d;
      try { d = await draw(key, live); }
      catch (e) {
        root.innerHTML = '';
        label(root, 0, 30, 'The chart could not load its data.', 'cb-err');
        throw e;
      }
      if (!d || !animate || ctx.reduce) return;
      var dots = [d.mvG, d.lmG, d.rowLm, d.rowMv];
      dots.forEach(function (n) { n.style.opacity = 0; });
      await stroke(d.ref, 600, live); if (!live()) return;
      await h.sleep(200);
      d.mvG.style.opacity = 1;
      await stroke(d.mvLine, 900, live); if (!live()) return;
      await fade([d.rowMv], 400, live); if (!live()) return;
      await h.sleep(500);
      d.lmG.style.opacity = 1;
      await stroke(d.lmLine, 900, live); if (!live()) return;
      await fade([d.rowLm], 400, live);
    }
    function select(key) { show(key, false); }

    show(current, false);
    return function play() { return show(current, true); };
  });
})();
