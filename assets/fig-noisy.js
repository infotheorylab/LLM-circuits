/* fig-noisy: one prompt, four calls, two answers.

   The hard prompt (truly harmful) goes to Gemma 4 E4B twice, to the decision
   model Jev and to Gemma 4 31B. Each call appears in turn as a row: the model's
   block, a wire that carries the call, its answer. Then a line sums it up and
   asks what to predict. The answers are illustrative: no recorded calls for
   this prompt are available yet, and the caption says so.

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
  var WIRE_MIN = 36;           // below this the call's wire is too short to read as one

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
    // the true label: beside the question when it fits, else on a line under the quote
    var truth = h.label(card.g, w - 16, 24, '', 'nz-truth', { 'text-anchor': 'end' });
    h.svgEl('tspan', {}, truth).textContent = 'Ground truth: ';
    h.svgEl('tspan', { 'class': 'nz-truth-v' }, truth).textContent = LC.PROMPTS.hard.label ? 'harmful' : 'safe';
    var cardH = card.h;
    if (truth.getComputedTextLength() + card.g.querySelector('.pc-title').getComputedTextLength() + 56 > w) {
      truth.setAttribute('x', 16); truth.setAttribute('text-anchor', 'start');
      truth.setAttribute('y', card.h + 8);
      cardH = card.h + 26;
      card.g.querySelector('.pc-body').setAttribute('height', cardH);
    }

    var top = cardH + 26;
    // the station fits its name, note and price; the wire takes what is left
    var probe = kit.station(g, 0, 0, LC.MODELS[0], { w: 100, h: ROW_H });
    var need = CALLS.reduce(function (m, c) {
      var t = probe.g.querySelector('.st-name'), n;
      t.textContent = c.m.name; n = t.getComputedTextLength();
      if (c.note) { var k = h.label(probe.g, 0, 0, c.note, 'nz-note'); n += 12 + k.getComputedTextLength(); k.remove(); }
      return Math.max(m, n);
    }, probe.g.querySelector('.st-sub').getComputedTextLength());
    probe.g.remove();
    var stW = Math.ceil(Math.max(need + 26, Math.min(212, w - HARMFUL_W - 20 - 64)));
    var chipL = w - HARMFUL_W;                         // answers left-aligned in one column
    var wx0 = stW + 8, wx1 = chipL - 10, wired = wx1 - wx0 >= 16;   // on the smallest phones, no wire
    var rows = CALLS.map(function (c, i) {
      var y = top + i * (ROW_H + ROW_GAP), cy = y + ROW_H / 2;
      var rg = h.svgEl('g', {}, g);
      var wire = wired ? kit.wire(rg, 'M' + wx0 + ',' + cy + ' H' + wx1, { arrow: wx1 - wx0 >= WIRE_MIN }) : null;
      var st = kit.station(rg, 0, y, c.m, { w: stW, h: ROW_H });
      if (c.note) h.label(st.g, stW - 12, 22, c.note, 'nz-note', { 'text-anchor': 'end' });
      var chipW = c.x ? HARMFUL_W : 64;
      var chip = kit.chip(g, chipL + chipW / 2, cy, c.x);
      return { rg: rg, st: st, wire: wire, chip: chip, cy: cy, cx: chipL + chipW / 2 };
    });

    // a plain count of the answers, then the question the next screens answer
    var sumY = top + CALLS.length * (ROW_H + ROW_GAP) - ROW_GAP + 34;
    var nH = CALLS.filter(function (c) { return c.x; }).length;
    var N = ['no', 'one', 'two', 'three', 'four'];       // counts in words; CALLS has two of each
    var line = N[nH] + ' calls say harmful and ' + N[CALLS.length - nH] + ' say safe.';
    var sum = h.label(g, 0, sumY, line.charAt(0).toUpperCase() + line.slice(1), 'nz-sum');
    var ask = h.label(g, 0, sumY + 30, 'What should we predict?', 'nz-ask');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + Math.ceil(sumY + 38 + 2 * PAD));

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
        if (r.wire) r.wire.live(false);
        chipAt(r, 0);
      });
      sum.style.opacity = 0; ask.style.opacity = 0;
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
        // the call runs down the wire as a moving signal; the answer appears where it lands
        if (r.wire) r.wire.live(true);
        await h.sleep(650);
        if (!alive()) return;
        await h.tween(260, function (t) { if (alive()) chipAt(r, t); });
        if (r.wire) r.wire.live(false);
        r.st.state('');
        await h.sleep(420);
      }
      if (!alive()) return;
      await h.sleep(200);
      await h.tween(500, function (t) { if (alive()) sum.style.opacity = t; });
      if (!alive()) return;
      await h.sleep(350);
      await h.tween(500, function (t) { if (alive()) ask.style.opacity = t; });
    };
  });
})();
