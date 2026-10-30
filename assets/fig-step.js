/* fig-step: the hard prompt, one decision at a time.

   The circuit runs on the hard prompt with its own prior and per-prompt
   accuracies (what the prompt classifier would predict). At each state it
   compares stopping now with asking each model it has not asked yet; one row
   per option shows two numbers, both read from the LC.dp.solve memo:

     coins    the coins the option is expected to spend from this state on: the
              model's price plus whatever the best circuit asks after it
     mistake  the chance that the final prediction is wrong, averaged over the
              model's two possible answers, with the best circuit continuing
              from each child state (memo[child].err weighted by the chance of
              that answer)

   The program takes the option with the lowest LAMBDA * coins + mistake. The
   figure says "worth" / "not worth" instead of showing the price of a coin.
   The coins include later calls because the mistake does: next to the model's
   own price alone, Gemma 4 E4B (1 coin, then Gemma 4 31B) would look like a
   bargain beside Gemma 4 31B (5 coins) at the same 12%.

   Everything stays on screen, so the final frame (reduced motion, ?still)
   shows both decisions. Next skips the pause before the next beat and then
   waits for a click at every beat. The figure is drawn at its own width, one
   unit per CSS pixel; when an option's words do not fit on one line, every
   continuation in that step ("then more") moves to a second line. */
