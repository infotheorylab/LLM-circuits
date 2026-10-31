/* fig-circuits: four circuits over the same three models.

   "Pick a circuit" chooses majority voting, routing, a cascade or LMCircuit.
   Each wires the prompt, the three LC.MODELS blocks and a navy prediction
   block in its own way and runs the three example prompts (easy, medium,
   hard) through them: a dashed signal moves along every wire it uses, each
   model it asks shows its answer next to its block, and the readouts count the
   calls and the cost. Once a prompt is answered, the models the circuit did not
   ask turn pale and the wires it did not use fade.

   The scoreboard under the drawing has one row per circuit: its right answers
   and its cost for one million prompts of each kind. A row is either empty or
   shows that circuit's complete result, never a running count: it fills in when
   the circuit finishes its three prompts, or at once when a tab cuts its walk
   short. Replay empties the board and walks through all four again. The walk
   waits while the figure is off screen.

   Every outcome is computed here from LC.PROMPTS, LC.belief and LC.dp; no total
   is typed in. With the illustrative numbers in core.js all four circuits get
   the three prompts right, for $456, $130, $276 and $110.

   Two layouts, both drawn at one unit per CSS pixel so that type keeps its size.
   Wide: top to bottom. The prompt card, a row for the router or for LMCircuit's
   prompt classifier and ask-or-stop box, the three models side by side with
   their answers under them, then the prediction. Narrow (ctx.narrow): the
   models are stacked, wires come in from a bus on the left and leave by a lane
   on the right, and the prediction sits under them. */
