/* fig-question: the two questions, asked by a small circuit.

   A prompt faces a pool of six models from the paper's pools. The drawing
   follows the two questions above it and highlights each in turn:
     1  Which LLMs should we ask,     the signal tries a few models and picks one;
        and in what order?            then three models are asked in turn, numbered
                                      1, 2, 3, and the order is shuffled once
     2  When should we stop?          answers arrive in the new order, the chance
                                      harmful fills, and the circuit stops before
                                      the third model and predicts
   It loops while on screen and starts again from question 1 after a pause off
   screen. With reduced motion (or ?still, ?qa) the questions stay in full ink
   and the drawing shows the last frame: the numbered path, two answers and
   the prediction.

   The figure asks rather than answers, so it shows no numbers: no prices (the
   Qwen3 models reason before they answer, so their cost per prompt is not just
   their input price) and no percentages. The answers are illustrative.

   Wide: the prompt on the left, a fan of wires into a column of models, their
   answers beside them, and on the right the confidence bar over the
   prediction. Narrow: the prompt on top, a wire down the left edge into the
   column, and the answers joining a wire down the right edge into the
   prediction under it. Drawn at one unit per CSS pixel. */
(function () {
  'use strict';
  var h = LC.h, kit = LC.kit, M = LC.MODELS, el = h.svgEl;

  // the BeaverTails pool's Gemma 4 and Qwen3 models, plus Jev, the decision model of the noisy figure;
  // tiers (block colours) follow their rough cost
  var POOL = [M[0], M[1], M[2],
    { name: 'Qwen3 4B', tier: 0 },
    { name: 'Qwen3 32B', tier: 2 },
    { name: 'Jev', tier: 1 }];
  var TRY = [4, 1, 3];          // question 1: the models the signal tries,
  var TRY_MS = [560, 470, 620]; //   and how long it stays on each,
  var PICK = 0;                 //   before it picks Gemma 4 E4B
  var PLAN = [0, 5, 2];         //   then asked in this order (E4B, Jev, 31B),
  var SHUFFLE = [2, 0, 5];      //   then in this one (31B, E4B, Jev)
  var ASKED = 2;                // question 2: two answers, then it stops before the third
  var SAYS = 1;                 // both say harmful (only Gemma models answer, so LC.belief has their accuracy)
  var CHIP_W = 92;              // kit.chip width of HARMFUL
  var R = 11;                   // a number badge's radius
  var PAD = 1.5;                // keeps outer strokes inside the viewBox
  var SIDE_MIN = 840;           // narrower than this, the stacked layout
  var STACK_MAX = 440;          // the stacked layout is drawn at most this wide
  var TASK = 'Is this prompt harmful?';

  /* Rewrap the card's quote at the narrowest width that keeps its line count,
     so no word is left alone on the last line. The card's height still fits. */
  function balance(t, str, width) {
    var n = h.wrap(t, str, width, 21), lo = width / 2, hi = width;
    while (hi - lo > 2) {
      var mid = (lo + hi) / 2;
      if (h.wrap(t, str, mid, 21) > n) lo = mid; else hi = mid;
    }
    h.wrap(t, str, hi, 21);
  }

  /* The confidence bar: the chance the prompt is harmful, from safe to
     harmful, filled from the middle out to the marker. No number on it. */
  function confidence(parent, x, y, w) {
    var g = el('g', { 'class': 'q-bar', transform: 'translate(' + x + ',' + y + ')' }, parent);
    h.label(g, 0, 0, 'Chance harmful', 'q-k');
    el('rect', { 'class': 'q-track', x: 0, y: 12, width: w, height: 12, rx: 6 }, g);
    var fill = el('rect', { 'class': 'q-fill', x: w / 2, y: 12, width: 0, height: 12 }, g);
    el('line', { 'class': 'q-mid', x1: w / 2, y1: 7, x2: w / 2, y2: 29 }, g);
    var mk = el('circle', { 'class': 'q-mk', cx: w / 2, cy: 18, r: 9 }, g);
    h.label(g, 0, 47, 'safe', 'q-end');
    h.label(g, w, 47, 'harmful', 'q-end', { 'text-anchor': 'end' });
    var cur = .5, moves = 0;
    function place(q) {
      var px = Math.max(6, Math.min(w - 6, w * q));
      mk.setAttribute('cx', px);
      fill.setAttribute('x', Math.min(px, w / 2));
      fill.setAttribute('width', Math.abs(px - w / 2));
    }
    place(cur);
    return {
      // a newer set() cancels a move still running
      set: function (q, ms) {
        var id = ++moves, from = cur;
        cur = q;
        if (!ms) { place(q); return Promise.resolve(); }
        return h.tween(ms, function (t) { if (id === moves) place(from + (q - from) * t); });
      }
    };
  }

  LC.figure('question', function (fig, ctx) {
    h.head(fig, '');
    fig.classList.toggle('q-still', !!ctx.reduce);
    var ask = fig.parentNode ? fig.parentNode.querySelector('.ask') : null;
    var spans = ask ? ask.querySelectorAll('[data-q]') : [];

    var cs = getComputedStyle(fig);
    var inner = ctx.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var side = !ctx.narrow && inner >= SIDE_MIN;
    var W = Math.round(side ? inner : Math.max(290, Math.min(inner, STACK_MAX)));
    var svg = h.makeSvg(fig, W, 300);
    // the stacked layout keeps one unit per pixel in a wider figure (a tablet) and sits centred
    svg.style.maxWidth = side ? '' : W + 'px';
    var g = el('g', { transform: 'translate(' + PAD + ',' + PAD + ')' }, svg);
    var w = W - 2 * PAD;
    var wireG = el('g', {}, g), outG = el('g', {}, g), boardG = el('g', {}, g);
    var chipG = el('g', { 'class': 'q-x' }, g), pulseG = el('g', {}, g);

    /* ---------------------------------------------------------- layout */

    var cardW = side ? Math.round(Math.max(210, Math.min(250, w * .23))) : w;
    var card = kit.promptCard(boardG, 0, 0, cardW, LC.PROMPTS.hard.text, { title: TASK });
    balance(card.text, '“' + LC.PROMPTS.hard.text + '”', cardW - 32);

    // every block is as wide as the longest name plus its number badge
    var probe = el('g', { 'class': 'station' }, g), nameW = 0;
    POOL.forEach(function (m) { nameW = Math.max(nameW, h.label(probe, 0, 0, m.name, 'st-name').getComputedTextLength()); });
    probe.remove();
    var bwMin = Math.ceil(14 + nameW + 12 + 2 * R + 8);

    var n = POOL.length, rowH, gap, top, bx, bw, chipL, pred = {}, bar = {}, H, J = null;
    var inPath, outPath;
    if (side) {
      rowH = 40; gap = 8; top = 0;
      var colH = n * rowH + (n - 1) * gap, mid = colH / 2;
      bw = Math.max(bwMin, 176);
      pred.w = 200; pred.h = 64;
      // the two fans take what is left, and the whole drawing is centred
      var fixed = cardW + 18 + bw + 14 + CHIP_W + pred.w, rest = w - fixed;
      var fanOut = Math.max(70, Math.min(170, rest * .55)), fanIn = Math.max(60, Math.min(140, rest - fanOut));
      var x0 = Math.max(0, (w - fixed - fanOut - fanIn) / 2);
      card.g.setAttribute('transform', 'translate(' + x0 + ',' + (mid - card.h / 2) + ')');
      J = { x: x0 + cardW + 18, y: mid };
      bx = J.x + fanOut;
      chipL = bx + bw + 14;
      pred.x = chipL + CHIP_W + fanIn; pred.y = mid - pred.h / 2;
      bar.x = pred.x; bar.w = pred.w; bar.y = pred.y - 84;
      H = colH;
      inPath = function (cy) { return h.curve(J.x, J.y, bx, cy); };
      outPath = function (cy, cw) { return h.curve(chipL + cw + 8, cy, pred.x, pred.y + pred.h / 2); };
    } else {
      rowH = 34; gap = 6; top = card.h + 18;
      var SPINE = 8, BUS = w - 6, BEND = 8;
      bx = 26; chipL = w - 20 - CHIP_W; bw = chipL - 10 - bx;
      var colBottom = top + n * rowH + (n - 1) * gap;
      pred.w = 128; pred.h = 52; pred.x = w - 16 - pred.w; pred.y = colBottom + 26;
      bar.x = 0; bar.w = pred.x - 28; bar.y = pred.y + 10;
      H = pred.y + Math.max(pred.h, 61);
      // the spine starts under the card, which is drawn on top of it
      inPath = function (cy) {
        return 'M' + SPINE + ',' + (card.h - 4) + ' V' + (cy - BEND) + ' Q' + SPINE + ',' + cy + ' ' + (SPINE + BEND) + ',' + cy + ' H' + bx;
      };
      outPath = function (cy, cw) {
        var pcy = pred.y + pred.h / 2;
        return 'M' + (chipL + cw + 6) + ',' + cy + ' H' + (BUS - BEND) + ' Q' + BUS + ',' + cy + ' ' + BUS + ',' + (cy + BEND) +
          ' V' + (pcy - BEND) + ' Q' + BUS + ',' + pcy + ' ' + (BUS - BEND) + ',' + pcy + ' H' + (pred.x + pred.w);
      };
    }
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + Math.ceil(H + 2 * PAD));

    // the prompt's wire to the fan (wide only), and the fan's junction
    var trunk = side ? el('path', { 'class': 'cw', d: 'M' + (J.x - 20) + ',' + J.y + ' H' + J.x }, wireG) : null;

    var rows = POOL.map(function (m, k) {
      var y = top + k * (rowH + gap), cy = y + rowH / 2;
      var s = kit.station(boardG, bx, y, m, { w: bw, h: rowH, compact: true });
      var bcx = bw - 8 - R, bcy = rowH / 2;
      var badge = el('g', { 'class': 'q-badge q-x' }, s.g);
      el('circle', { cx: bcx, cy: bcy, r: R }, badge);
      var num = h.label(badge, bcx, bcy + 5, '', 'q-num', { 'text-anchor': 'middle' });
      var wire = el('path', { 'class': 'cw', d: inPath(cy) }, wireG);
      return { s: s, y: y, cy: cy, badge: badge, num: num, wire: wire };
    });
    if (side) el('circle', { 'class': 'q-j', cx: J.x, cy: J.y, r: 4 }, g);

    // the answers that reach the prediction (built once: the story is the same every loop)
    var outs = SHUFFLE.slice(0, ASKED).map(function (k) {
      var p = el('path', { 'class': 'cw q-x', d: outPath(rows[k].cy, SAYS ? CHIP_W : 64) }, outG);
      p.style.opacity = 0;
      return p;
    });

    var predG = el('g', { 'class': 'q-pred', transform: 'translate(' + pred.x + ',' + pred.y + ')' }, boardG);
    el('rect', { 'class': 'q-slot', x: 0, y: 0, width: pred.w, height: pred.h, rx: 14 }, predG);
    el('rect', { 'class': 'q-pred-b', x: 0, y: 0, width: pred.w, height: pred.h, rx: 14 }, predG);
    h.label(predG, side ? 18 : 14, side ? 26 : 21, 'Prediction', 'q-pred-k');
    h.label(predG, side ? 18 : 14, side ? 49 : 42, SAYS ? 'Harmful' : 'Safe', 'q-pred-v');

    var meter = confidence(boardG, bar.x, bar.y, bar.w);

    /* ---------------------------------------------------------- states */

    function wire(k, s) { rows[k].wire.setAttribute('class', 'cw' + (s ? ' ' + s : '')); }
    function block(k, s) { rows[k].s.state(s); }
    function trunkState(s) { if (trunk) trunk.setAttribute('class', 'cw' + (s ? ' ' + s : '')); }
    // a badge only fades: a growing disc would be smaller than its number for a moment
    function badgeAt(k, t) { rows[k].badge.style.opacity = t; }
    function setQ(q) {
      if (!ask) return;
      ask.classList.toggle('q-live', q > 0);
      Array.prototype.forEach.call(spans, function (s) { s.classList.toggle('on', +s.dataset.q === q); });
    }
    function addChip(k) {
      var cw = SAYS ? CHIP_W : 64, cx = chipL + cw / 2, cy = rows[k].cy;
      var c = kit.chip(chipG, cx, cy, SAYS);
      return { g: c, cx: cx, cy: cy };
    }
    // an answer slides out of its model as it fades in (a slide, not a scale, keeps its text at size)
    function chipAt(c, t) {
      c.g.setAttribute('transform', 'translate(' + (-8 * (1 - t)) + ',0)');
      c.g.style.opacity = t;
    }
    // what the circuit believes after the answers of the first j models in the new order
    function beliefAfter(j) {
      var q = .5;
      for (var i = 0; i < j; i++) q = LC.belief.post(q, SHUFFLE[i], SAYS);
      return q;
    }
    // a badge keeps its number while it fades out (popBadge sets the next one)
    function reset() {
      rows.forEach(function (b, k) { block(k, ''); wire(k, ''); badgeAt(k, 0); });
      trunkState('');
      outs.forEach(function (p) { p.setAttribute('class', 'cw q-x'); p.style.opacity = 0; });
      chipG.textContent = '';
      predG.classList.remove('on');
      meter.set(.5);
    }
    // the last frame, at once: the path taken, its two answers and the prediction
    function still() {
      reset();
      setQ(0);
      rows.forEach(function (b, k) {
        var j = SHUFFLE.indexOf(k);
        if (j < 0 || j >= ASKED) { block(k, 'dim'); wire(k, 'off'); return; }
        b.num.textContent = j + 1;
        badgeAt(k, 1);
        wire(k, 'on');
        chipAt(addChip(k), 1);
      });
      trunkState('on');
      outs.forEach(function (p) { p.setAttribute('class', 'cw q-x on'); p.style.opacity = 1; });
      predG.classList.add('on');
      meter.set(beliefAfter(ASKED));
    }
    reset();

    /* ------------------------------------------------------------ steps */

    async function wait(ms, ok) { await h.sleep(ms); return ok(); }
    function popBadge(k, num, ok) {
      rows[k].num.textContent = num;
      return h.tween(300, function (t) { if (ok()) badgeAt(k, t); });
    }
    function dropBadge(k, ok) { return h.tween(240, function (t) { if (ok()) badgeAt(k, 1 - t); }); }
    // the signal runs along a model's wire; the model lights up once it arrives
    async function send(k, ms, ok) {
      wire(k, 'live');
      await h.pulse(pulseG, rows[k].wire, ms, ok);
      if (!ok()) return false;
      block(k, 'active');
      return true;
    }
    function settle(k) { block(k, ''); wire(k, 'on'); }

    /* One pass through the two questions. ok() turns false when the run is
       replaced or the figure leaves the screen; the pass then stops early. */
    async function once(ok) {
      var j, k;
      // 1. Which LLMs should we ask, and in what order? The signal tries a
      // few and picks one; then three in turn, then a new order.
      setQ(1);
      if (!await wait(900, ok)) return false;
      trunkState('live');
      for (j = 0; j < TRY.length; j++) {
        k = TRY[j];
        wire(k, 'live'); block(k, 'active');
        if (!await wait(TRY_MS[j], ok)) return false;
        wire(k, ''); block(k, '');
        if (!await wait(150, ok)) return false;
      }
      if (!await send(PICK, 650, ok) || !await wait(1300, ok)) return false;

      if (!await wait(300, ok)) return false;
      for (j = 0; j < PLAN.length; j++) {
        k = PLAN[j];
        if (j) { settle(PLAN[j - 1]); if (!await send(k, 550, ok)) return false; }
        await popBadge(k, j + 1, ok);
        if (!await wait(650, ok)) return false;
      }
      settle(PLAN[PLAN.length - 1]);
      if (!await wait(900, ok)) return false;
      await Promise.all(PLAN.map(function (i) { return dropBadge(i, ok); }));
      if (!await wait(350, ok)) return false;
      for (j = 0; j < SHUFFLE.length; j++) {
        k = SHUFFLE[j];
        wire(k, 'live'); block(k, 'active');
        await popBadge(k, j + 1, ok);
        if (!await wait(420, ok)) return false;
        settle(k);
        if (!await wait(130, ok)) return false;
      }
      if (!await wait(1000, ok)) return false;

      // 2. When should we stop? Answers arrive and the bar fills; the circuit
      // leans toward the third model, then stops and predicts. The numbers stay
      // as the plan; the wires light again only as each model is really asked.
      setQ(2);
      SHUFFLE.forEach(function (i) { wire(i, ''); });
      if (!await wait(600, ok)) return false;
      for (j = 0; j < ASKED; j++) {
        k = SHUFFLE[j];
        if (!await send(k, 550, ok) || !await wait(350, ok)) return false;
        var c = addChip(k);
        chipAt(c, 0);
        await h.tween(280, function (t) { if (ok()) chipAt(c, t); });
        await meter.set(beliefAfter(j + 1), 700);
        if (!ok()) return false;
        settle(k);
        if (!await wait(550, ok)) return false;
      }
      k = SHUFFLE[ASKED];
      wire(k, 'live'); block(k, 'active');
      if (!await wait(850, ok)) return false;
      wire(k, ''); block(k, '');
      await dropBadge(k, ok);
      if (!await wait(250, ok)) return false;
      rows.forEach(function (b, i) {
        var used = SHUFFLE.indexOf(i);
        if (used < 0 || used >= ASKED) { block(i, 'dim'); wire(i, 'off'); }
        else wire(i, 'live');
      });
      outs.forEach(function (p) { p.setAttribute('class', 'cw q-x live'); });
      await h.tween(400, function (t) { if (ok()) outs.forEach(function (p) { p.style.opacity = t; }); });
      if (!ok()) return false;
      predG.classList.add('on');
      return wait(3200, ok);
    }

    // between passes, what the last one added fades out before it is cleared;
    // after a Replay the new run has already reset, so this one leaves it alone
    async function swap(alive) {
      svg.classList.add('q-swap');
      predG.classList.remove('on');
      rows.forEach(function (b, k) { block(k, ''); wire(k, ''); });
      trunkState('');
      meter.set(.5, 450);
      await h.sleep(500);
      if (alive()) reset();
      svg.classList.remove('q-swap');
      await h.sleep(300);
    }

    return async function play(alive) {
      if (ctx.reduce) { still(); return; }
      // pause off screen; each run watches for itself, so a Replay keeps watching
      var seen = true, io = null;
      if ('IntersectionObserver' in window) {
        io = new IntersectionObserver(function (es) { seen = es[es.length - 1].isIntersecting; }, { threshold: 0.2 });
        io.observe(fig);
      }
      var ok = function () { return alive() && seen; };
      reset();
      try {
        while (alive()) {
          while (alive() && !seen) await new Promise(function (r) { setTimeout(r, 250); });
          if (!alive()) break;
          var done = await once(ok);
          if (!alive()) break;
          if (done) await swap(alive); else reset();   // left the screen: start over from question 1
        }
      } finally {
        if (io) io.disconnect();
      }
    };
  });
})();
