/* fig-circuits: four circuits over the same three models.

   A segmented control picks the circuit: majority voting, routing, a cascade
   or LMCircuit. Each draws its own wiring over the three LC.MODELS stations and
   runs the three example prompts (easy, medium, hard) through it. The
   scoreboard under the drawing keeps each circuit's right answers and spend, so
   after the first walk through all four the comparison stays in view.

   Every outcome is computed here from LC.PROMPTS, LC.belief and LC.dp; no total
   is typed in. With the illustrative numbers in core.js all four circuits get
   the three prompts right, for $0.456, $0.13, $0.276 and $0.11 per million tokens.

   Layout: the prompt card on top, then an optional control box (the router, or
   LMCircuit's ask-or-stop), then the three stations in a column, each with a
   slot for its answer. Wires run down a bus on the left into the stations and
   from their right edges to the prediction: beside the middle station when the
   figure is wide enough, under the column otherwise. Everything is drawn at
   the figure's own width, one unit per CSS pixel, so a narrow build (ctx.narrow)
   is simply the stacked layout at a smaller width. */
(function () {
  'use strict';
  var h = LC.h, kit = LC.kit, M = LC.MODELS, P = LC.PROMPTS;

  var ORDER = ['easy', 'medium', 'hard'];
  var TITLE = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
  var ROUTE_ACC = .8;          // the router asks the cheapest model at least this accurate on the prompt
  var SURE = .1;               // the cascade stops once the belief is this close to either label
  var PAD = 1.5;               // keeps outer strokes inside the viewBox
  var ST_H = 52, ST_GAP = 20, HUB_H = 36, BEND = 9;
  var MAX_W = 720;             // a wider figure scales the drawing up a little
  var SLOT_M = 8, SLOT_GAP = 12;  // the answer slot's margin inside a station, and its gap to the price
  var BUS = [20, 42], BUS_NARROW = [12, 28];   // left bus and station x: side layout, stacked layout
  var PULSE = 260;             // ms for the prompt to travel one wire

  function majority(xs) {
    var s = 0;
    xs.forEach(function (x) { s += x; });
    return s * 2 > xs.length ? 1 : 0;
  }

  /* What each circuit does on prompt k: the models it asks, as groups asked in
     turn (a group is asked in parallel), and what it predicts. */
  var CIRCUITS = [
    { name: 'Majority voting', out: 'majority', vote: true,
      say: 'Asks all three models on every prompt and goes with the answer most of them give.',
      trace: function (k) { return { groups: [[0, 1, 2]], predict: majority(P[k].answers) }; } },
    { name: 'Routing', hub: 'router', out: 'prediction',
      say: 'A router reads the prompt and asks one model: the cheapest one likely to get it right.',
      trace: function (k) {
        var acc = P[k].acc, pick = -1, best = 0;
        for (var i = 0; i < M.length; i++) {
          if (pick < 0 && acc[i] >= ROUTE_ACC) pick = i;
          if (acc[i] > acc[best]) best = i;
        }
        if (pick < 0) pick = best;
        return { groups: [[pick]], predict: P[k].answers[pick] };
      } },
    { name: 'Cascade', out: 'prediction', chain: true,
      say: 'Asks the models in a fixed order, cheapest first, and stops once it is 90% sure.',
      trace: function (k) {
        // no prompt information: start at even odds and use each model's overall accuracy
        var q = .5, groups = [];
        for (var i = 0; i < M.length; i++) {
          groups.push([i]);
          q = LC.belief.post(q, i, P[k].answers[i], LC.POOLED);
          if (q <= SURE || q >= 1 - SURE) break;
        }
        return { groups: groups, predict: q >= .5 ? 1 : 0 };
      } },
    { name: 'LMCircuit', hub: 'ask or stop', out: 'prediction', bypass: true,
      say: 'Reads the prompt, then chooses whom to ask and when to stop. It can stop before asking anyone.',
      trace: function (k) {
        var steps = LC.dp.runPrompt(k), groups = [];
        steps.forEach(function (s) { if (s.act === 'ask') groups.push([s.i]); });
        return { groups: groups, predict: steps[steps.length - 1].predict };
      } }
  ];
  var MAX_SPEND = 0;           // what asking every model on every prompt costs: the scoreboard's full bar
  M.forEach(function (m) { MAX_SPEND += m.price * ORDER.length; });

  /* An orthogonal path through pts with rounded corners. */
  function route(pts, r) {
    var p = pts.filter(function (q, i) { return !i || q[0] !== pts[i - 1][0] || q[1] !== pts[i - 1][1]; });
    var d = 'M' + p[0][0] + ',' + p[0][1];
    for (var i = 1; i < p.length - 1; i++) {
      var a = p[i - 1], b = p[i], c = p[i + 1];
      var d1 = Math.hypot(b[0] - a[0], b[1] - a[1]), d2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
      var rr = Math.min(r, d1 / 2, d2 / 2);
      var u = [b[0] + (a[0] - b[0]) * rr / d1, b[1] + (a[1] - b[1]) * rr / d1];
      var v = [b[0] + (c[0] - b[0]) * rr / d2, b[1] + (c[1] - b[1]) * rr / d2];
      d += ' L' + u[0] + ',' + u[1] + ' Q' + b[0] + ',' + b[1] + ' ' + v[0] + ',' + v[1];
    }
    var e = p[p.length - 1];
    return d + ' L' + e[0] + ',' + e[1];
  }
  function quote(k) { return '“' + P[k].text + '”'; }
  /* Rewrap at the narrowest width that keeps the line count, so the last line
     is not left with one word (as in fig-noisy). */
  function balance(t, str, width) {
    var n = h.wrap(t, str, width, 21), lo = width / 2, hi = width;
    while (hi - lo > 2) {
      var mid = (lo + hi) / 2;
      if (h.wrap(t, str, mid, 21) > n) lo = mid; else hi = mid;
    }
    h.wrap(t, str, hi, 21);
  }
  function setVisible(node, on) { node.style.display = on ? '' : 'none'; }
  // pops from 90% to full size about (cx, cy)
  function pop(node, cx, cy, t) {
    var s = .9 + .1 * t;
    node.setAttribute('transform', 'translate(' + cx + ',' + cy + ') scale(' + s + ') translate(' + (-cx) + ',' + (-cy) + ')');
    node.style.opacity = t;
  }

  LC.figure('circuits', function (fig, ctx) {
    /* ---- head: the circuit picker sits beside Replay, or above the drawing when there is no room */
    var head = h.head(fig, '');
    var replay = head.querySelector('[data-replay]');
    var seg = document.createElement('div');
    seg.className = 'cx-seg';
    seg.setAttribute('role', 'radiogroup');
    seg.setAttribute('aria-label', 'Circuit');
    head.insertBefore(seg, replay);
    var tabs = CIRCUITS.map(function (c, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.textContent = c.name;
      b.addEventListener('click', function () { pick(i); });
      b.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        var j = (i + d + CIRCUITS.length) % CIRCUITS.length;
        tabs[j].focus();
        pick(j);
      });
      seg.appendChild(b);
      return b;
    });
    fig.classList.remove('cx-stack', 'cx-grid');
    var segW = seg.scrollWidth;
    if (segW + replay.offsetWidth + 16 > head.clientWidth) fig.classList.add('cx-stack');
    if (segW > head.clientWidth) fig.classList.add('cx-grid');

    /* ---- the drawing */
    var cs = getComputedStyle(fig);
    var inner = ctx.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var svg = h.makeSvg(fig, 400, 400);
    var root = h.svgEl('g', { transform: 'translate(' + PAD + ',' + PAD + ')' }, svg);
    function measure(parent, str, cls, groupCls) {
      var g = h.svgEl('g', { 'class': groupCls || '' }, parent);
      var n = h.label(g, 0, 0, str, cls).getComputedTextLength();
      g.remove();
      return n;
    }
    var chipW = Math.ceil(Math.max(measure(root, 'HARMFUL', 'chip-t', 'chip-g h'), measure(root, 'SAFE', 'chip-t', 'chip-g s')) + 18);
    // a station needs room for its name and price, then its answer slot
    var probe = kit.station(root, 0, 0, M[M.length - 1], { w: 300, h: ST_H }), need = 0;
    probe.g.querySelectorAll('text').forEach(function (t) { need = Math.max(need, +t.getAttribute('x') + t.getComputedTextLength()); });
    probe.g.remove();
    need = Math.ceil(need + SLOT_GAP + chipW + SLOT_M);
    // the stacked layout's width at its tightest; a smaller figure scales it down slightly
    var minW = Math.ceil(2 * PAD + BUS_NARROW[1] + need + 18 + chipW / 2 + 8);
    var W = Math.round(Math.max(minW, Math.min(inner, MAX_W)));
    var w = W - 2 * PAD;

    var gWire = h.svgEl('g', {}, root);      // the current circuit's wiring
    var gDot = h.svgEl('g', {}, root);       // the prompt travelling along it
    var gTop = h.svgEl('g', {}, root);       // card, control box, stations, prediction

    // the prompt card: one height for all three prompts, so nothing below it moves
    var card = h.svgEl('g', { 'class': 'pcard' }, gTop);
    var cardBody = h.svgEl('rect', { 'class': 'pc-body', x: 0, y: 0, width: w, height: 40, rx: 12 }, card);
    // the card's top line names the three prompts and marks the one running
    var steps = [], sx = 16;
    ORDER.forEach(function (k) {
      steps.push(h.label(card, sx, 24, TITLE[k], 'cx-pk'));
      sx += measure(card, TITLE[k], 'cx-pk', 'cx-pkm') + 18;
    });
    var cText = h.label(card, 16, 48, '', 'pc-text');
    var lines = 1;
    ORDER.forEach(function (k) { lines = Math.max(lines, h.wrap(cText, quote(k), w - 32, 21)); });
    var cardH = 48 + (lines - 1) * 21 + 16;
    cardBody.setAttribute('height', cardH);
    function setCard(k) {
      var n = ORDER.indexOf(k);
      steps.forEach(function (t, i) { t.setAttribute('class', 'cx-pk' + (i === n ? ' on' : '')); });
      balance(cText, quote(k), w - 32);
    }

    var hubTop = cardH + 18, hubMid = hubTop + HUB_H / 2, hubBot = hubTop + HUB_H;
    var ys = M.map(function (m, i) { return hubBot + 18 + i * (ST_H + ST_GAP); });
    var mids = ys.map(function (y) { return y + ST_H / 2; });
    var side = w >= BUS[1] + need + 18 + 44 + chipW + 8;     // the prediction fits beside the column
    var busL = (side ? BUS : BUS_NARROW)[0], stX = (side ? BUS : BUS_NARROW)[1], chainX = stX + 30;
    var outR = w - 8, outL = outR - chipW, outCx = outL + chipW / 2, outCy, stW, busR;
    if (side) {
      // the prediction sits level with the middle station, at the right edge
      outCy = mids[1];
      stW = Math.min(300, outL - 44 - 18 - stX);
      busR = stX + stW + 18;
    } else {
      // the prediction sits under the column, on the line of the right bus
      busR = outCx;
      stW = busR - 18 - stX;
      outCy = ys[2] + ST_H + 28 + 14;
    }
    var stR = stX + stW;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + Math.ceil((side ? ys[2] + ST_H : outCy + 14) + 2 * PAD + 1));

    function chip(parent, cx, cy, x) {
      var g = h.svgEl('g', { 'class': 'chip-g ' + (x ? 'h' : 's') }, parent);
      h.svgEl('rect', { 'class': 'chip ' + (x ? 'h' : 's'), x: cx - chipW / 2, y: cy - 14, width: chipW, height: 28, rx: 14 }, g);
      h.label(g, cx, cy + 5, x ? 'HARMFUL' : 'SAFE', 'chip-t', { 'text-anchor': 'middle' });
      return g;
    }
    // an answer slot: dashed while empty, then the chip
    function slot(parent, cx, cy) {
      var s = { cx: cx, cy: cy };
      s.empty = h.svgEl('rect', { 'class': 'cx-slot', x: cx - chipW / 2, y: cy - 14, width: chipW, height: 28, rx: 14 }, parent);
      s.chips = [chip(parent, cx, cy, 0), chip(parent, cx, cy, 1)];
      s.clear = function () { setVisible(s.empty, true); s.chips.forEach(function (c) { setVisible(c, false); }); };
      s.fill = function (x) {
        setVisible(s.empty, false);
        var c = s.chips[x];
        setVisible(c, true);
        return h.tween(200, function (t) { pop(c, cx, cy, t); });
      };
      s.clear();
      return s;
    }

    var stations = M.map(function (m, i) {
      var st = kit.station(gTop, stX, ys[i], m, { w: stW, h: ST_H });
      return { st: st, slot: slot(st.g, stW - SLOT_M - chipW / 2, ST_H / 2) };
    });

    var gHub = h.svgEl('g', { 'class': 'cx-hub' }, gTop);
    var gOut = h.svgEl('g', {}, gTop);
    var outLbl = !side ? h.label(gOut, outL - 12, outCy + 5, '', 'cx-out', { 'text-anchor': 'end' })
                        : h.label(gOut, outCx, outCy - 24, '', 'cx-out', { 'text-anchor': 'middle' });
    var outSlot = slot(gOut, outCx, outCy);
    // a badge on the prediction's corner: right or wrong
    function badge(ok) {
      var g = h.svgEl('g', { 'class': 'cx-badge ' + (ok ? 'ok' : 'bad'), transform: 'translate(' + (outR - 3) + ',' + (outCy - 14) + ')' }, gOut);
      h.svgEl('circle', { cx: 0, cy: 0, r: 8.5 }, g);
      h.svgEl('path', { d: ok ? 'M-3.6,0.2 L-1.1,2.7 L3.8,-2.4' : 'M-2.8,-2.8 L2.8,2.8 M2.8,-2.8 L-2.8,2.8' }, g);
      setVisible(g, false);
      return g;
    }
    var badges = [badge(false), badge(true)];

    /* ---- wiring of one circuit */
    var wires = {}, hubBox = null;
    function wire(pts) { return h.svgEl('path', { 'class': 'cx-wire', d: route(pts, BEND) }, gWire); }
    function toOut(from) {
      return !side ? [from, [busR, from[1]], [busR, outCy - 14]]
                    : [from, [busR, from[1]], [busR, outCy], [outL, outCy]];
    }
    function drawCircuit(c) {
      gWire.innerHTML = ''; gHub.innerHTML = ''; hubBox = null;
      wires = { left: [], chain: [], right: [] };
      var top = cardH;
      if (c.hub) {
        var hw = Math.max(92, Math.ceil(measure(gHub, c.hub, 'cx-hub-t') + 34));
        hubBox = h.svgEl('rect', { 'class': 'cx-hub-b', x: 0, y: hubTop, width: hw, height: HUB_H, rx: 10 }, gHub);
        h.label(gHub, hw / 2, hubMid + 5, c.hub, 'cx-hub-t', { 'text-anchor': 'middle' });
        wires.in = wire([[busL, cardH], [busL, hubTop]]);
        if (c.bypass) wires.bypass = wire(toOut([hw, hubMid]));
        top = hubBot;
      }
      M.forEach(function (m, i) {
        if (c.chain && i > 0) wires.chain[i] = wire([[chainX, ys[i - 1] + ST_H], [chainX, ys[i]]]);
        else wires.left[i] = wire([[busL, top], [busL, mids[i]], [stX, mids[i]]]);
        wires.right[i] = wire(toOut([stR, mids[i]]));
      });
      outLbl.textContent = c.out;
    }
    // light a wire and send the prompt along it (the lit wire is drawn on top)
    function travel(p) {
      if (!p) return Promise.resolve();
      p.classList.add('on');
      gWire.appendChild(p);
      return h.pulse(gDot, p, PULSE);
    }
    function resetPrompt() {
      Array.prototype.forEach.call(gWire.childNodes, function (p) { p.classList.remove('on'); });
      if (hubBox) hubBox.classList.remove('on');
      stations.forEach(function (s) { s.st.state(''); s.slot.clear(); });
      outSlot.clear();
      badges.forEach(function (b) { setVisible(b, false); });
    }

    /* ---- the sentence and the scoreboard, under the drawing */
    fig.querySelectorAll('.cx-say, .cx-board').forEach(function (n) { n.remove(); });
    var capEl = fig.querySelector('figcaption, .fig-cap');
    var say = document.createElement('p');
    say.className = 'cx-say';
    say.setAttribute('aria-live', 'polite');
    fig.insertBefore(say, capEl);
    var maxSay = 0;
    CIRCUITS.forEach(function (c) { say.textContent = c.say; maxSay = Math.max(maxSay, say.offsetHeight); });
    say.style.minHeight = maxSay + 'px';

    var bHost = document.createElement('div');
    bHost.className = 'cx-board';
    fig.insertBefore(bHost, capEl);
    var bsvg = h.svgEl('svg', { 'aria-hidden': 'true' }, bHost);
    var board = h.svgEl('g', { transform: 'translate(' + PAD + ',' + PAD + ')' }, bsvg);
    var rows = scoreboard(board);
    bsvg.setAttribute('viewBox', '0 0 ' + W + ' ' + Math.ceil(rows.height + 2 * PAD));

    /* One row per circuit: name, right answers and a bar of the money spent on
       one line under a header, or (when the bar would get too short) name and
       right answers, then the bar. */
    function scoreboard(g) {
      var IN = 12, list = [], y0, rowH;
      var nameW = 0;
      CIRCUITS.forEach(function (c) { nameW = Math.max(nameW, measure(g, c.name, 'cx-bname', 'cx-row cur')); });
      var colR = IN + nameW + 24, colC = colR + measure(g, '3 of 3', 'cx-bnum') + 26;
      var numW = measure(g, h.usd(MAX_SPEND), 'cx-bnum');
      var barMax = Math.min(264, w - IN - numW - 10 - colC);
      var one = barMax >= 150;
      if (one) {
        h.label(g, colR, 16, 'right', 'cx-bhead');
        h.label(g, colC, 16, 'spent ($ ' + h.PER + ')', 'cx-bhead');
        y0 = 26; rowH = 34;
      } else {
        numW = measure(g, h.price(MAX_SPEND), 'cx-bnum');
        colC = IN;
        barMax = Math.min(264, w - 2 * IN - numW - 10);
        y0 = 0; rowH = 56;
      }
      function money(x) { return one ? h.usd(x) : h.price(x); }
      CIRCUITS.forEach(function (c, i) {
        var top = y0 + i * rowH;
        var rg = h.svgEl('g', { 'class': 'cx-row' }, g);
        h.svgEl('rect', { 'class': 'cx-band', x: 0, y: top + 2, width: w, height: rowH - 4, rx: 9 }, rg);
        var base = !one ? top + 24 : top + rowH / 2 + 5;
        var barY = !one ? top + 42 : top + rowH / 2;
        h.label(rg, IN, base, c.name, 'cx-bname');
        var right = !one ? h.label(rg, w - IN, base, '', 'cx-bnum', { 'text-anchor': 'end' })
                           : h.label(rg, colR, base, '', 'cx-bnum');
        var bar = h.svgEl('rect', { 'class': 'cx-bar', x: colC, y: barY - 5, width: 0, height: 10, rx: 5 }, rg);
        var num = h.label(rg, colC, !one ? barY + 5 : base, '', 'cx-bnum');
        var n = 0;
        list.push({
          reset: function () { bar.setAttribute('width', 0); n = 0; right.textContent = ''; num.textContent = ''; },
          add: function (k) {
            n += k;
            var bw = barMax * n / MAX_SPEND;
            bar.setAttribute('width', bw);
            num.setAttribute('x', colC + bw + (n ? 8 : 0));
            num.textContent = money(n);
          },
          score: function (k, of) {
            right.textContent = k + ' of ' + of + (!one ? ' right' : '');
            if (!n) num.textContent = money(0);
          },
          cur: function (on) { rg.classList.toggle('cur', on); }
        });
      });
      list.height = y0 + CIRCUITS.length * rowH;
      return list;
    }

    /* ---- playing */
    function select(i) {
      tabs.forEach(function (b, j) {
        b.setAttribute('aria-checked', j === i ? 'true' : 'false');
        b.tabIndex = j === i ? 0 : -1;
      });
      rows.forEach(function (r, j) { r.cur(j === i); });
      say.textContent = CIRCUITS[i].say;
      drawCircuit(CIRCUITS[i]);
      // the new wiring fades in rather than snapping into place
      h.tween(260, function (t) { gWire.style.opacity = t; gHub.style.opacity = t; });
    }

    async function runPrompt(c, k, row, alive) {
      var p = P[k], tr = c.trace(k), asked = [];
      await h.tween(110, function (t) { if (alive()) cText.style.opacity = 1 - t; });
      if (!alive()) return null;
      resetPrompt();
      setCard(k);
      await h.tween(150, function (t) { if (alive()) cText.style.opacity = t; });
      await h.sleep(160);
      if (!alive()) return null;
      if (wires.in) {
        await travel(wires.in);
        if (!alive()) return null;
        hubBox.classList.add('on');
        await h.sleep(120);
      }
      for (var g = 0; g < tr.groups.length; g++) {
        if (!alive()) return null;
        var grp = tr.groups[g];
        // a cascade hands the prompt down the chain; the others send it from the left bus
        await Promise.all(grp.map(function (i) { return travel(g > 0 && c.chain ? wires.chain[i] : wires.left[i]); }));
        if (!alive()) return null;
        grp.forEach(function (i) { stations[i].st.state('on'); row.add(M[i].price); asked.push(i); });
        await Promise.all(grp.map(function (i) { return stations[i].slot.fill(p.answers[i]); }));
        await h.sleep(200);
      }
      if (!alive()) return null;
      stations.forEach(function (s, i) { if (asked.indexOf(i) < 0) { s.st.state('dim'); setVisible(s.slot.empty, false); } });
      var outs = !asked.length ? [wires.bypass]
        : c.vote ? asked.map(function (i) { return wires.right[i]; })
        : [wires.right[asked[asked.length - 1]]];
      await Promise.all(outs.map(travel));
      if (!alive()) return null;
      var ok = tr.predict === p.label;
      await outSlot.fill(tr.predict);
      setVisible(badges[ok ? 1 : 0], true);
      return ok;
    }

    async function runCircuit(i, alive) {
      select(i);
      var row = rows[i], right = 0;
      row.reset();
      for (var n = 0; n < ORDER.length; n++) {
        var ok = await runPrompt(CIRCUITS[i], ORDER[n], row, alive);
        if (ok === null || !alive()) return;
        if (ok) right++;
        row.score(right, ORDER.length);
        await h.sleep(n < ORDER.length - 1 ? 450 : 0);
      }
    }

    // a tab plays its own circuit; Replay (the runner) walks through all four
    var token = 0, picked = false;
    replay.addEventListener('click', function () { picked = false; });   // runs before the runner's handler
    function pick(i) {
      var mine = ++token;
      picked = true;
      runCircuit(i, function () { return mine === token && svg.isConnected; });
    }

    select(0);
    setCard(ORDER[0]);

    return async function play(alive) {
      if (picked) return;
      var mine = ++token;
      var live = function () { return alive() && mine === token && svg.isConnected; };
      rows.forEach(function (r) { r.reset(); });
      for (var i = 0; i < CIRCUITS.length; i++) {
        if (!live()) return;
        await runCircuit(i, live);
        if (!live()) return;
        if (i < CIRCUITS.length - 1) await h.sleep(1000);
      }
    };
  });
})();
