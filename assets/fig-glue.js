/* fig-glue: LMCircuit's two parts, on the hard prompt (ported from the upstream
   figure by Hadi Khalaf).

   Panel 1, fit once: the prompt and the answers so far (none yet) go into the
   prompt classifier, which returns the chance the prompt is harmful and the
   chance each model gets this prompt right (the prompt's own accuracies from
   LC.PROMPTS.hard, as in the routing figure).
   Panel 2, pick a setting: the classifier and a setting go into the dynamic
   program, which returns the circuit for the prompt. The circuits are
   LC.dp.runPrompt at two settings, so they follow LC.PROMPTS if it changes:
     prioritize cost       no model, predict harmful at 54%     $0 per 1M prompts
     prioritize accuracy   Gemma 4 31B, which says harmful      $90
   The figure plays once: panel 1, then the circuit for the first setting, then
   the setting changes and only the dynamic program runs again.

   The drawing is made at the figure's own width (one unit per CSS pixel). Each
   panel lays its row of inputs side by side when they fit and stacks them when
   they do not; the same goes for the blocks of a circuit. */
(function () {
  'use strict';
  var h = LC.h, kit = LC.kit, M = LC.MODELS, P = LC.PROMPTS.hard;

  var PAD = 1.5;                 // keeps the outer strokes inside the viewBox
  var GAP = 14;                  // between the two panels
  var HEAD = 50;                 // a panel's title row
  var LINK = 26;                 // a wire between two rows
  var NET_S = 1.1;               // the classifier's icon in panel 1 (kit.net is 56 x 58 at 1)
  var PILL_H = 52;
  var ST_H = 78, PRED_W = 104;   // a model block and the prediction in a circuit
  var ROW = 24;                  // one row of bars

  var SETTINGS = [
    { name: 'Prioritize cost', lam: .02 },
    { name: 'Prioritize accuracy', lam: LC.LAMBDA }
  ];
  var Q = P.prior;
  var PH = P.acc;                // the chance each model is right on this prompt
  var RUNS = SETTINGS.map(function (s) {
    var steps = LC.dp.runPrompt('hard', s.lam), stop = steps[steps.length - 1];
    var asks = steps.filter(function (st) { return st.act === 'ask'; });
    return { asks: asks, q: stop.q, predict: stop.predict,
      cost: asks.reduce(function (c, st) { return c + M[st.i].cost; }, 0) };
  });

  LC.figure('glue', function (fig, ctx) {
    h.head(fig, '');
    var cs = getComputedStyle(fig);
    var W = Math.round(Math.max(300, ctx.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)));
    var svg = h.makeSvg(fig, W, 900);
    var g = h.svgEl('g', { transform: 'translate(' + PAD + ',' + PAD + ')' }, svg);
    var w = W - 2 * PAD;
    var IN = w < 420 ? 14 : 18;              // panel padding
    var CW = w - 2 * IN;                     // panel content width
    var under = h.svgEl('g', {}, g);         // panels and cards, under the wires
    var wires = h.svgEl('g', {}, g);
    var top = h.svgEl('g', {}, g);

    // the width of str in class cls (inside a group of class wrap, for styles set on the group)
    function measure(str, cls, wrap) {
      var mg = h.svgEl('g', { 'class': wrap || '' }, top), t = h.label(mg, 0, 0, str, cls);
      var n = t.getComputedTextLength();
      mg.remove();
      return n;
    }
    function rect(parent, x, y, rw, rh, cls, rx) {
      return h.svgEl('rect', { 'class': cls, x: x, y: y, width: rw, height: rh, rx: rx === undefined ? 12 : rx }, parent);
    }
    function wire(d) { return kit.wire(wires, d, { arrow: true }); }
    // a vertical wire with soft bends, from (x1, y1) down to (x2, y2)
    function down(x1, y1, x2, y2) {
      if (Math.abs(x1 - x2) < 1) return 'M' + x1 + ',' + y1 + ' V' + y2;
      var m = (y1 + y2) / 2;
      return 'M' + x1 + ',' + y1 + ' C' + x1 + ',' + m + ' ' + x2 + ',' + m + ' ' + x2 + ',' + y2;
    }
    function panel(y, n, title) {
      var r = rect(under, 0, y, w, 100, 'gl-panel', 16);
      h.svgEl('circle', { 'class': 'gl-num-bg', cx: IN + 12, cy: y + 27, r: 12 }, top);
      h.label(top, IN + 12, y + 32, n, 'gl-num', { 'text-anchor': 'middle' });
      h.label(top, IN + 32, y + 33, title, 'gl-title');
      return r;
    }
    // a white input block with one or two centred lines
    function pill(x, y, pw, l1, l2) {
      var pg = h.svgEl('g', {}, top);
      rect(pg, x, y, pw, PILL_H, 'gl-pill');
      h.label(pg, x + pw / 2, y + (l2 ? 23 : 31), l1, 'gl-pill-t', { 'text-anchor': 'middle' });
      if (l2) h.label(pg, x + pw / 2, y + 42, l2, 'gl-pill-s', { 'text-anchor': 'middle' });
      return pg;
    }
    function net(cx, cy, s) {
      var n = kit.net(top, cx - 28 * s, cy - 29 * s, s);
      n.classList.add('idle');
      return { g: n, l: cx - 25.5 * s, r: cx + 25.5 * s, t: cy - 27.5 * s, b: cy + 27.5 * s };
    }
    // a bar from 0 to 100%; set(t) grows it to its value
    function bar(x, y, bw, v, cls, val) {
      rect(top, x, y, bw, 8, 'gl-track', 4);
      var f = rect(top, x, y, 0, 8, 'gl-fill ' + cls, 4);
      return function (t) { f.setAttribute('width', bw * v * t); val.textContent = t ? h.pct(v * t) : ''; };
    }

    /* ------------------------------------------------ panel 1: fit once */
    var y1 = 0, box1 = panel(y1, '1', 'Fit once');
    var labW = measure('Prompt classifier', 'gl-name');
    var pAw = Math.ceil(measure('Prompt', 'gl-pill-t')) + 40;
    var pBw = Math.ceil(Math.max(measure('Answers so far', 'gl-pill-t'), measure('none yet', 'gl-pill-s'))) + 32;
    var colW = Math.max(labW, 56 * NET_S);
    var side = (CW - colW - pAw - pBw) / 2;       // room for each wire into the classifier
    var wide1 = side >= 28;
    var p1 = {}, row = y1 + HEAD, net1, cardY;
    if (wide1) {
      // Prompt -> classifier <- answers so far, then down to what it returns
      var wl = Math.min(64, side), x0 = IN + (CW - (pAw + wl + colW + wl + pBw)) / 2;
      var cx = x0 + pAw + wl + colW / 2, cy = row + 29 * NET_S;
      pill(x0, cy - PILL_H / 2, pAw, 'Prompt');
      pill(cx + colW / 2 + wl, cy - PILL_H / 2, pBw, 'Answers so far', 'none yet');
      net1 = net(cx, cy, NET_S);
      var ly = net1.b + 20;
      h.label(top, cx, ly, 'Prompt classifier', 'gl-name', { 'text-anchor': 'middle' });
      p1.a = wire('M' + (x0 + pAw) + ',' + cy + ' H' + (net1.l - 6));
      p1.b = wire('M' + (cx + colW / 2 + wl) + ',' + cy + ' H' + (net1.r + 6));
      cardY = ly + 8 + LINK;
      p1.out = wire(down(cx, ly + 8, cx, cardY - 2));
    } else {
      // the two inputs side by side, both wired down into the classifier
      var gp = 14, xa = IN + (CW - pAw - gp - pBw) / 2, xb = xa + pAw + gp;
      pill(xa, row, pAw, 'Prompt');
      pill(xb, row, pBw, 'Answers so far', 'none yet');
      var ncx = IN + CW / 2, ncy = row + PILL_H + LINK + 29 * NET_S;
      net1 = net(ncx, ncy, NET_S);
      var nl = h.label(top, net1.r + 12, ncy - 4, '', 'gl-name');
      h.svgEl('tspan', { x: net1.r + 12, dy: 0 }, nl).textContent = 'Prompt';
      h.svgEl('tspan', { x: net1.r + 12, dy: 18 }, nl).textContent = 'classifier';
      // both wires end on one point, so their arrowheads draw as one
      p1.a = wire(down(xa + pAw / 2, row + PILL_H, ncx, net1.t - 4));
      p1.b = wire(down(xb + pBw / 2, row + PILL_H, ncx, net1.t - 4));
      cardY = net1.b + LINK;
      p1.out = wire(down(ncx, net1.b + 4, ncx, cardY - 2));
    }

    // what the classifier returns: the chance the prompt is harmful, and each model's chance of saying so
    var bars = [], nameW = Math.max.apply(null, M.map(function (m) { return measure(m.name, 'gl-m'); }));
    var valW = measure('100%', 'gl-v'), heading = 'Chance each model is right';
    var headW = measure(heading, 'gl-k'), cardH;
    var leftW = Math.max(measure('Chance harmful', 'gl-k'), 130);
    var wideCard = CW - 32 - leftW - 40 >= Math.max(headW, nameW + valW + 90);
    var cardX = IN, cardW = CW, rx0, ry0;
    var card = rect(under, cardX, cardY, cardW, 10, 'gl-card');
    if (wideCard) {
      var lx = cardX + 16;
      h.label(top, lx, cardY + 28, 'Chance harmful', 'gl-k');
      var big = h.label(top, lx, cardY + 66, '', 'gl-big');
      bars.push(bar(lx, cardY + 82, leftW, Q, 'q', big));
      h.svgEl('line', { 'class': 'gl-rule', x1: lx + leftW + 20, y1: cardY + 14, x2: lx + leftW + 20, y2: cardY + 102 }, under);
      rx0 = lx + leftW + 40; ry0 = cardY + 28;
      cardH = 116;
    } else {
      rx0 = cardX + 16; ry0 = cardY + 28;
      var qv = h.label(top, cardX + cardW - 16, ry0, '', 'gl-v q', { 'text-anchor': 'end' });
      h.label(top, rx0, ry0, 'Chance harmful', 'gl-m');
      var qx = rx0 + Math.max(nameW, measure('Chance harmful', 'gl-m')) + 12;
      bars.push(bar(qx, ry0 - 9, cardX + cardW - 16 - valW - 10 - qx, Q, 'q', qv));
      ry0 += 34;
      cardH = 34 + 28 + ROW * 3 + 12;
    }
    var rw = cardX + cardW - 16 - rx0;
    h.label(top, rx0, ry0, heading, 'gl-k');
    M.forEach(function (m, i) {
      var y = ry0 + ROW * (i + 1);
      h.label(top, rx0, y, m.name, 'gl-m');
      var v = h.label(top, rx0 + rw, y, '', 'gl-v', { 'text-anchor': 'end' });
      var bx = rx0 + nameW + 12;
      bars.push(bar(bx, y - 9, rx0 + rw - valW - 10 - bx, PH[i], 'c' + m.tier, v));
    });
    card.setAttribute('height', cardH);
    var end1 = cardY + cardH + IN;
    box1.setAttribute('height', end1 - y1);

    /* ------------------------------- panel 2: pick a setting, get a circuit */
    var y2 = end1 + GAP, box2 = panel(y2, '2', 'Pick a setting, get a circuit');
    var p2 = {};
    var optW = Math.max.apply(null, SETTINGS.map(function (s) { return measure(s.name, null, 'gl-opt on'); }));
    var setW = Math.ceil(optW) + 50, setH = 88;
    var dpW = 108, dpH = 60;
    var col2 = Math.max(labW, 48);
    var side2 = (CW - col2 - dpW - setW) / 2;
    var row2 = y2 + HEAD, dpX, dpY, net2, setX, setY;
    if (side2 >= 26) {
      // classifier -> dynamic program <- setting
      var wl2 = Math.min(64, side2), x02 = IN + (CW - (col2 + wl2 + dpW + wl2 + setW)) / 2;
      var mid = row2 + setH / 2;
      dpX = x02 + col2 + wl2; dpY = mid - dpH / 2;
      setX = dpX + dpW + wl2; setY = row2;
      net2 = net(x02 + col2 / 2, mid - 10, .8);
      h.label(top, x02 + col2 / 2, net2.b + 20, 'Prompt classifier', 'gl-name', { 'text-anchor': 'middle' });
      p2.n = wire('M' + (net2.r + 6) + ',' + (mid - 10) + ' C' + (dpX - wl2 / 2) + ',' + (mid - 10) + ' ' + (dpX - wl2 / 2) + ',' + mid + ' ' + (dpX - 2) + ',' + mid);
      p2.s = wire('M' + setX + ',' + mid + ' H' + (dpX + dpW + 2));
    } else {
      // the setting on top, wired down into the dynamic program; the classifier to its left
      setX = IN + (CW - setW) / 2; setY = row2;
      var g2 = Math.min(48, (CW - col2 - dpW) / 2), xg = IN + (CW - col2 - g2 - dpW) / 2;
      dpX = xg + col2 + g2; dpY = setY + setH + LINK;
      var nm = dpY + dpH / 2;
      net2 = net(xg + col2 / 2, nm - 10, .8);
      h.label(top, xg + col2 / 2, net2.b + 20, 'Prompt classifier', 'gl-name', { 'text-anchor': 'middle' });
      p2.n = wire('M' + (net2.r + 6) + ',' + (nm - 10) + ' C' + (dpX - g2 / 2) + ',' + (nm - 10) + ' ' + (dpX - g2 / 2) + ',' + nm + ' ' + (dpX - 2) + ',' + nm);
      p2.s = wire(down(dpX + dpW / 2, setY + setH, dpX + dpW / 2, dpY - 2));
    }
    // the setting: two options, one picked
    rect(under, setX, setY, setW, setH, 'gl-pill');
    h.label(top, setX + 16, setY + 25, 'Setting', 'gl-k');
    var opts = SETTINGS.map(function (s, k) {
      var og = h.svgEl('g', { 'class': 'gl-opt' }, top), oy = setY + 50 + k * 24;
      h.svgEl('circle', { 'class': 'gl-radio', cx: setX + 23, cy: oy - 5, r: 7 }, og);
      h.svgEl('circle', { 'class': 'gl-dot', cx: setX + 23, cy: oy - 5, r: 3.5 }, og);
      h.label(og, setX + 38, oy, s.name);
      // each setting is a button: picking it reruns the dynamic program for that setting
      og.setAttribute('role', 'button');
      og.setAttribute('tabindex', '0');
      og.setAttribute('aria-label', s.name);
      og.addEventListener('click', function () { choose(k); });
      og.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(k); }
      });
      return og;
    });
    function pick(k) { opts.forEach(function (o, j) { o.classList.toggle('on', j === k); }); }
    // the dynamic program
    var dp = rect(under, dpX, dpY, dpW, dpH, 'gl-dp');
    var dpt = h.label(top, dpX + dpW / 2, dpY + 26, '', 'gl-dp-t', { 'text-anchor': 'middle' });
    h.svgEl('tspan', { x: dpX + dpW / 2, dy: 0 }, dpt).textContent = 'Dynamic';
    h.svgEl('tspan', { x: dpX + dpW / 2, dy: 19 }, dpt).textContent = 'program';

    // the circuit it returns, on a board below
    var bY = Math.max(dpY + dpH, net2.b + 26, setY + setH) + LINK, bX = IN, bW = CW;
    p2.d = wire(down(dpX + dpW / 2, dpY + dpH, dpX + dpW / 2, bY - 2));
    var board = rect(under, bX, bY, bW, 10, 'gl-board');
    h.label(top, bX + 14, bY + 25, 'Circuit for this prompt', 'gl-bk');
    var costInline = measure('Circuit for this prompt', 'gl-bk') + measure('Cost ' + h.price(Math.max(RUNS[0].cost, RUNS[1].cost)), 'gl-cost') + 44 <= bW;
    var costT = h.label(top, costInline ? bX + bW - 14 : bX + 14, costInline ? bY + 25 : bY + 46, '', 'gl-cost',
      costInline ? { 'text-anchor': 'end' } : {});
    var cTop = bY + (costInline ? 40 : 60);

    /* One circuit: the models it asks (or a note that it asks none), then the
       prediction, in a row when they fit. A narrow board leaves "per 1M prompts"
       to the cost line above; one narrower still stacks the blocks. */
    var nameW2 = Math.max.apply(null, M.map(function (m) { return measure(m.name, 'st-name', 'station'); }));
    var stFull = Math.ceil(Math.max(measure(h.price(M[2].cost), 'st-sub', 'station'), nameW2)) + 30;
    var stShort = Math.ceil(nameW2) + 30, bin = bW - 28, lw = 24;
    var circuits = RUNS.map(function (run) {
      var cg = h.svgEl('g', {}, top), n = Math.max(1, run.asks.length);
      function fits(sw) { return n * (sw + lw) + PRED_W <= bin; }
      var across = fits(stFull) || fits(stShort), unit = fits(stFull), stW = unit || !across ? stFull : stShort;
      var blocks = [], links = [], x, y;
      if (across) { x = bX + 14 + (bin - (n * stW + n * lw + PRED_W)) / 2; y = cTop; }
      else { x = bX + 14 + (bin - stW) / 2; y = cTop; }
      for (var j = 0; j < n; j++) {
        var a = run.asks[j], bg = h.svgEl('g', {}, cg), b = { g: bg, x: x, y: y };
        if (a) {
          var st = kit.station(bg, x, y, M[a.i], { w: stW, h: ST_H, unit: unit || !across });
          st.g.querySelector('.st-sub').setAttribute('y', 46);
          b.ans = h.label(st.g, 14, 68, a.x ? 'says harmful' : 'says safe', 'st-sub');
          b.st = st;
        } else {
          rect(bg, x, y, stW, ST_H, 'gl-none');
          h.label(bg, x + stW / 2, y + ST_H / 2 + 5, 'No model asked', 'gl-none-t', { 'text-anchor': 'middle' });
        }
        blocks.push(b);
        if (across) { links.push(kit.wire(cg, 'M' + (x + stW) + ',' + (y + ST_H / 2) + ' H' + (x + stW + lw - 2), { arrow: true })); x += stW + lw; }
        else { links.push(kit.wire(cg, 'M' + (x + stW / 2) + ',' + (y + ST_H) + ' V' + (y + ST_H + lw - 2), { arrow: true })); y += ST_H + lw; }
      }
      var px = across ? x : bX + 14 + (bin - PRED_W) / 2, pw = across ? PRED_W : stW;
      var pg = h.svgEl('g', {}, cg);
      rect(pg, px, y, pw, ST_H, 'gl-pred', 12);
      h.label(pg, px + pw / 2, y + 35, run.predict ? 'Harmful' : 'Safe', 'gl-pred-t', { 'text-anchor': 'middle' });
      h.label(pg, px + pw / 2, y + 58, h.pct(run.q) + ' chance', 'gl-pred-s', { 'text-anchor': 'middle' });
      return { g: cg, blocks: blocks, links: links, pred: pg, run: run, bottom: y + ST_H };
    });
    var bH = Math.max.apply(null, circuits.map(function (c) { return c.bottom; })) + 16 - bY;
    board.setAttribute('height', bH);
    var end2 = bY + bH + IN;
    box2.setAttribute('height', end2 - y2);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + Math.ceil(end2 + 2 * PAD));

    /* ---------------------------------------------------------- the run */
    var all = [p1.a, p1.b, p1.out, p2.n, p2.s, p2.d];
    function fade(node, on, alive) {
      return h.tween(320, function (t) { if (alive()) node.style.opacity = on ? t : 1 - t; });
    }
    function reset() {
      all.forEach(function (x) { x.live(false); });
      [net1, net2].forEach(function (n) { n.g.classList.add('idle'); });
      bars.forEach(function (b) { b(0); });
      dp.classList.remove('on');
      pick(0);
      costT.textContent = '';
      circuits.forEach(function (c) {
        c.g.style.opacity = 0;
        c.links.forEach(function (l) { l.live(false); });
        c.blocks.forEach(function (b) { b.g.style.opacity = 0; if (b.st) b.st.state(''); if (b.ans) b.ans.style.opacity = 0; });
        c.pred.style.opacity = 0;
      });
    }
    reset();

    // one setting: the dynamic program runs, its circuit appears and runs on the prompt
    async function circuit(k, alive) {
      var c = circuits[k];
      p2.n.live(true); p2.s.live(true);
      await h.sleep(650); if (!alive()) return;
      dp.classList.add('on');
      await h.sleep(500); if (!alive()) return;
      p2.d.live(true);
      costT.textContent = 'Cost ' + h.price(c.run.cost);
      c.g.style.opacity = 1;
      for (var j = 0; j < c.blocks.length; j++) {
        var b = c.blocks[j];
        await fade(b.g, true, alive); if (!alive()) return;
        if (b.st) {
          b.st.state('active');
          await h.sleep(650); if (!alive()) return;
          await fade(b.ans, true, alive); if (!alive()) return;
          b.st.state('');
        }
        c.links[j].live(true);
        await h.sleep(500); if (!alive()) return;
      }
      await fade(c.pred, true, alive);
    }

    // a setting picked by hand: panel 1 stands fitted, and only the dynamic program reruns
    var token = 0;
    function choose(k) {
      var mine = ++token;
      var alive = function () { return mine === token && svg.isConnected; };
      reset();
      net1.g.classList.remove('idle'); net2.g.classList.remove('idle');
      bars.forEach(function (b) { b(1); });
      pick(k);
      circuit(k, alive);
    }

    return async function play(run) {
      var mine = ++token;
      var alive = function () { return run() && mine === token; };
      reset();
      await h.sleep(300); if (!alive()) return;
      p1.a.live(true); p1.b.live(true);
      await h.sleep(700); if (!alive()) return;
      net1.g.classList.remove('idle');
      await h.sleep(400); if (!alive()) return;
      p1.out.live(true);
      await h.tween(800, function (t) { if (alive()) bars.forEach(function (b) { b(t); }); });
      if (!alive()) return;
      await h.sleep(500); if (!alive()) return;
      // fitted once: panel 1 goes quiet, and the classifier is used as it is
      p1.a.live(false); p1.b.live(false); p1.out.live(false);
      net2.g.classList.remove('idle');
      await circuit(0, alive); if (!alive()) return;
      await h.sleep(1900); if (!alive()) return;
      // a new setting reruns only the dynamic program
      p2.d.live(false); dp.classList.remove('on'); costT.textContent = '';
      await fade(circuits[0].g, false, alive); if (!alive()) return;
      pick(1);
      await h.sleep(350); if (!alive()) return;
      await circuit(1, alive);
    };
  });
})();
