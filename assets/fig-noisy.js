/* fig-noisy: one prompt, four calls, two answers.

   The hard prompt goes to Gemma 4 E4B twice, to the decision model Jev and to
   Gemma 4 31B. Each call appears in turn as a row (the model, a wire, its
   answer), then one line sums it up. The answers are illustrative: no recorded
   calls for this prompt are available yet, and the caption says so.

   One layout serves every width: the rows fit side by side down to about 300
   units, so the narrow build only narrows the viewBox to the figure's own width
   and keeps one unit per CSS pixel. */
(function () {
  'use strict';
  var h = LC.h, kit = LC.kit;

  // a decision model returns a label and its probability, no text. TypeSafe's
  // list price for Jev: $0.042 per million input tokens, output free.
  var JEV = { id: 'jev', name: 'Jev', short: 'Jev', tier: 1, price: .042, cost: 42 };
  var CALLS = [
    { m: LC.MODELS[0], x: 1 },
    { m: LC.MODELS[0], x: 0, note: 'again' },
    { m: JEV, x: 0, note: 'decision model' },
    { m: LC.MODELS[2], x: 1 }
  ];
  var PAD = 1.5;               // keeps the outer strokes inside the viewBox
  var ROW_H = 52, ROW_GAP = 16, HARMFUL_W = 92;

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

  LC.figure('noisy', function (fig, ctx) {
    h.head(fig, '');

    // draw at the figure's own width (capped, so a wide single column scales up a little)
    var cs = getComputedStyle(fig);
    var inner = ctx.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var W = Math.round(Math.max(300, Math.min(inner, 600)));
    var svg = h.makeSvg(fig, W, 400);
    var g = h.svgEl('g', { transform: 'translate(' + PAD + ',' + PAD + ')' }, svg);
    var w = W - 2 * PAD;

    var card = kit.promptCard(g, 0, 0, w, LC.PROMPTS.hard.text, { title: 'Is this prompt harmful?' });
    balance(card.text, '“' + LC.PROMPTS.hard.text + '”', w - 32);

    var top = card.h + 26;
    // the station needs 200 units for its name, price and note; the wire takes what is left
    var stW = Math.max(200, Math.min(212, w - HARMFUL_W - 48));
    var chipL = w - HARMFUL_W;                         // answers left-aligned in one column
    var wx0 = stW + 10, wx1 = chipL - 10, wired = wx1 - wx0 >= 16;   // on the smallest phones, no wire
    var rows = CALLS.map(function (c, i) {
      var y = top + i * (ROW_H + ROW_GAP), cy = y + ROW_H / 2;
      var rg = h.svgEl('g', {}, g);
      var st = kit.station(rg, 0, y, c.m, { w: stW, h: ROW_H });
      if (c.note) h.label(st.g, stW - 12, 22, c.note, 'nz-note', { 'text-anchor': 'end' });
      var wire = wired ? h.svgEl('path', { 'class': 'nz-wire', d: 'M' + wx0 + ',' + cy + ' L' + wx1 + ',' + cy }, g) : null;
      var chipW = c.x ? HARMFUL_W : 64;
      var chip = kit.chip(g, chipL + chipW / 2, cy, c.x);
      return { rg: rg, st: st, wire: wire, len: wired ? wx1 - wx0 : 0, chip: chip, cy: cy, cx: chipL + chipW / 2 };
    });

    // the summary: one line, or two when the figure is too narrow for it
    var sumY = top + CALLS.length * (ROW_H + ROW_GAP) - ROW_GAP + 38;
    var sum = h.label(g, 0, sumY, 'Same prompt. Four calls. Two answers.', 'nz-sum');
    if (sum.getComputedTextLength() > w - 4) {
      sum.textContent = '';
      h.svgEl('tspan', { x: 0, dy: 0 }, sum).textContent = 'Same prompt. Four calls.';
      h.svgEl('tspan', { x: 0, dy: 24 }, sum).textContent = 'Two answers.';
      sumY += 24;
    }
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + Math.ceil(sumY + 8 + 2 * PAD));

    function chipAt(r, t) {
      // pops from 90% to full size about its centre
      var s = .9 + .1 * t;
      r.chip.setAttribute('transform', 'translate(' + r.cx + ',' + r.cy + ') scale(' + s + ') translate(' + (-r.cx) + ',' + (-r.cy) + ')');
      r.chip.style.opacity = t;
    }
    function reset() {
      rows.forEach(function (r) {
        r.rg.style.opacity = 0;
        r.st.state('');
        if (r.wire) { r.wire.style.strokeDasharray = r.len; r.wire.style.strokeDashoffset = r.len; }
        chipAt(r, 0);
      });
      sum.style.opacity = 0;
    }
    reset();

    return async function play(alive) {
      reset();
      await h.sleep(350);
      for (var i = 0; i < rows.length; i++) {
        if (!alive()) return;
        var r = rows[i];
        await h.tween(300, function (t) { if (alive()) r.rg.style.opacity = t; });
        if (!alive()) return;
        r.st.state('active');
        if (r.wire) {
          // the call travels down the wire; the answer appears where it lands
          var dot = h.svgEl('circle', { 'class': 'pulse', r: 5, cx: wx0, cy: r.cy }, g);
          await h.tween(560, function (t) {
            if (!alive()) { dot.remove(); return; }
            r.wire.style.strokeDashoffset = r.len * (1 - t);
            dot.setAttribute('cx', wx0 + r.len * t);
          });
          dot.remove();
        } else await h.sleep(400);
        if (!alive()) return;
        await h.tween(260, function (t) { if (alive()) chipAt(r, t); });
        r.st.state('');
        await h.sleep(420);
      }
      if (!alive()) return;
      await h.sleep(200);
      await h.tween(600, function (t) { if (alive()) sum.style.opacity = t; });
    };
  });
})();
