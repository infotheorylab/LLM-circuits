/* fig-router: what the prompt classifier changes.

   Two prompts, easy and hard, side by side (stacked when the figure is narrow).
   For each, the prompt classifier reads the prompt and gives two things: the
   chance the prompt is harmful, and each model's chance of being right on
   this prompt. Below it, the path the circuit then takes. The paths come from
   LC.dp.runPrompt and the comparison from LC.dp.runBlind, so the figure follows
   LC.PROMPTS if those illustrative numbers change. The drawing uses the
   circuits' pieces: wires that carry a moving dashed signal, solid model
   blocks, the network icon for the prompt classifier and a navy prediction.

   The drawing is made at the figure's own width (one unit per CSS pixel), so
   type keeps its size; below SIDE_MIN units the two columns are stacked. */
(function () {
  'use strict';
  var h = LC.h, kit = LC.kit, M = LC.MODELS;

  var PAD = 1.5;                 // keeps the outer strokes inside the viewBox
  var IN = 14;                   // inner padding of the classifier box
  var ROW = 24;                  // one model row in the box
  var BOX_H = 116 + 2 * ROW + 14;
  var LINK = 22;                 // prompt card to classifier box
  var STEM = 24;                 // between the steps of the circuit's path
  var ST_W = 156, ST_H = 52;     // a model station
  var NOTE_H = 40;               // in place of a station: "No model asked"
  var PRED_W = 150, PRED_H = 54; // the prediction block, as in the circuits figure
  var NET_S = 0.42;              // the classifier's icon in its title row, about 23 x 25
  var SIDE_MIN = 456;            // narrower than this, "Chance each model is right" no longer fits a column

  var PROMPTS = [
    { name: 'easy', title: 'Easy prompt' },
    { name: 'hard', title: 'Hard prompt' }
  ];

  // what a path spends, in dollars per million prompts
  function spentOf(steps) {
    return steps.reduce(function (c, s) { return c + (s.act === 'ask' ? M[s.i].cost : 0); }, 0);
  }

  /* Rewrap a card's quote at the narrowest width that keeps its line count,
     so no word is left alone on the last line. The card's height still fits. */
  function balance(t, str, width) {
    var n = h.wrap(t, str, width, 21), lo = width / 2, hi = width;
    while (hi - lo > 2) {
      var mid = (lo + hi) / 2;
      if (h.wrap(t, str, mid, 21) > n) lo = mid; else hi = mid;
    }
    h.wrap(t, str, hi, 21);
  }

  // the signal moves; with reduced motion the wire stays dashed and still
  function flow(el, on) {
    el.classList.toggle('live', on);
    el.style.animation = on && LC.REDUCE ? 'none' : '';
  }
  // the moving dashes rest while the figure is off screen
  function pauseOffscreen(fig) {
    if (fig._lcPause || !('IntersectionObserver' in window)) return;
    fig._lcPause = new IntersectionObserver(function (es) { fig.classList.toggle('lc-paused', !es[es.length - 1].isIntersecting); });
    fig._lcPause.observe(fig);
  }

  /* A straight wire of the circuit's path that draws itself in (its length is
     its dash), then carries the moving signal. */
  function segment(g, x, y1, y2) {
    var p = h.svgEl('path', { 'class': 'cw rt-path', d: 'M' + x + ',' + y1 + ' L' + x + ',' + y2 }, g);
    var len = y2 - y1;
    return {
      el: p, len: len,
      set: function (t) {
        flow(p, t >= 1 && len > 0);
        p.style.strokeDasharray = t >= 1 ? '' : len;
        p.style.strokeDashoffset = t >= 1 ? '' : len * (1 - t);
      }
    };
  }

  function bar(g, x, y, w, v, cls, value) {
    h.svgEl('rect', { 'class': 'rt-track', x: x, y: y, width: w, height: 8, rx: 4 }, g);
    var f = h.svgEl('rect', { 'class': 'rt-fill ' + cls, x: x, y: y, width: 0, height: 8, rx: 4 }, g);
    return function (t) { f.setAttribute('width', w * v * t); value.style.opacity = t; };
  }

  /* The classifier's reading of one prompt. The rows of the models the circuit
     goes on to ask are marked, which ties the reading to the path below it. */
  function classifierBox(g, y, w, p, asked) {
    var bg = h.svgEl('g', { transform: 'translate(0,' + y + ')' }, g);
    var box = h.svgEl('rect', { 'class': 'rt-box', x: 0, y: 0, width: w, height: BOX_H, rx: 12 }, bg);
    var net = LC.kit.net(bg, IN - 2, 7, NET_S);
    h.label(bg, IN + 30, 25, 'Prompt classifier', 'rt-title');
    var bars = [], picks = [];
    h.label(bg, IN, 52, 'Chance harmful', 'rt-k');
    var qv = h.label(bg, w - IN, 52, h.pct(p.prior), 'rt-v q', { 'text-anchor': 'end' });
    bars.push(bar(bg, IN, 60, w - 2 * IN, p.prior, 'q', qv));
    h.label(bg, IN, 92, 'Chance each model is right', 'rt-k');
    var full = w - 2 * IN >= 290;            // full model names when they fit beside a usable bar
    var bx = IN + (full ? 104 : 42), bw = w - IN - 48 - bx;
    M.forEach(function (m, i) {
      var by = 116 + i * ROW;
      if (asked.indexOf(i) >= 0) {
        picks.push(h.svgEl('rect', { 'class': 'rt-pick', x: IN - 8, y: by - 17, width: w - 2 * IN + 16, height: ROW, rx: 7 }, bg));
      }
      h.label(bg, IN, by, full ? m.name : m.short, 'rt-m t-c' + m.tier);
      var v = h.label(bg, w - IN, by, h.pct(p.acc[i]), 'rt-v', { 'text-anchor': 'end' });
      bars.push(bar(bg, bx, by - 9, bw, p.acc[i], 'c' + m.tier, v));
    });
    return { box: box, net: net, bars: bars, picks: picks };
  }

  /* One column: the prompt card, the classifier box, then the circuit's path
     down to its answer and what it spent. `slots` is how many station rows to
     reserve, so that the answers of both columns line up when side by side;
     `room` is the empty width to the right of the column. */
  function column(g, x, y, cw, col, cardH, slots, slotH, stacked, room) {
    var cg = col.g, cx = cw / 2, asks = col.asks;
    cg.setAttribute('transform', 'translate(' + x + ',' + y + ')');
    col.card.g.querySelector('.pc-body').setAttribute('height', cardH);

    var link = h.svgEl('path', { 'class': 'cw rt-wire', d: 'M' + cx + ',' + cardH + ' L' + cx + ',' + (cardH + LINK) }, cg);
    var cb = classifierBox(cg, cardH + LINK, cw, col.p, asks.map(function (s) { return s.i; }));

    // the path: stems and stations, then the prediction
    var steps = [], top = cardH + LINK + BOX_H, predTop = top + slots * (STEM + slotH) + STEM;
    asks.forEach(function (s, j) {
      var last = j === asks.length - 1;
      steps.push({ seg: segment(cg, cx, top, top + STEM) });
      var st = kit.station(cg, cx - ST_W / 2, top + STEM, M[s.i], { w: ST_W, h: ST_H });
      steps.push({ st: st });
      top += STEM + ST_H;
      if (last) steps.push({ seg: segment(cg, cx, top, predTop) });
    });
    var note = null;
    if (!asks.length) {
      steps.push({ seg: segment(cg, cx, top, predTop) });
      var ny = (top + predTop) / 2 + 5;
      note = h.label(cg, cx + 12, ny, 'No model asked', 'rt-note');
      // beside the stem; it may run into empty space right of the column, else it breaks in two
      if (cx + 12 + note.getComputedTextLength() > cw + room) {
        note.textContent = '';
        h.svgEl('tspan', { x: cx + 12, y: ny - 10 }, note).textContent = 'No model';
        h.svgEl('tspan', { x: cx + 12, y: ny + 10 }, note).textContent = 'asked';
      }
    }
    // the prediction: the navy block
    var chipCY = predTop + PRED_H / 2;
    var chip = h.svgEl('g', { 'class': 'rt-pred' }, cg);
    h.svgEl('rect', { 'class': 'rt-pred-b', x: cx - PRED_W / 2, y: predTop, width: PRED_W, height: PRED_H, rx: 12 }, chip);
    h.label(chip, cx, predTop + 22, 'prediction', 'rt-pred-t', { 'text-anchor': 'middle' });
    h.label(chip, cx, predTop + 44, col.steps[col.steps.length - 1].predict ? 'HARMFUL' : 'SAFE', 'rt-pred-v', { 'text-anchor': 'middle' });
    var spentY = predTop + PRED_H + 28;
    var spent = readout(cg, cx, spentY, 'Spent', col.spent, cw + room);
    var bottom = spentY + spent.extra;
    var blind = null;
    if (stacked) {
      blind = readout(cg, cx, bottom + 26, 'Without the prompt classifier', col.blind, cw, 'rt-blind');
      bottom += 26 + blind.extra;
    }
    return {
      link: link, cb: cb, steps: steps, note: note, chip: chip, cx: cx, chipCY: chipCY,
      spent: spent.t, blind: blind && blind.t, bottom: bottom
    };
  }

  /* A readout as in the circuits figure, centred on cx: a label, the amount in
     bold and "per 1M prompts". Whatever does not fit in `room` goes to a second
     line, starting with the unit. Returns the text and its extra height. */
  function readout(g, cx, y, key, usd, room, cls) {
    var t = h.label(g, cx, y, '', 'rt-ro' + (cls ? ' ' + cls : ''), { 'text-anchor': 'middle' });
    function put(two) {
      t.textContent = '';
      h.svgEl('tspan', { 'class': 'k' }, t).textContent = key + ' ';
      h.svgEl('tspan', { 'class': 'v' }, t).textContent = h.usd(usd);
      var u = h.svgEl('tspan', { 'class': 'u' }, t);
      if (two) { u.setAttribute('x', cx); u.setAttribute('dy', 20); u.textContent = h.PER; }
      else u.textContent = ' ' + h.PER;
    }
    put(false);
    if (t.getComputedTextLength() <= room - 4) return { t: t, extra: 0 };
    put(true);
    return { t: t, extra: 20 };
  }

  LC.figure('router', function (fig, ctx) {
    h.head(fig, '');
    pauseOffscreen(fig);

    var cs = getComputedStyle(fig);
    var inner = ctx.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var W = Math.round(Math.max(280, Math.min(inner, 720)));
    var side = W >= SIDE_MIN;
    var svg = h.makeSvg(fig, W, 600);
    var g = h.svgEl('g', { transform: 'translate(' + PAD + ',' + PAD + ')' }, svg);
    var w = W - 2 * PAD;
    var gap = side ? Math.round(Math.max(20, Math.min(40, w * .05))) : 0;
    var cw = side ? (w - gap) / 2 : w;

    var cols = PROMPTS.map(function (pr) {
      var steps = LC.dp.runPrompt(pr.name);
      var col = {
        p: LC.PROMPTS[pr.name], steps: steps,
        asks: steps.filter(function (s) { return s.act === 'ask'; }),
        spent: spentOf(steps), blind: spentOf(LC.dp.runBlind(pr.name)),
        g: h.svgEl('g', {}, g)
      };
      col.card = kit.promptCard(col.g, 0, 0, cw, col.p.text, { title: pr.title });
      balance(col.card.text, '“' + col.p.text + '”', cw - 32);
      return col;
    });

    var views, H, foot = [];
    if (side) {
      // shared rows, so both answers and both totals line up
      var cardH = Math.max(cols[0].card.h, cols[1].card.h);
      var most = Math.max(cols[0].asks.length, cols[1].asks.length);
      var slotH = most ? ST_H : NOTE_H;
      views = cols.map(function (col, k) {
        return column(g, k * (cw + gap), 0, cw, col, cardH, Math.max(1, most), slotH, false, k ? 0 : gap - 6);
      });
      var lineY = Math.max(views[0].bottom, views[1].bottom) + 24;
      foot.push(h.svgEl('line', { 'class': 'rt-rule', x1: 0, y1: lineY, x2: w, y2: lineY }, g));
      foot.push(h.label(g, w / 2, lineY + 28, 'Without the prompt classifier', 'rt-blind-k', { 'text-anchor': 'middle' }));
      var extra = 0;
      views.forEach(function (v, k) {
        var r = readout(g, k * (cw + gap) + v.cx, lineY + 54, 'Spent', cols[k].blind, cw, 'rt-blind');
        foot.push(r.t);
        extra = Math.max(extra, r.extra);
      });
      H = lineY + 54 + extra + 8;
    } else {
      var y = 0;
      views = cols.map(function (col, k) {
        if (k) {
          foot.push(h.svgEl('line', { 'class': 'rt-rule', x1: 0, y1: y + 20, x2: w, y2: y + 20 }, g));
          y += 44;
        }
        var v = column(g, 0, y, cw, col, col.card.h, Math.max(1, col.asks.length), col.asks.length ? ST_H : NOTE_H, true, 0);
        y += v.bottom;
        return v;
      });
      H = y + 8;
    }
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + Math.ceil(H + 2 * PAD));

    function chipAt(v, t) {
      // pops from 90% to full size about its centre
      var s = .9 + .1 * t;
      v.chip.setAttribute('transform', 'translate(' + v.cx + ',' + v.chipCY + ') scale(' + s + ') translate(' + (-v.cx) + ',' + (-v.chipCY) + ')');
      v.chip.style.opacity = t;
    }
    function reset() {
      views.forEach(function (v) {
        v.cb.box.setAttribute('class', 'rt-box');
        flow(v.link, false); v.cb.net.classList.remove('on');
        v.cb.bars.forEach(function (set) { set(0); });
        v.cb.picks.forEach(function (r) { r.style.opacity = 0; });
        v.steps.forEach(function (s) {
          if (s.seg) s.seg.set(0);
          else { s.st.g.style.opacity = 0; s.st.state(''); }
          if (s.seg) flow(s.seg.el, false);
        });
        if (v.note) v.note.style.opacity = 0;
        chipAt(v, 0);
        v.spent.style.opacity = 0;
        if (v.blind) v.blind.style.opacity = 0;
      });
      if (side) foot.forEach(function (n) { n.style.opacity = 0; });
    }
    reset();

    function fade(node, ms, alive) {
      return h.tween(ms, function (t) { if (alive()) node.style.opacity = t; });
    }

    return async function play(alive) {
      reset();
      await h.sleep(400);
      for (var k = 0; k < views.length; k++) {
        var v = views[k];
        if (!alive()) return;
        // the classifier reads the prompt: the signal runs down into it
        flow(v.link, true); v.cb.net.classList.add('on');
        await h.sleep(600);
        if (!alive()) return;
        v.cb.box.setAttribute('class', 'rt-box lit');
        await h.tween(800, function (t) { if (alive()) v.cb.bars.forEach(function (set) { set(t); }); });
        if (!alive()) return;
        v.cb.box.setAttribute('class', 'rt-box');
        await h.sleep(250);
        await h.tween(350, function (t) { if (alive()) v.cb.picks.forEach(function (r) { r.style.opacity = t; }); });
        if (!alive()) return;
        await h.sleep(200);
        // the circuit's path, step by step
        for (var j = 0; j < v.steps.length; j++) {
          var s = v.steps[j];
          if (!alive()) return;
          if (s.seg) {
            if (v.note) fade(v.note, 600, alive);
            await h.tween(Math.max(320, s.seg.len * 4), function (t) { if (alive()) s.seg.set(t); });
          } else {
            s.st.state('active');
            await fade(s.st.g, 300, alive);
            await h.sleep(450);
          }
        }
        if (!alive()) return;
        await h.tween(280, function (t) { if (alive()) chipAt(v, t); });
        await fade(v.spent, 350, alive);
        if (v.blind) { await h.sleep(250); await fade(v.blind, 450, alive); }
        await h.sleep(500);
      }
      if (!alive() || !side) return;
      await Promise.all(foot.map(function (n) { return fade(n, 600, alive); }));
    };
  });
})();