(function () {
  'use strict';
  var h = LC.h, svgEl = h.svgEl, label = h.label, kit = LC.kit;
  var MODELS = LC.MODELS, P = LC.PROMPTS.hard;
  var PAD = 1.5;                 // keeps outer strokes inside the viewBox
  var ROW_H = 36, ROW_H2 = 54, ROW_GAP = 6, INSET = 22;
  var METER_W = 84;              // the cost meter's column on the right

  function child(key, i, x) { return key.substr(0, i) + x + key.substr(i + 1); }
  function pct(e) { return Math.round(e * 100) + '%'; }
  function coinWord(n) { return n === 1 ? 'a coin' : n + ' coins'; }

  /* What the best circuit does after asking model i at `key`, for the row's
     label: null if it always stops, the index of the one model it always asks
     next and then stops, or -1 if that depends on the answers. */
  function after(memo, key, i) {
    var seen = [0, 1].map(function (x) {
      var r = memo[child(key, i, x)];
      if (r.act === 'stop') return 'stop';
      var ends = memo[child(r.key, r.i, 0)].act === 'stop' && memo[child(r.key, r.i, 1)].act === 'stop';
      return ends ? r.i : 'more';
    });
    if (seen[0] !== seen[1] || seen[0] === 'more') return -1;
    return seen[0] === 'stop' ? null : seen[0];
  }

  // the options at one state, in a fixed order: stop, then the models by price
  function options(memo, key) {
    var s = memo[key], q = s.q, out = [];
    out.push({ act: 'stop', coins: 0, err: LC.belief.error(q), chosen: s.act === 'stop' });
    MODELS.forEach(function (m, i) {
      if (key[i] !== '.') return;
      var ph = LC.belief.pHarmful(q, i, P.acc);
      var r1 = memo[child(key, i, 1)], r0 = memo[child(key, i, 0)];
      out.push({
        act: 'ask', i: i, m: m,
        coins: m.coins + ph * r1.cost + (1 - ph) * r0.cost,
        err: ph * r1.err + (1 - ph) * r0.err,
        then: after(memo, key, i),
        chosen: s.act === 'ask' && s.i === i
      });
    });
    return out;
  }

  /* The two decisions on the hard prompt, with the answer that links them. */
  var MEMO = LC.dp.solve(P.prior, LC.LAMBDA, P.acc);
  var PATH = LC.dp.run(P.prior, P.answers, LC.LAMBDA, P.acc);
  var STEPS = PATH.map(function (st) { return { key: st.key, q: st.q, step: st, opts: options(MEMO, st.key) }; });

  // one plain sentence on why the chosen option wins
  function verdict(s) {
    var stop = s.opts[0], asks = s.opts.slice(1);
    var best = s.opts.filter(function (o) { return o.chosen; })[0];
    if (best.act === 'ask') {
      return 'Worth ' + coinWord(Math.round(best.coins)) + ': the chance of a mistake falls from ' +
        pct(stop.err) + ' to ' + pct(best.err) + '.';
    }
    var cheapest = Math.min.apply(null, asks.map(function (o) { return Math.round(o.coins); }));
    var same = asks.every(function (o) { return pct(o.err) === pct(stop.err); });
    return 'Not worth ' + coinWord(cheapest) + ': the chance of a mistake ' +
      (same ? 'stays at ' + pct(stop.err) : 'barely moves') + '.';
  }

  // [name, continuation] of one option; full gives the continuation's full model name
  function optionText(o, s, full) {
    var name = o.act === 'stop' ? 'Stop and answer ' + (s.q >= .5 ? 'harmful' : 'safe') : 'Ask ' + o.m.name;
    if (o.act === 'stop' || o.then === null) return [name];
    if (o.then === -1) return [name, 'then more'];
    return [name, 'then ' + (full ? MODELS[o.then].name : MODELS[o.then].short)];
  }

  /* Rewrap a text at the narrowest width that keeps its line count, so a
     sentence that needs two lines splits evenly instead of leaving a stub. */
  function balance(t, str, width, lh) {
    var n = h.wrap(t, str, width, lh), lo = width / 2, hi = width;
    if (n < 2) return n;
    while (hi - lo > 2) {
      var mid = (lo + hi) / 2;
      if (h.wrap(t, str, mid, lh) > n) lo = mid; else hi = mid;
    }
    return h.wrap(t, str, hi, lh);
  }

  // set the verdict ("Worth 5 coins:") in bold at the start of the first line
  function lead(t) {
    var first = t.firstChild, str = first.textContent, k = str.indexOf(':') + 1;
    if (k < 1) return;
    first.textContent = '';
    svgEl('tspan', { 'class': 'stp-lead' }, first).textContent = str.slice(0, k);
    first.appendChild(document.createTextNode(str.slice(k)));
  }

  LC.figure('step', function (fig, ctx) {
    /* ---------------------------------------------------------- controls */
    var headEl = h.head(fig, 'The hard prompt');
    var replay = headEl.querySelector('[data-replay]');
    var btns = document.createElement('span');
    btns.className = 'stp-btns';
    var nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'mini-btn stp-next';
    nextBtn.innerHTML = 'Next<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5"/></svg>';
    headEl.insertBefore(btns, replay);
    btns.appendChild(nextBtn);
    btns.appendChild(replay);

    // Next resolves the current pause, or the next one if a beat is still moving
    var ctl = { manual: false, credit: 0, wake: null };
    nextBtn.addEventListener('click', function () {
      ctl.manual = true;
      if (ctl.wake) ctl.wake(); else ctl.credit = 1;
    });
    function pause(ms, alive) {
      return new Promise(function (resolve) {
        if (ctl.credit) { ctl.credit = 0; resolve(); return; }
        var timer = null, poll = null;
        function done() {
          clearTimeout(timer); clearInterval(poll);
          if (ctl.wake === done) ctl.wake = null;
          resolve();
        }
        ctl.wake = done;
        if (!ctl.manual) timer = setTimeout(done, LC.REDUCE ? 0 : ms);
        // a replay or a rebuild ends this run; do not wait for a click that will not come
        poll = setInterval(function () { if (!alive()) done(); }, 200);
      });
    }

    /* ------------------------------------------------------------ layout */
    var cs = getComputedStyle(fig);
    var inner = (ctx.width || 560) - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var W = Math.round(Math.max(300, Math.min(inner, 620)));
    var w = W - 2 * PAD;
    var svg = h.makeSvg(fig, W, 600);
    var g = svgEl('g', { transform: 'translate(' + PAD + ',' + PAD + ')' }, svg);

    var card = kit.promptCard(g, 0, 0, w, P.text);
    balance(card.text, '“' + P.text + '”', w - 32, 21);   // same line count, so the card's height still fits

    // the belief bar on the left, the coins spent on the right
    var barY = card.h + 44;
    var bar = kit.beliefBar(g, 0, barY, w - METER_W - 34);
    var meter = kit.costMeter(g, w - METER_W, barY - 12);

    // columns, right-aligned. The labels only have to clear the digits below the
    // column heads, which sit on the step's own line, so the long head is kept
    // whenever the longest option still fits on one line beside it.
    var probe = svgEl('g', {}, g);
    function textW(str, cls) { var t = label(probe, 0, 0, str, cls); return t.getComputedTextLength(); }
    // option labels are measured in the chosen row's bold weight, which is the wider one
    function lblW(parts) { return textW(parts.join(', '), 'stp-lbl stp-probe'); }
    var errX = w - 14, digitW = textW('6', 'stp-num');
    var longest = Math.max.apply(null, STEPS.map(function (s) {
      return Math.max.apply(null, s.opts.map(function (o) { return lblW(optionText(o, s, true)); }));
    }));
    function columns(head) {
      var cx = errX - Math.max(textW(head, 'stp-col'), textW('46%', 'stp-num')) - 22;
      return { head: head, coinX: cx, lblMax: cx - digitW - 16 - INSET };
    }
    var col = columns('chance of a mistake');
    if (col.lblMax < longest) col = columns('mistake');
    var coinX = col.coinX, lblMax = col.lblMax, errHead = col.head;

    var y = barY + 66;
    var blocks = STEPS.map(function (s, si) {
      var b = { s: s, rows: [] };
      b.g = svgEl('g', {}, g);
      b.head = svgEl('g', {}, b.g);
      label(b.head, 0, y + 15, 'At ' + h.pct(s.q) + ' harmful', 'stp-head');
      if (si === 0) {
        label(b.head, coinX, y + 15, 'coins', 'stp-col', { 'text-anchor': 'end' });
        label(b.head, errX, y + 15, errHead, 'stp-col', { 'text-anchor': 'end' });
      }
      y += 28;
      // one line per option when every option fits; otherwise every continuation
      // goes on its own line, so the rows of one step keep the same shape
      var texts = s.opts.map(function (o) {
        var full = optionText(o, s, true), short = optionText(o, s, false);
        return lblW(full) <= lblMax ? full : short;
      });
      var stacked = texts.some(function (p) { return lblW(p) > lblMax; });
      s.opts.forEach(function (o, oi) {
        var rg = svgEl('g', { 'class': 'stp-row' + (o.act === 'ask' ? ' t' + o.m.tier : ' stop') }, b.g);
        var parts = stacked ? optionText(o, s, true) : texts[oi];
        var name = parts[0], then = parts[1] || '';
        var two = stacked && !!then;
        var rh = two ? ROW_H2 : ROW_H;
        svgEl('rect', { 'class': 'stp-body', x: 0, y: y, width: w, height: rh, rx: 9 }, rg);
        svgEl('rect', { 'class': 'stp-stripe', x: 8, y: y + 9, width: 4, height: rh - 18, rx: 2 }, rg);
        var mid = two ? y + 22 : y + rh / 2 + 5;
        var t = label(rg, INSET, mid, '', 'stp-lbl');
        svgEl('tspan', { 'class': 'stp-name' }, t).textContent = name;
        if (then && !two) svgEl('tspan', { 'class': 'stp-then' }, t).textContent = ', ' + then;
        if (two) label(rg, INSET, y + 41, then, 'stp-then stp-lbl');
        label(rg, coinX, mid, String(Math.round(o.coins)), 'stp-num', { 'text-anchor': 'end' });
        label(rg, errX, mid, pct(o.err), 'stp-num', { 'text-anchor': 'end' });
        b.rows.push({ g: rg, o: o });
        y += rh + ROW_GAP;
      });
      // the reason, wrapped to the figure's width
      b.why = label(b.g, 0, y + 19, '', 'stp-why');
      y += 19 + (balance(b.why, verdict(s), w - 8, 21) - 1) * 21;
      lead(b.why);

      if (s.step.act === 'ask') {
        // the answer that moves the circuit to the next state
        y += 34;
        b.ans = svgEl('g', {}, g);
        var who = label(b.ans, 0, y + 5, MODELS[s.step.i].name + ' answers', 'stp-ans');
        var cx = who.getComputedTextLength() + 14 + (s.step.x ? 46 : 32);
        kit.chip(b.ans, cx, y, s.step.x);
        y += 28;
      } else y += 8;
      return b;
    });
    probe.remove();
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + Math.ceil(y + 2 * PAD));

    /* --------------------------------------------------------- the frames */
    function chosen(r, on) { r.g.classList.toggle('on', on); }
    function reset() {
      bar.set(P.prior, true);
      meter.reset();
      blocks.forEach(function (b, i) {
        h.show(b.head, i === 0);
        b.rows.forEach(function (r) { r.g.style.opacity = 0; chosen(r, false); });
        b.why.style.opacity = 0;
        if (b.ans) b.ans.style.opacity = 0;
      });
      nextBtn.disabled = false;
    }
    function fade(n, ms, alive) { return h.tween(ms, function (t) { if (alive()) n.style.opacity = t; }); }
    reset();

    return async function play(alive) {
      if (ctl.wake) ctl.wake();
      ctl.manual = false; ctl.credit = 0;
      reset();
      await pause(500, alive);
      for (var bi = 0; bi < blocks.length; bi++) {
        var b = blocks[bi];
        if (!alive()) return;
        if (bi > 0) await fade(b.head, 350, alive);
        // the options, one at a time
        for (var ri = 0; ri < b.rows.length; ri++) {
          if (!alive()) return;
          fade(b.rows[ri].g, 380, alive);
          await h.sleep(170);
        }
        await h.sleep(250);
        if (!await beat(1300)) return;
        // the choice
        b.rows.forEach(function (r) { chosen(r, r.o.chosen); });
        await fade(b.why, 400, alive);
        if (!b.ans) break;
        if (!await beat(1500)) return;
        // the answer arrives: coins are paid and the belief moves
        var st = b.s.step;
        await fade(b.ans, 300, alive);
        if (!alive()) return;
        meter.add(MODELS[st.i].coins);
        // moved frame by frame here, so that a replay mid-move is not overridden
        var from = b.s.q, to = LC.belief.post(b.s.q, st.i, st.x, P.acc);
        await h.tween(650, function (t) { if (alive()) bar.set(from + (to - from) * t, true); });
        if (!await beat(1100)) return;
      }
      if (alive()) nextBtn.disabled = true;

      async function beat(ms) { await pause(ms, alive); return alive(); }
    };
  });
})();