(function () {
  'use strict';
  var h = LC.h, kit = LC.kit, M = LC.MODELS, P = LC.PROMPTS;

  var ORDER = ['easy', 'medium', 'hard'];
  var TITLE = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
  var TASK = 'Is this prompt harmful?';
  var ROUTE_ACC = .8;          // the router asks the cheapest model at least this accurate on the prompt
  var SURE = .1;               // the cascade stops once the chance harmful is this close to 0 or 1
  var PAD = 2;                 // keeps outer strokes inside the viewBox
  var ST_H = 52, BOX_H = 38, PRED_W = 150, PRED_H = 54, CHIP_H = 28;
  var MAX_W = 880;             // wider than the figure ever is (one column under 900 px), so it is never scaled up
  var NET_S = .75;             // the prompt classifier icon at three quarters size, about 40 x 42
  var R = 10;                  // corner radius of the narrow layout's wires
  /* Pacing in ms. A signal moves at SPEED px per ms, so a short hop is quick
     and the long run down the narrow layout's bus is not. Each answered prompt
     stays on screen for T.prompt before the next one fades in. */
  var T = { swap: 300, hub: 350, ask: 350, pred: 350, beat: 450, prompt: 1300, circuit: 1600 };
  var SPEED = .25, WIRE_MIN = 560, WIRE_MAX = 1400;   // the moving dot: units per ms, and its shortest and longest trip

  function majority(xs) {
    var s = 0;
    xs.forEach(function (x) { s += x; });
    return s * 2 > xs.length ? 1 : 0;
  }

  /* What each circuit does on prompt k: the models it asks, as groups asked in
     turn (a group is asked at once), what it predicts, and for the circuits
     that keep one, the chance harmful before and after each answer. */
  var CIRCUITS = [
    { name: 'Majority voting', key: 'vote',
      say: 'Asks all three models on every prompt and goes with the answer most of them give.',
      trace: function (k) { return { groups: [[0, 1, 2]], predict: majority(P[k].answers), q: null }; } },
    { name: 'Routing', key: 'route',
      say: 'A router reads the prompt and asks only the cheapest model that is likely to get it right.',
      trace: function (k) {
        var acc = P[k].acc, pick = -1, best = 0;
        for (var i = 0; i < M.length; i++) {
          if (pick < 0 && acc[i] >= ROUTE_ACC) pick = i;
          if (acc[i] > acc[best]) best = i;
        }
        if (pick < 0) pick = best;
        return { groups: [[pick]], predict: P[k].answers[pick], q: null };
      } },
    { name: 'Cascade', key: 'cascade',
      say: 'Asks the models one at a time, cheapest first, and stops once it is ' + h.pct(1 - SURE) + ' sure.',
      trace: function (k) {
        // no prompt classifier: start at even odds and use each model's overall accuracy
        var q = .5, qs = [q], groups = [];
        for (var i = 0; i < M.length; i++) {
          groups.push([i]);
          q = LC.belief.post(q, i, P[k].answers[i], LC.POOLED);
          qs.push(q);
          if (q <= SURE || q >= 1 - SURE) break;
        }
        return { groups: groups, predict: q >= .5 ? 1 : 0, q: qs };
      } },
    { name: 'LMCircuit', key: 'lmc',
      say: 'A prompt classifier reads the prompt. LMCircuit then picks which model to ask next, or stops. It can answer without asking any model.',
      trace: function (k) {
        var steps = LC.dp.runPrompt(k), groups = [], qs = [];
        steps.forEach(function (s) { qs.push(s.q); if (s.act === 'ask') groups.push([s.i]); });
        return { groups: groups, predict: steps[steps.length - 1].predict, q: qs };
      } }
  ];
  var MAX_SPEND = 0;           // asking every model on every prompt: the scoreboard's full bar
  M.forEach(function (m) { MAX_SPEND += m.cost * ORDER.length; });
  // each circuit's complete result over the three prompts, for the scoreboard
  var RESULTS = CIRCUITS.map(function (c) {
    var r = { right: 0, of: ORDER.length, cost: 0 };
    ORDER.forEach(function (k) {
      var tr = c.trace(k);
      tr.groups.forEach(function (g) { g.forEach(function (i) { r.cost += M[i].cost; }); });
      if (tr.predict === P[k].label) r.right++;
    });
    return r;
  });

  function quote(k) { return '“' + P[k].text + '”'; }
  /* Rewrap at the narrowest width that keeps the line count, so the last line
     is not left with one word (as in fig-router). */
  function balance(t, str, width) {
    var n = h.wrap(t, str, width, 21), lo = width / 2, hi = width;
    while (hi - lo > 2) {
      var mid = (lo + hi) / 2;
      if (h.wrap(t, str, mid, 21) > n) lo = mid; else hi = mid;
    }
    h.wrap(t, str, hi, 21);
  }
  function setVisible(node, on) { node.style.display = on ? '' : 'none'; }
  // fades in; no scaling, so its words never shrink below their size mid-animation
  function fadeIn(node, t) { node.style.opacity = t; }
  function line(x1, y1, x2, y2) { return 'M' + x1 + ',' + y1 + ' L' + x2 + ',' + y2; }
  // leaves and arrives vertically: the fans of the wide layout
  function vcurve(x1, y1, x2, y2) {
    var my = (y1 + y2) / 2;
    return 'M' + x1 + ',' + y1 + ' C' + x1 + ',' + my + ' ' + x2 + ',' + my + ' ' + x2 + ',' + y2;
  }
  // down, then right: the narrow layout's bus into a model
  function downRight(x1, y1, x2, y2) {
    return 'M' + x1 + ',' + y1 + ' L' + x1 + ',' + (y2 - R) + ' Q' + x1 + ',' + y2 + ' ' + (x1 + R) + ',' + y2 + ' L' + x2 + ',' + y2;
  }
  // right, then down: from an answer to the narrow layout's lane
  function rightDown(x1, y1, x2, y2) {
    return 'M' + x1 + ',' + y1 + ' L' + (x2 - R) + ',' + y1 + ' Q' + x2 + ',' + y1 + ' ' + x2 + ',' + (y1 + R) + ' L' + x2 + ',' + y2;
  }

  LC.figure('circuits', function (fig, ctx) {
    var narrow = ctx.narrow;

    /* ---- head: "Pick a circuit", the picker and Replay on one row when they fit */
    var head = h.head(fig, 'Pick a circuit');
    var replay = head.querySelector('[data-replay]');
    var seg = document.createElement('div');
    seg.className = 'cx-seg';
    seg.setAttribute('role', 'radiogroup');
    seg.setAttribute('aria-label', 'Pick a circuit');
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
    fig.classList.remove('cx-nolabel', 'cx-stack', 'cx-grid');
    var room = head.clientWidth, segW = seg.scrollWidth, repW = replay.offsetWidth;
    var lblW = head.querySelector('.fig-title').offsetWidth;
    // label, picker, Replay; else picker and Replay; else the picker on a row of its own
    if (lblW + segW + repW + 24 > room) fig.classList.add('cx-nolabel');
    if (segW + repW + 12 > room) { fig.classList.remove('cx-nolabel'); fig.classList.add('cx-stack'); }
    if (segW > room) fig.classList.add('cx-grid');

    /* ---- readouts above the drawing; the sentence and the scoreboard go under it */
    fig.querySelectorAll('.cx-read, .cx-say, .cx-board').forEach(function (n) { n.remove(); });
    var capEl = fig.querySelector('figcaption, .fig-cap');
    var cs = getComputedStyle(fig);
    var inner = ctx.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var svg = h.makeSvg(fig, 400, 400);
    var host = svg.parentNode;
    var read = document.createElement('div');
    read.className = 'cx-read';
    read.setAttribute('aria-hidden', 'true');
    read.innerHTML = '<span class="cx-ro"><span class="k">Calls</span><b data-r="calls">0</b></span>' +
      '<span class="cx-ro"><span class="k">Cost</span><b data-r="cost">$0</b><span class="u">' + h.PER + '</span></span>' +
      '<span class="cx-ro" data-r="qbox"><span class="k">Chance harmful</span><b data-r="q">50%</b></span>';
    fig.insertBefore(read, host);
    var rCalls = read.querySelector('[data-r="calls"]'), rCost = read.querySelector('[data-r="cost"]');
    var rQ = read.querySelector('[data-r="q"]'), rQbox = read.querySelector('[data-r="qbox"]');

    /* ---- the drawing */
    var root = h.svgEl('g', { transform: 'translate(' + PAD + ',' + PAD + ')' }, svg);
    function measure(parent, str, cls, groupCls) {
      var g = h.svgEl('g', { 'class': groupCls || '' }, parent);
      var n = h.label(g, 0, 0, str, cls).getComputedTextLength();
      g.remove();
      return n;
    }
    var chipW = Math.ceil(Math.max(measure(root, 'HARMFUL', 'chip-t', 'chip-g h'), measure(root, 'SAFE', 'chip-t', 'chip-g s')) + 20);
    // how wide a model block must be for its name and price (unit false: the price without "per 1M prompts")
    function need(unit) {
      var n = 0;
      M.forEach(function (m) {
        var probe = kit.station(root, 0, 0, m, { w: 400, h: ST_H, unit: unit });
        probe.g.querySelectorAll('text').forEach(function (t) { n = Math.max(n, +t.getAttribute('x') + t.getComputedTextLength()); });
        probe.g.remove();
      });
      return Math.ceil(n + 12);
    }
    var needFull = need(true), needShort = need(false);
    // the narrowest the narrow layout can be; a smaller figure scales it down
    var minW = 2 * PAD + 46 + needShort + 8 + chipW + 34;
    var W = Math.round(Math.max(minW, Math.min(inner, MAX_W)));
    var w = W - 2 * PAD;

    var gWire = h.svgEl('g', {}, root);      // the current circuit's wiring
    var gDot = h.svgEl('g', {}, root);       // the signal travelling along it
    var gHub = h.svgEl('g', {}, root);       // router, prompt classifier, ask or stop
    var gTop = h.svgEl('g', {}, root);       // card, models, answers, prediction

    /* The prompt card: the task and the three prompts on top (on one line when
       they fit), then the prompt. One height for all three prompts, so nothing
       below it moves. */
    var card = h.svgEl('g', { 'class': 'pcard' }, gTop);
    var cardBody = h.svgEl('rect', { 'class': 'pc-body', x: 0, y: 0, width: w, height: 40, rx: 12 }, card);
    var task = h.label(card, 16, 24, TASK, 'pc-title');
    var STEP = 14, stepW = ORDER.map(function (k) { return measure(card, TITLE[k], 'cx-pk on'); });
    var stepsW = stepW.reduce(function (a, b) { return a + b; }, 0) + STEP * (ORDER.length - 1);
    var oneLine = 16 + task.getComputedTextLength() + 24 + stepsW + 16 <= w;
    var sy = oneLine ? 24 : 46, sx = oneLine ? w - 16 - stepsW : 16;
    var steps = ORDER.map(function (k, i) {
      var t = h.label(card, sx, sy, TITLE[k], 'cx-pk');
      // each prompt is a button: it runs the circuit on view on that prompt
      t.setAttribute('role', 'button');
      t.setAttribute('tabindex', '0');
      t.setAttribute('aria-label', 'Run on the ' + TITLE[k].toLowerCase() + ' prompt');
      t.addEventListener('click', function () { tryPrompt(k); });
      t.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tryPrompt(k); }
      });
      sx += stepW[i] + STEP;
      return t;
    });
    var textY = sy + 24;
    var cText = h.label(card, 16, textY, '', 'pc-text');
    var lines = 1;
    ORDER.forEach(function (k) { lines = Math.max(lines, h.wrap(cText, quote(k), w - 32, 21)); });
    var cardH = textY + (lines - 1) * 21 + 16;
    cardBody.setAttribute('height', cardH);
    var cardK = null;
    function setCard(k) {
      var n = ORDER.indexOf(k);
      cardK = k;
      cText.style.opacity = 1;     // a run cut short mid-fade must not leave the prompt hidden
      steps.forEach(function (t, i) { t.setAttribute('class', 'cx-pk' + (i === n ? ' on' : '')); });
      balance(cText, quote(k), w - 32);
    }

    /* ---- where everything sits */
    var G = narrow ? narrowGeom() : wideGeom();
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + Math.ceil(G.H + 2 * PAD));

    function wideGeom() {
      var g = {};
      var stW = Math.min(196, Math.floor((w - 2 * 26) / 3)), gap = (w - 3 * stW) / 2;
      g.stW = stW;
      g.unit = stW >= needFull;
      g.hubMid = cardH + 40;                         // the hub row: the classifier icon leaves 19 above it
      g.boxTop = g.hubMid - BOX_H / 2;
      g.boxBot = g.hubMid + BOX_H / 2;
      g.stTop = g.boxBot + 30;
      g.st = M.map(function (m, i) { return { x: i * (stW + gap), y: g.stTop }; });
      g.slot = g.st.map(function (s) { return { cx: s.x + stW / 2, cy: s.y + ST_H + 8 + CHIP_H / 2 }; });
      g.gapX = stW + gap / 2;                        // between the first two models: LMCircuit's way past them
      g.pred = { x: w / 2 - PRED_W / 2, y: g.slot[0].cy + CHIP_H / 2 + 32 };
      g.badge = { x: PRED_W - 3, y: 3 };
      g.H = g.pred.y + PRED_H;
      return g;
    }
    function narrowGeom() {
      var g = {}, busL = 22, stX = busL + 24, lane = 16, inset = 18;
      var stW = Math.max(needShort, Math.min(212, w - stX - 8 - chipW - lane - inset));
      var ox = Math.max(0, Math.floor((w - (stX + stW + 8 + chipW + lane + inset)) / 2));
      g.stW = stW;
      g.unit = stW >= needFull;
      g.busL = ox + busL;
      g.netCy = cardH + 16 + 21;
      g.boxTop = g.netCy + 21 + 12;
      g.boxBot = g.boxTop + BOX_H;
      g.st = M.map(function (m, i) { return { x: ox + stX, y: g.boxBot + 20 + i * (ST_H + 20) }; });
      g.slot = g.st.map(function (s) { return { cx: s.x + stW + 8 + chipW / 2, cy: s.y + ST_H / 2 }; });
      g.busR = ox + stX + stW + 8 + chipW + lane;
      g.pred = { x: g.busR + inset - PRED_W, y: g.st[2].y + ST_H + 28 };
      g.badge = { x: 3, y: 3 };
      g.H = g.pred.y + PRED_H;
      return g;
    }

    function chip(parent, cx, cy, x) {
      var g = h.svgEl('g', { 'class': 'chip-g ' + (x ? 'h' : 's') }, parent);
      h.svgEl('rect', { 'class': 'chip ' + (x ? 'h' : 's'), x: cx - chipW / 2, y: cy - CHIP_H / 2, width: chipW, height: CHIP_H, rx: CHIP_H / 2 }, g);
      h.label(g, cx, cy + 5, x ? 'HARMFUL' : 'SAFE', 'chip-t', { 'text-anchor': 'middle' });
      return g;
    }
    // an answer slot: dashed while empty, then the model's answer
    function slot(parent, cx, cy) {
      var s = {};
      s.empty = h.svgEl('rect', { 'class': 'cx-slot', x: cx - chipW / 2, y: cy - CHIP_H / 2, width: chipW, height: CHIP_H, rx: CHIP_H / 2 }, parent);
      s.chips = [chip(parent, cx, cy, 0), chip(parent, cx, cy, 1)];
      s.clear = function () { setVisible(s.empty, true); s.chips.forEach(function (c) { setVisible(c, false); }); };
      s.hide = function () { setVisible(s.empty, false); };
      s.fill = function (x) {
        setVisible(s.empty, false);
        var c = s.chips[x];
        setVisible(c, true);
        return h.tween(T.ask, function (t) { fadeIn(c, t); });
      };
      s.clear();
      return s;
    }

    var stations = M.map(function (m, i) {
      var st = kit.station(gTop, G.st[i].x, G.st[i].y, m, { w: G.stW, h: ST_H, unit: G.unit });
      return { st: st, slot: slot(gTop, G.slot[i].cx, G.slot[i].cy) };
    });

    // the prediction: a navy block, with a badge on its corner once it is known to be right or wrong
    var gPred = h.svgEl('g', { 'class': 'cx-pred', transform: 'translate(' + G.pred.x + ',' + G.pred.y + ')' }, gTop);
    h.svgEl('rect', { 'class': 'cx-pred-b', x: 0, y: 0, width: PRED_W, height: PRED_H, rx: 12 }, gPred);
    h.label(gPred, PRED_W / 2, 22, 'prediction', 'cx-pred-t', { 'text-anchor': 'middle' });
    var predV = h.label(gPred, PRED_W / 2, 44, '', 'cx-pred-v', { 'text-anchor': 'middle' });
    function badge(ok) {
      var g = h.svgEl('g', { 'class': 'cx-badge ' + (ok ? 'ok' : 'bad'), transform: 'translate(' + G.badge.x + ',' + G.badge.y + ')' }, gPred);
      h.svgEl('circle', { cx: 0, cy: 0, r: 9.5 }, g);
      h.svgEl('path', { d: ok ? 'M-3.8,0.2 L-1.2,2.8 L4,-2.6' : 'M-3,-3 L3,3 M3,-3 L-3,3' }, g);
      setVisible(g, false);
      return g;
    }
    var badges = [badge(false), badge(true)];

    /* ---- wiring of one circuit: its wires, and its router or prompt classifier */
    var Wr = null;
    function wire(d) { return kit.wire(gWire, d); }
    function hubBox(cx, top, text, x) {
      var bw = Math.max(96, Math.ceil(measure(gHub, text, 'cx-box-t') + 36));
      var bx = x === undefined ? cx - bw / 2 : x;
      var g = h.svgEl('g', { 'class': 'cx-box', transform: 'translate(' + bx + ',' + top + ')' }, gHub);
      h.svgEl('rect', { 'class': 'cx-box-b', x: 0, y: 0, width: bw, height: BOX_H, rx: 10 }, g);
      h.label(g, bw / 2, BOX_H / 2 + 5, text, 'cx-box-t', { 'text-anchor': 'middle' });
      return { g: g, x: bx, w: bw };
    }
    function drawCircuit(c) {
      gWire.innerHTML = ''; gHub.innerHTML = '';
      Wr = { entry: [], fan: [], chain: [], out: [], bypass: null, lit: [] };
      if (narrow) wireNarrow(c); else wireWide(c);
    }
    function wireWide(c) {
      var cx = w / 2, mid = G.stTop + ST_H / 2, slotBot = G.slot[0].cy + CHIP_H / 2;
      if (c.key === 'vote') Wr.entry.push(wire(line(cx, cardH, cx, G.boxBot)));
      if (c.key === 'route') {
        Wr.lit.push([hubBox(cx, G.boxTop, 'Router').g]);
        Wr.entry.push(wire(line(cx, cardH, cx, G.boxTop)));
      }
      if (c.key === 'lmc') {
        // the prompt classifier reads the prompt and feeds the ask-or-stop box beside it
        var box = hubBox(cx, G.boxTop, 'Ask or stop');
        var ncx = box.x - 26 - 21, nx = ncx - 21, ny = G.hubMid - 21.75;
        var net = kit.net(gHub, nx, ny, NET_S);
        h.label(gHub, nx - 8, G.hubMid + 5, 'Prompt classifier', 'cx-hub-l', { 'text-anchor': 'end' });
        Wr.entry.push(wire(line(ncx, cardH, ncx, ny + 1.5)));
        Wr.entry.push(wire(line(nx + 41, G.hubMid, box.x, G.hubMid)));
        Wr.lit.push([net], [box.g]);
      }
      M.forEach(function (m, i) {
        var s = G.st[i], scx = s.x + G.stW / 2;
        if (c.key === 'cascade') {
          // straight down into the first model, then along the row
          if (!i) Wr.fan[0] = wire(line(scx, cardH, scx, G.stTop));
          else Wr.chain[i] = wire(line(G.st[i - 1].x + G.stW, mid, s.x, mid));
        } else Wr.fan[i] = wire(vcurve(cx, G.boxBot, scx, G.stTop));
        Wr.out[i] = wire(vcurve(scx, slotBot, cx, G.pred.y));
      });
      if (c.key === 'lmc') {
        // past the models: between the first two blocks and their answers
        var gx = G.gapX, y1 = (G.boxBot + G.stTop) / 2, y2 = (slotBot + G.pred.y) / 2;
        Wr.bypass = wire('M' + cx + ',' + G.boxBot + ' C' + cx + ',' + y1 + ' ' + gx + ',' + y1 + ' ' + gx + ',' + G.stTop +
          ' L' + gx + ',' + slotBot + ' C' + gx + ',' + y2 + ' ' + cx + ',' + y2 + ' ' + cx + ',' + G.pred.y);
      }
    }
    function wireNarrow(c) {
      var L = G.busL, predMid = G.pred.y + PRED_H / 2;
      var mids = G.st.map(function (s) { return s.y + ST_H / 2; });
      if (c.key === 'vote') Wr.entry.push(wire(line(L, cardH, L, G.boxBot)));
      if (c.key === 'route') {
        Wr.lit.push([hubBox(0, G.boxTop, 'Router', L - 20).g]);
        Wr.entry.push(wire(line(L, cardH, L, G.boxTop)));
      }
      if (c.key === 'lmc') {
        // on the bus: the prompt classifier, turned to read top to bottom, then the ask-or-stop box
        var turn = h.svgEl('g', { transform: 'translate(' + L + ',' + G.netCy + ') rotate(90)' }, gHub);
        var net = kit.net(turn, -28 * NET_S, -29 * NET_S, NET_S);
        h.label(gHub, L + 30, G.netCy + 5, 'Prompt classifier', 'cx-hub-l');
        var box = hubBox(0, G.boxTop, 'Ask or stop', L - 20);
        Wr.entry.push(wire(line(L, cardH, L, G.netCy - 19)));
        Wr.entry.push(wire(line(L, G.netCy + 19, L, G.boxTop)));
        Wr.lit.push([net], [box.g]);
      }
      M.forEach(function (m, i) {
        var s = G.st[i];
        if (c.key === 'cascade') {
          // the bus into the first model, then down the column
          if (!i) Wr.fan[0] = wire(downRight(L, cardH, s.x, mids[0]));
          else Wr.chain[i] = wire(line(s.x + 28, G.st[i - 1].y + ST_H, s.x + 28, s.y));
        } else Wr.fan[i] = wire(downRight(L, G.boxBot, s.x, mids[i]));
        Wr.out[i] = wire(rightDown(G.slot[i].cx + chipW / 2, mids[i], G.busR, G.pred.y));
      });
      if (c.key === 'lmc') Wr.bypass = wire(downRight(L, G.boxBot, G.pred.x, predMid));
    }
    function allWires() {
      return Wr.entry.concat(Wr.fan, Wr.chain, Wr.out, Wr.bypass ? [Wr.bypass] : []).filter(Boolean);
    }
    // light a wire and send the signal along it (the lit wire is drawn on top)
    function send(wo, alive) {
      if (!wo) return Promise.resolve();
      wo.live(true);
      gWire.appendChild(wo.el);
      var ms = Math.max(WIRE_MIN, Math.min(WIRE_MAX, wo.el.getTotalLength() / SPEED));
      return h.pulse(gDot, wo.el, ms, alive);
    }
    function hubOn(n, on) { (Wr.lit[n] || []).forEach(function (g) { g.classList.toggle('on', on); }); }

    /* ---- readouts: calls and cost of the prompt running; the chance harmful
       where the circuit keeps one (the cascade and LMCircuit) */
    var spent = 0, costMoves = 0;
    function readReset(c, q) {
      rCalls.textContent = '0';
      costMoves++; spent = 0; rCost.textContent = h.usd(0);
      rQbox.style.visibility = q === null ? 'hidden' : '';
      if (q !== null) rQ.textContent = h.pct(q);
    }
    function readAdd(calls, cost) {
      rCalls.textContent = String(calls);
      var id = ++costMoves, from = spent;
      spent += cost;
      return h.tween(600, function (t) { if (id === costMoves) rCost.textContent = h.usd(from + cost * t); });
    }

    /* ---- the sentence and the scoreboard, under the drawing */
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
    // read out whole: the complete results, whatever the drawing shows at the moment
    var bsvg = h.svgEl('svg', { role: 'img', 'aria-label': 'Right answers and cost for one million prompts of each kind. ' +
      CIRCUITS.map(function (c, i) { return c.name + ': ' + RESULTS[i].right + ' of ' + RESULTS[i].of + ' right, ' + h.usd(RESULTS[i].cost) + '.'; }).join(' ') }, bHost);
    var board = h.svgEl('g', { transform: 'translate(' + PAD + ',' + PAD + ')' }, bsvg);
    var rows = scoreboard(board);
    bsvg.setAttribute('viewBox', '0 0 ' + W + ' ' + Math.ceil(rows.height + 2 * PAD));

    /* One row per circuit: name, right answers and a bar of the cost on one
       line under a header, or (when the bar would get too short) name and right
       answers, then the bar. A row is drawn complete and kept hidden until
       show(); its numbers never count up. */
    function scoreboard(g) {
      var IN = 12, list = [], y0 = 26, rowH;
      var nameW = 0;
      CIRCUITS.forEach(function (c) { nameW = Math.max(nameW, measure(g, c.name, 'cx-bname', 'cx-row cur')); });
      var colR = IN + nameW + 20, colC = colR + measure(g, '3 of 3', 'cx-bnum') + 22;
      var numW = measure(g, h.usd(MAX_SPEND), 'cx-bnum');
      var barMax = Math.min(240, w - IN - numW - 8 - colC);
      var one = barMax >= 70;
      var headC = 'Cost for 1M prompts of each kind';
      if (one) {
        if (colC + measure(g, headC, 'cx-bhead') > w - IN) headC = 'Cost, 1M of each kind';
        if (colC + measure(g, headC, 'cx-bhead') > w - IN) headC = 'Cost, 1M of each';
        h.label(g, colR, 16, 'Right', 'cx-bhead');
        h.label(g, colC, 16, headC, 'cx-bhead');
        rowH = 32;
      } else {
        if (IN + measure(g, headC, 'cx-bhead') > w - IN) headC = 'Cost, 1M of each kind';
        h.label(g, IN, 16, headC, 'cx-bhead');
        colC = IN;
        barMax = Math.min(240, w - 2 * IN - numW - 8);
        rowH = 54;
      }
      CIRCUITS.forEach(function (c, i) {
        var top = y0 + i * rowH, res = RESULTS[i];
        var rg = h.svgEl('g', { 'class': 'cx-row' }, g);
        h.svgEl('rect', { 'class': 'cx-band', x: 0, y: top + 2, width: w, height: rowH - 4, rx: 9 }, rg);
        var base = !one ? top + 23 : top + rowH / 2 + 5;
        var barY = !one ? top + 40 : top + rowH / 2;
        h.label(rg, IN, base, c.name, 'cx-bname');
        var bw = barMax * res.cost / MAX_SPEND;
        var bar = h.svgEl('rect', { 'class': 'cx-bar', x: colC, y: barY - 5, width: 0, height: 10, rx: 5 }, rg);
        var nums = h.svgEl('g', { 'class': 'cx-nums' }, rg);
        var score = res.right + ' of ' + res.of + (!one ? ' right' : '');
        if (!one) h.label(nums, w - IN, base, score, 'cx-bnum', { 'text-anchor': 'end' });
        else h.label(nums, colR, base, score, 'cx-bnum');
        h.label(nums, colC + bw + (res.cost ? 8 : 0), !one ? barY + 5 : base, h.usd(res.cost), 'cx-bnum');
        var shown = false, moves = 0;
        function hide() { moves++; shown = false; bar.setAttribute('width', 0); nums.style.opacity = 0; }
        hide();
        list.push({
          clear: hide,
          // the complete result: the bar grows to it, the numbers fade in already final
          show: function (animate) {
            if (shown) return;
            shown = true;
            var id = ++moves;
            if (!animate) { bar.setAttribute('width', bw); nums.style.opacity = 1; return; }
            h.tween(700, function (t) {
              if (id !== moves) return;
              bar.setAttribute('width', bw * t);
              nums.style.opacity = Math.min(1, t * 1.6);
            });
          },
          cur: function (on) { rg.classList.toggle('cur', on); }
        });
      });
      list.height = y0 + CIRCUITS.length * rowH;
      return list;
    }

    /* ---- playing */
    // the walk waits while the figure is off screen or the page is hidden
    var seen = !('IntersectionObserver' in window), waiters = [];
    function onScreen() { return ctx.reduce || (seen && !document.hidden); }
    function hold() { return onScreen() ? Promise.resolve() : new Promise(function (r) { waiters.push(r); }); }
    function wake() {
      fig.classList.toggle('cx-paused', !onScreen());
      if (!onScreen()) return;
      var ws = waiters; waiters = [];
      ws.forEach(function (f) { f(); });
    }
    // a rebuild (new width) replaces the watchers of the drawing it replaces
    if (fig._cxStop) fig._cxStop();
    var io = null;
    if (!seen) {
      io = new IntersectionObserver(function (es) {
        var e = es[es.length - 1];
        seen = e.isIntersecting && e.intersectionRatio > .1;
        wake();
      }, { threshold: [0, .1, .2] });
      io.observe(fig);
    }
    document.addEventListener('visibilitychange', wake);
    fig._cxStop = function () {
      if (io) io.disconnect();
      document.removeEventListener('visibilitychange', wake);
      var ws = waiters; waiters = [];
      ws.forEach(function (f) { f(); });   // the old runs wake, see their drawing gone and end
    };

    function resetPrompt() {
      allWires().forEach(function (wo) { wo.live(false); wo.off(false); wo.el.classList.remove('gone'); });
      Wr.lit.forEach(function (n, k) { hubOn(k, false); });
      stations.forEach(function (s) { s.st.state(''); s.slot.clear(); });
      predV.textContent = '';
      predV.style.opacity = 0;     // it fades in when the new prediction is set
      badges.forEach(function (b) { setVisible(b, false); b.style.opacity = ''; });
    }
    // the answers and the prediction of the prompt just answered fade out with it
    function fadeOld(t) {
      stations.forEach(function (s) { s.slot.chips.forEach(function (c) { c.style.opacity = 1 - t; }); });
      predV.style.opacity = 1 - t;
      badges.forEach(function (b) { b.style.opacity = 1 - t; });
    }
    var shown = 0;               // the circuit on view
    function select(i) {
      shown = i;
      tabs.forEach(function (b, j) {
        b.setAttribute('aria-checked', j === i ? 'true' : 'false');
        b.tabIndex = j === i ? 0 : -1;
      });
      rows.forEach(function (r, j) { r.cur(j === i); });
      say.textContent = CIRCUITS[i].say;
      drawCircuit(CIRCUITS[i]);
      // nothing of the circuit it replaces stays on screen
      resetPrompt();
      var q0 = CIRCUITS[i].trace(ORDER[0]).q;
      readReset(CIRCUITS[i], q0 ? q0[0] : null);
      // the new wiring fades in rather than snapping into place
      h.tween(400, function (t) { gWire.style.opacity = t; gHub.style.opacity = t; });
    }

    /* One prompt through circuit c. Returns whether it was right, or null when
       the run was cut short (every await is followed by a check of alive). */
    async function runPrompt(c, k, alive, now) {
      var p = P[k], tr = c.trace(k), asked = [];
      async function go(promise) { await promise; return alive(); }
      if (!await go(hold())) return null;
      // a new prompt fades in; the one already on the card stays put.
      // A prompt picked on the card (now) starts at once, with no fade or pause.
      var swap = cardK !== k && !now;
      if (now) allWires().forEach(function (wo) { wo.live(false); });
      if (swap) allWires().forEach(function (wo) { wo.live(false); });
      if (swap && !await go(h.tween(T.swap, function (t) { if (alive()) { cText.style.opacity = 1 - t; fadeOld(t); } }))) return null;
      resetPrompt();
      setCard(k);
      if (swap) cText.style.opacity = 0;
      readReset(c, tr.q ? tr.q[0] : null);
      if (swap && !await go(h.tween(T.swap, function (t) { if (alive()) cText.style.opacity = t; }))) return null;
      if (!now && !await go(h.sleep(T.beat))) return null;
      // into the circuit: to the router, or through the prompt classifier to ask or stop
      for (var e = 0; e < Wr.entry.length; e++) {
        if (!await go(hold()) || !await go(send(Wr.entry[e], alive))) return null;
        if (Wr.lit[e]) { hubOn(e, true); if (!await go(h.sleep(T.hub))) return null; }
      }
      for (var g = 0; g < tr.groups.length; g++) {
        var grp = tr.groups[g];
        // a cascade hands the prompt along the row; the others send it from the top
        if (!await go(hold())) return null;
        if (!await go(Promise.all(grp.map(function (i) { return send(g > 0 && c.key === 'cascade' ? Wr.chain[i] : Wr.fan[i], alive); })))) return null;
        var cost = 0;
        grp.forEach(function (i) { stations[i].st.state('active'); cost += M[i].cost; asked.push(i); });
        readAdd(asked.length, cost);
        if (!await go(Promise.all(grp.map(function (i) { return stations[i].slot.fill(p.answers[i]); })))) return null;
        // a circuit that keeps a chance harmful pauses on it; the others go straight on
        if (tr.q) rQ.textContent = h.pct(tr.q[g + 1]);
        if (!await go(h.sleep(tr.q ? T.beat : T.beat / 2))) return null;
      }
      // out to the prediction: every vote, or the last answer, or straight past the models
      var outs = !asked.length ? [Wr.bypass]
        : c.key === 'vote' ? asked.map(function (i) { return Wr.out[i]; })
        : [Wr.out[asked[asked.length - 1]]];
      if (!await go(hold()) || !await go(Promise.all(outs.map(function (wo) { return send(wo, alive); })))) return null;
      var ok = tr.predict === p.label;
      predV.textContent = tr.predict ? 'HARMFUL' : 'SAFE';
      if (!await go(h.tween(T.pred, function (t) { if (alive()) fadeIn(predV, t); }))) return null;
      setVisible(badges[ok ? 1 : 0], true);
      // what the circuit did not use steps back; a model it did not ask has no answer to send on
      stations.forEach(function (s, i) {
        if (asked.indexOf(i) >= 0) return;
        s.st.state('dim'); s.slot.hide();
        if (Wr.out[i]) Wr.out[i].el.classList.add('gone');
      });
      allWires().forEach(function (wo) { if (!wo.el.classList.contains('live')) wo.off(true); });
      return ok;
    }

    var running = -1;            // the circuit being walked, whose row is still empty
    async function runCircuit(i, alive) {
      select(i);
      running = i;
      for (var n = 0; n < ORDER.length; n++) {
        var ok = await runPrompt(CIRCUITS[i], ORDER[n], alive);
        if (ok === null || !alive()) return;
        if (n < ORDER.length - 1) await h.sleep(T.prompt);
      }
      if (!alive()) return;
      running = -1;
      rows[i].show(true);
    }

    // a tab plays its own circuit; Replay (the runner) walks through all four
    var token = 0, picked = false;
    replay.addEventListener('click', function () { picked = false; });   // runs before the runner's handler
    function pick(i) {
      var mine = ++token;
      picked = true;
      // the circuit whose walk this cuts short shows its complete result, not a part of it
      if (running >= 0 && running !== i) rows[running].show(false);
      runCircuit(i, function () { return mine === token && svg.isConnected; });
    }

    // a prompt on the card runs the circuit on view on that prompt alone
    function tryPrompt(k) {
      var mine = ++token;
      picked = true;
      if (running >= 0) { rows[running].show(false); running = -1; }
      var alive = function () { return mine === token && svg.isConnected; };
      var i = shown;
      select(i);
      runPrompt(CIRCUITS[i], k, alive, true);
    }

    select(0);
    setCard(ORDER[0]);

    return async function play(alive) {
      if (picked) return;
      var mine = ++token;
      var live = function () { return alive() && mine === token && svg.isConnected; };
      running = -1;
      rows.forEach(function (r) { r.clear(); });
      for (var i = 0; i < CIRCUITS.length; i++) {
        if (!live()) return;
        await runCircuit(i, live);
        if (!live()) return;
        if (i < CIRCUITS.length - 1) { await h.sleep(T.circuit); await hold(); }
      }
    };
  });
})();
