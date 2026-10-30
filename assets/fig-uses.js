/* fig-uses: what people use LLM classifiers for, one small looping scene per use case.

   The #uses screen has four tiles (.uc[data-uc]), each with an empty .uc-anim
   box. Every box gets its own svg, drawn at the box's own width (one unit per
   CSS pixel, so type stays at 14 px) and redrawn when that width changes. The
   cast is the same in all four: a solid LLM block on the left, wired to the
   items it labels on the right.
     social      posts and articles scroll by, and each gets a topic tag
     health      an answer is checked against three criteria: ticks and crosses
     moderation  messages arrive and are allowed or flagged under a policy
     evaluation  two answers, A and B, and the judge picks the better one
   The scenes start when the grid scrolls into view, loop while their tile is
   on screen and pause when it is not. With reduced motion (or ?still, ?qa)
   each shows one finished frame. */
(function () {
  'use strict';
  var h = LC.h, el = h.svgEl;

  var H = 150, MID = H / 2;      // every scene is this tall; the LLM block sits on its middle line
  var MARGIN = 12;               // scene to the edge of its box
  var MAX_W = 300;               // in a wider box the scene is centred, not stretched
  var LLM_W = 48, LLM_H = 32;
  var GAP = 20;                  // LLM block to the items, room for a wire's elbow
  var CHIP_PAD = 10;             // chip text to chip edge, each side

  // a fixed pseudo-random sequence, so every visit shows the same posts
  function rng(seed) {
    var s = seed;
    return function (lo, hi) { s = (s * 16807) % 2147483647; return lo + (hi - lo) * s / 2147483647; };
  }

  /* ---------------------------------------------------------------- pieces */

  function stage(box) {
    box.textContent = '';
    var W = Math.max(200, Math.round(box.clientWidth || 260));
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, 'aria-hidden': 'true', focusable: 'false' }, box);
    var cw = Math.min(W - 2 * MARGIN, MAX_W), x0 = Math.round((W - cw) / 2);
    var s = { svg: svg, x0: x0, ix: x0 + LLM_W + GAP, iw: cw - LLM_W - GAP };
    s.under = el('g', {}, svg);            // wires run under everything else
    var g = el('g', { 'class': 'uc-llm', transform: 'translate(' + x0 + ',' + (MID - LLM_H / 2) + ')' }, svg);
    el('rect', { width: LLM_W, height: LLM_H, rx: 9 }, g);
    h.label(g, LLM_W / 2, LLM_H / 2 + 5, 'LLM', null, { 'text-anchor': 'middle' });
    s.llm = function (on) { g.classList.toggle('on', !!on); };
    return s;
  }

  // a wire from the LLM block to the items' edge at height y: straight, or with two rounded elbows
  function wire(s, y) {
    var x1 = s.x0 + LLM_W, x2 = s.ix, d;
    if (Math.abs(y - MID) < 1) d = 'M' + x1 + ',' + MID + ' H' + x2;
    else {
      var mx = (x1 + x2) / 2, r = Math.min(6, Math.abs(y - MID) / 2, (x2 - x1) / 2), k = y > MID ? 1 : -1;
      d = 'M' + x1 + ',' + MID + ' H' + (mx - r) + ' Q' + mx + ',' + MID + ' ' + mx + ',' + (MID + k * r) +
        ' V' + (y - k * r) + ' Q' + mx + ',' + y + ' ' + (mx + r) + ',' + y + ' H' + x2;
    }
    var p = el('path', { 'class': 'uc-wire', d: d }, s.under);
    return {
      el: p,
      live: function (on) { p.classList.toggle('live', !!on); },
      off: function (on) { p.classList.toggle('off', !!on); }
    };
  }

  function textW(svg, str, cls) {
    var t = h.label(svg, 0, -40, str, cls);
    var w = t.getComputedTextLength();
    t.remove();
    return w;
  }

  // a label chip, right edge at x and centred on cy; kind 'tag' (blue), 'ok' (green) or 'no' (red)
  function chip(parent, x, cy, text, kind) {
    var g = el('g', { 'class': 'uc-chip ' + kind }, parent);
    var r = el('rect', { y: cy - 11, height: 22, rx: 11 }, g);
    var t = h.label(g, 0, cy + 5, text, 'uc-chip-t', { 'text-anchor': 'middle' });
    var w = Math.ceil(t.getComputedTextLength()) + 2 * CHIP_PAD;
    r.setAttribute('x', x - w); r.setAttribute('width', w);
    t.setAttribute('x', x - w / 2);
    return g;
  }

  // a tick (criterion met, answer preferred) or a cross, in a solid disc
  function mark(parent, cx, cy, ok) {
    var g = el('g', { 'class': 'uc-mark ' + (ok ? 'ok' : 'no') }, parent);
    el('circle', { cx: cx, cy: cy, r: 9 }, g);
    el('path', { d: ok ? 'M' + (cx - 4) + ',' + (cy + .5) + ' l2.8,2.8 l5.2,-5.6'
      : 'M' + (cx - 3.2) + ',' + (cy - 3.2) + ' l6.4,6.4 M' + (cx + 3.2) + ',' + (cy - 3.2) + ' l-6.4,6.4' }, g);
    g.cx = cx; g.cy = cy;
    return g;
  }

  // a line of text, drawn as a grey bar: the scenes need no words to show an item
  function bar(parent, x, cy, w, cls) {
    return el('rect', { 'class': cls || 'uc-bar', x: x, y: cy - 2.5, width: Math.max(8, Math.round(w)), height: 5, rx: 2.5 }, parent);
  }

  // a speech bubble with its tail at the bottom left
  function bubble(x, y, w, hh) {
    var r = Math.min(10, hh / 2), b = y + hh;
    return 'M' + (x + r) + ',' + y + ' H' + (x + w - r) + ' Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) +
      ' V' + (b - r) + ' Q' + (x + w) + ',' + b + ' ' + (x + w - r) + ',' + b +
      ' H' + (x + 20) + ' L' + (x + 8) + ',' + (b + 6) + ' L' + (x + 11) + ',' + b +
      ' H' + (x + r) + ' Q' + x + ',' + b + ' ' + x + ',' + (b - r) + ' V' + (y + r) + ' Q' + x + ',' + y + ' ' + (x + r) + ',' + y + ' Z';
  }

  /* --------------------------------------------------------------- motion
     Nothing here scales text: chips slide in, marks (no text) pop. */

  function fade(nodes, from, to, ms, ok) {
    nodes = [].concat(nodes).filter(Boolean);
    return h.tween(ms, function (t) { if (ok()) nodes.forEach(function (n) { n.style.opacity = from + (to - from) * t; }); });
  }
  // fades a node in while it slides into place by (dx, dy)
  function enter(node, dx, dy, ms, ok) {
    node.style.opacity = 0;
    return h.tween(ms, function (t) {
      if (!ok()) return;
      node.style.opacity = t;
      node.setAttribute('transform', 'translate(' + dx * (1 - t) + ',' + dy * (1 - t) + ')');
    });
  }
  function pop(m, ok) {
    m.style.opacity = 0;
    return h.tween(300, function (t) {
      if (!ok()) return;
      var k = .6 + .4 * t;
      m.style.opacity = t;
      m.setAttribute('transform', 'translate(' + m.cx + ',' + m.cy + ') scale(' + k + ') translate(' + (-m.cx) + ',' + (-m.cy) + ')');
    });
  }
  function pause(ms, c) { return h.sleep(ms).then(function () { return c.ok() ? c.wait() : null; }); }

  /* --------------------------------------------------------------- scenes
     Each returns { still, step }. still() draws the finished frame; step(c)
     plays one round, checking c.ok() after every wait and c.wait() (the tile
     is back on screen) between beats. A round ends in the scene's rest frame. */

  // social science: a feed scrolls up; the post level with the LLM gets a topic tag
  var TAGS = ['jobs', 'crime', 'taxes', 'trade'];
  var AVATARS = ['#91A7DE', '#E0B4A3', '#9CCBB8', '#D6C08C'];

  function social(box) {
    var s = stage(box), rand, n;
    var RH = 36, P = RH + 8, SLOTS = [MID - P, MID, MID + P];
    var tagW = Math.max.apply(null, TAGS.map(function (t) { return textW(s.svg, t, 'uc-chip-t'); })) + 2 * CHIP_PAD;
    var barMax = Math.max(24, Math.min(120, s.iw - 30 - 8 - tagW - 10));
    var w = wire(s, MID), feed = el('g', {}, s.svg), rows = [];

    // a post (round avatar) or, every third item, a news article (square thumbnail)
    function row(y) {
      var k = n++, g = el('g', { 'class': 'uc-row' }, feed);
      el('rect', { 'class': 'uc-card', x: s.ix, y: -RH / 2, width: s.iw, height: RH, rx: 9 }, g);
      if (k % 3 === 2) el('rect', { 'class': 'uc-thumb', x: s.ix + 8, y: -7, width: 14, height: 14, rx: 3 }, g);
      else el('circle', { 'class': 'uc-av', cx: s.ix + 15, cy: 0, r: 6.5, fill: AVATARS[k % AVATARS.length] }, g);
      bar(g, s.ix + 30, -5, barMax * rand(.75, 1));
      bar(g, s.ix + 30, 5, barMax * rand(.4, .7));
      var r = { g: g, k: k, y: y };
      place(r, y);
      return r;
    }
    // rows fade out near the top edge and in near the bottom one, so the edge never cuts a row
    function place(r, y) {
      r.y = y;
      r.g.setAttribute('transform', 'translate(0,' + y + ')');
      r.g.style.opacity = Math.max(0, Math.min(1, (y - RH / 2 - 2) / 10, (H - 2 - y - RH / 2) / 10));
    }
    function tag(r) { return chip(r.g, s.ix + s.iw - 8, 0, TAGS[r.k % TAGS.length], 'tag'); }
    function setup(coded) {
      feed.textContent = ''; n = 0; rand = rng(11);
      rows = SLOTS.map(function (y) { return row(y); });
      rows.forEach(function (r, i) { if (i < coded) tag(r); });
      s.llm(false); w.live(false);
    }
    setup(2);

    return {
      still: function () { setup(3); },
      step: async function (c) {
        await pause(900, c); if (!c.ok()) return;
        // the feed moves up one post
        var fresh = row(SLOTS[2] + P), all = rows.concat(fresh), from = all.map(function (r) { return r.y; });
        await h.tween(750, function (t) { if (c.ok()) all.forEach(function (r, i) { place(r, from[i] - P * t); }); });
        if (!c.ok()) return;
        rows[0].g.remove();
        rows = [rows[1], rows[2], fresh];
        await pause(250, c); if (!c.ok()) return;
        // the LLM codes the post level with it
        var r = rows[1];
        s.llm(true); w.live(true); r.g.classList.add('lit');
        await h.sleep(800); if (!c.ok()) return;
        await enter(tag(r), 6, 0, 280, c.ok);
        await h.sleep(200);
        s.llm(false); w.live(false); r.g.classList.remove('lit');
      }
    };
  }

  // health: an answer is checked against three criteria, one at a time
  var CHECKS = [[1, 1, 0], [1, 0, 1], [0, 1, 1]];

  function health(box) {
    var s = stage(box), rand = rng(5), round = 1;
    var BY = 12, BH = 32;                                   // the answer
    var CY = 54, PITCH = 26, ROWS = [0, 1, 2].map(function (k) { return CY + 16 + k * PITCH; });
    var MX = s.ix + s.iw - 17;                              // where the ticks go
    // the grader reads the answer and each criterion in turn
    var wires = [wire(s, BY + BH / 2), wire(s, MID)];
    el('path', { 'class': 'uc-card', d: bubble(s.ix, BY, s.iw, BH) }, s.svg);
    var ans = el('g', {}, s.svg), lines = [bar(ans, s.ix + 12, BY + 11, 0), bar(ans, s.ix + 12, BY + 21, 0)];
    function answer() {
      lines[0].setAttribute('width', Math.round((s.iw - 24) * rand(.8, 1)));
      lines[1].setAttribute('width', Math.round((s.iw - 24) * rand(.35, .65)));
    }
    answer();
    // the criteria, written by physicians: a medical cross, the criterion, and a ring for the verdict
    el('rect', { 'class': 'uc-card', x: s.ix, y: CY, width: s.iw, height: 32 + 2 * PITCH, rx: 10 }, s.svg);
    var hl = ROWS.map(function (y, k) {
      var r = el('rect', { 'class': 'uc-hl', x: s.ix + 4, y: y - 11, width: s.iw - 8, height: 22, rx: 6 }, s.svg);
      r.style.opacity = 0;
      el('path', { 'class': 'uc-med', d: 'M' + (s.ix + 13.2) + ',' + (y - 5) + ' h3.6 v3.2 h3.2 v3.6 h-3.2 v3.2 h-3.6 v-3.2 h-3.2 v-3.6 h3.2 Z' }, s.svg);
      bar(s.svg, s.ix + 28, y, (s.iw - 28 - 36) * [1, .72, .88][k]);
      el('circle', { 'class': 'uc-ring', cx: MX, cy: y, r: 8 }, s.svg);
      return r;
    });
    var marks = el('g', {}, s.svg);
    function setMarks(res) {
      marks.textContent = ''; marks.style.opacity = 1;
      if (res) res.forEach(function (ok, k) { mark(marks, MX, ROWS[k], ok); });
    }
    setMarks(CHECKS[0]);

    return {
      still: function () { setMarks(CHECKS[0]); },
      step: async function (c) {
        await pause(1600, c); if (!c.ok()) return;
        // a new answer to the same criteria
        await fade([marks, ans], 1, 0, 380, c.ok); if (!c.ok()) return;
        setMarks(null); answer();
        await fade(ans, 0, 1, 380, c.ok);
        var res = CHECKS[round++ % CHECKS.length];
        for (var k = 0; k < 3; k++) {
          await pause(250, c); if (!c.ok()) return;
          s.llm(true); wires.forEach(function (x) { x.live(true); });
          await fade(hl[k], 0, 1, 220, c.ok);
          await h.sleep(520); if (!c.ok()) return;
          await pop(mark(marks, MX, ROWS[k], res[k]), c.ok);
          s.llm(false); wires.forEach(function (x) { x.live(false); });
          await fade(hl[k], 1, 0, 260, c.ok);
        }
      }
    };
  }

  // content moderation: messages arrive and are allowed or flagged under a written policy
  var VERDICTS = [[1, 0, 1], [1, 1, 0], [0, 1, 1]];   // 1 allow, 0 flag

  function moderation(box) {
    var s = stage(box), rand = rng(3), round = 1;
    var SLOTS = [MID - 44, MID, MID + 44], BH = 30;
    // the policy: a page above the LLM block, wired into it
    var PW = 26, PH = 30, px = s.x0 + (LLM_W - PW) / 2, py = MID - LLM_H / 2 - 12 - PH, f = 8;
    var feedIn = el('path', { 'class': 'uc-wire', d: 'M' + (s.x0 + LLM_W / 2) + ',' + (py + PH) + ' V' + (MID - LLM_H / 2) }, s.under);
    var pg = el('g', { 'class': 'uc-page' }, s.svg);
    el('path', { 'class': 'uc-page-body', d: 'M' + px + ',' + py + ' H' + (px + PW - f) + ' L' + (px + PW) + ',' + (py + f) + ' V' + (py + PH) + ' H' + px + ' Z' }, pg);
    el('path', { 'class': 'uc-page-fold', d: 'M' + (px + PW - f) + ',' + py + ' V' + (py + f) + ' H' + (px + PW) }, pg);
    [10, 16, 22].forEach(function (dy, i) {
      el('rect', { 'class': i ? 'uc-page-line' : 'uc-page-head', x: px + 5, y: py + dy, width: i === 2 ? 10 : 15, height: 2.5, rx: 1.25 }, pg);
    });

    var chipW = Math.max(textW(s.svg, 'allow', 'uc-chip-t'), textW(s.svg, 'flag', 'uc-chip-t')) + 2 * CHIP_PAD;
    var bmax = s.iw - chipW - 10;
    var wires = SLOTS.map(function (y) { return wire(s, y); });
    var thread = el('g', {}, s.svg);

    function message(k, ok) {
      var y = SLOTS[k], g = el('g', { 'class': 'uc-msg' }, thread), bw = Math.round(bmax * rand(.62, 1));
      el('path', { 'class': 'uc-card', d: bubble(s.ix, y - BH / 2, bw, BH) }, g);
      if (bw >= 64) { bar(g, s.ix + 11, y - 5, (bw - 22) * rand(.85, 1)); bar(g, s.ix + 11, y + 5, (bw - 22) * rand(.35, .7)); }
      else bar(g, s.ix + 11, y, bw - 22);
      return { g: g, y: y, ok: ok };
    }
    function verdict(m) {
      if (!m.ok) m.g.classList.add('flagged');
      return chip(m.g, s.ix + s.iw, m.y, m.ok ? 'allow' : 'flag', m.ok ? 'ok' : 'no');
    }
    function setup(res) {
      thread.textContent = ''; thread.style.opacity = 1; rand = rng(3);
      res.forEach(function (ok, k) { verdict(message(k, ok)); });
      wires.forEach(function (x) { x.el.style.opacity = 1; x.live(false); });
    }
    setup(VERDICTS[0]);

    return {
      still: function () { setup(VERDICTS[0]); },
      step: async function (c) {
        await pause(1600, c); if (!c.ok()) return;
        await fade([thread].concat(wires.map(function (x) { return x.el; })), 1, 0, 420, c.ok); if (!c.ok()) return;
        thread.textContent = ''; thread.style.opacity = 1;
        var res = VERDICTS[round++ % VERDICTS.length];
        for (var k = 0; k < 3; k++) {
          await pause(350, c); if (!c.ok()) return;
          var m = message(k, res[k]);
          await Promise.all([enter(m.g, 0, 6, 320, c.ok), fade(wires[k].el, 0, 1, 320, c.ok)]);
          await h.sleep(200); if (!c.ok()) return;
          s.llm(true); wires[k].live(true); feedIn.classList.add('live');
          await h.sleep(650); if (!c.ok()) return;
          await enter(verdict(m), 6, 0, 280, c.ok);
          s.llm(false); wires[k].live(false); feedIn.classList.remove('live');
        }
      }
    };
  }

  // model evaluation: two answers, A and B; the judge reads both and picks one
  function evaluation(box) {
    var s = stage(box), rand = rng(9), round = 0;
    var CH = 42, YS = [MID - 28, MID + 28], MX = s.ix + s.iw - 17;
    var bmax = s.iw - 36 - 12 - 18 - 10;
    var wires = YS.map(function (y) { return wire(s, y); });
    var cards = YS.map(function (y, k) {
      var g = el('g', { 'class': 'uc-ans' }, s.svg);
      el('rect', { 'class': 'uc-card', x: s.ix, y: y - CH / 2, width: s.iw, height: CH, rx: 9 }, g);
      el('circle', { 'class': 'uc-badge', cx: s.ix + 18, cy: y, r: 11 }, g);
      h.label(g, s.ix + 18, y + 5, k ? 'B' : 'A', 'uc-badge-t', { 'text-anchor': 'middle' });
      return { g: g, y: y, lines: el('g', {}, g) };
    });
    var tick = null;
    function answers() {
      cards.forEach(function (c) {
        c.lines.textContent = '';
        bar(c.lines, s.ix + 36, c.y - 5, bmax * rand(.75, 1));
        bar(c.lines, s.ix + 36, c.y + 5, bmax * rand(.35, .7));
      });
    }
    function judge(win) {
      cards[win].g.classList.add('win');
      cards[1 - win].g.style.opacity = .4;
      wires[1 - win].off(true);
      tick = mark(s.svg, MX, YS[win], 1);
      return tick;
    }
    function clear() {
      cards.forEach(function (c) { c.g.classList.remove('win', 'lit'); c.g.style.opacity = 1; });
      wires.forEach(function (x) { x.off(false); x.live(false); });
      if (tick) tick.remove();
      tick = null;
    }
    answers(); judge(1);

    return {
      still: function () { clear(); judge(1); },
      step: async function (c) {
        var win = round++ % 2 ? 1 : 0;           // the rest frame shows B; then A, B, A ...
        await pause(1700, c); if (!c.ok()) return;
        // two new answers: the verdict clears while the old ones fade
        var loser = cards.filter(function (x) { return !x.g.classList.contains('win'); })[0];
        cards.forEach(function (x) { x.g.classList.remove('win'); });
        wires.forEach(function (x) { x.off(false); });
        await Promise.all([
          fade(cards.map(function (x) { return x.lines; }).concat(tick), 1, 0, 380, c.ok),
          fade(loser.g, .4, 1, 380, c.ok)
        ]);
        if (!c.ok()) return;
        clear(); answers();
        await fade(cards.map(function (x) { return x.lines; }), 0, 1, 350, c.ok);
        await pause(300, c); if (!c.ok()) return;
        // the judge reads both
        s.llm(true);
        wires.forEach(function (x) { x.live(true); });
        cards.forEach(function (x) { x.g.classList.add('lit'); });
        await h.sleep(1200); if (!c.ok()) return;
        s.llm(false);
        wires.forEach(function (x) { x.live(false); });
        cards.forEach(function (x) { x.g.classList.remove('lit'); });
        var t = judge(win);
        cards[1 - win].g.style.opacity = 1;
        await Promise.all([pop(t, c.ok), fade(cards[1 - win].g, 1, .4, 350, c.ok)]);
      }
    };
  }

  var SCENES = { social: social, health: health, moderation: moderation, evaluation: evaluation };

  /* ----------------------------------------------------------- the figure */

  LC.figure('uses', function (fig) {
    // a rebuild (the runner's, across its narrow breakpoint) retires the last one's observers and loops
    if (fig._ucStop) fig._ucStop();

    function make(t) {
      try { return SCENES[t.name](t.box); }
      catch (e) { console.error('[fig:uses] ' + t.name + ' failed:', e); return null; }
    }
    var tiles = Array.prototype.map.call(fig.querySelectorAll('.uc'), function (tile) {
      var t = { el: tile, name: tile.dataset.uc, box: tile.querySelector('.uc-anim'), seen: !('IntersectionObserver' in window), waiters: [] };
      if (!t.box || !SCENES[t.name]) return null;
      t.w = Math.round(t.box.clientWidth);
      t.scene = make(t);
      return t.scene ? t : null;
    }).filter(Boolean);

    // a scene plays only while its tile is on screen and the page is visible
    function onScreen(t) { return t.seen && !document.hidden; }
    function whenSeen(t) { return onScreen(t) ? Promise.resolve() : new Promise(function (r) { t.waiters.push(r); }); }
    function wake() {
      tiles.forEach(function (t) {
        t.el.classList.toggle('uc-paused', !onScreen(t));
        if (!onScreen(t)) return;
        var w = t.waiters; t.waiters = [];
        w.forEach(function (f) { f(); });
      });
    }
    var observers = [];
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          tiles.forEach(function (t) { if (t.el === e.target) t.seen = e.isIntersecting && e.intersectionRatio > .1; });
        });
        wake();
      }, { threshold: [0, .15, .3] });
      tiles.forEach(function (t) { io.observe(t.el); });
      observers.push(io);
    }
    document.addEventListener('visibilitychange', wake);

    // redraw a scene at its box's new width, so its type keeps its size
    var played = false;
    if ('ResizeObserver' in window) {
      var ro = new ResizeObserver(function () {
        tiles.forEach(function (t) {
          var w = Math.round(t.box.clientWidth);
          if (w < 160 || w === t.w) return;
          var sc = make(t);
          if (!sc) return;
          t.w = w; t.scene.dead = true; t.scene = sc;
          if (played && LC.REDUCE) sc.still();
        });
      });
      tiles.forEach(function (t) { ro.observe(t.box); });
      observers.push(ro);
    }

    var stopped = false;
    fig._ucStop = function () {
      stopped = true;
      observers.forEach(function (o) { o.disconnect(); });
      document.removeEventListener('visibilitychange', wake);
      tiles.forEach(function (t) { t.seen = true; t.scene.dead = true; });
      wake();                                    // lets waiting loops see they are done
    };

    async function run(t, alive, delay) {
      await h.sleep(delay);
      while (alive() && !stopped) {
        await whenSeen(t);
        if (!alive() || stopped) return;
        var sc = t.scene, t0 = performance.now();
        try {
          await sc.step({
            ok: function () { return alive() && !stopped && !sc.dead; },
            wait: function () { return whenSeen(t); }
          });
        } catch (e) { console.error('[fig:uses] ' + t.name + ' failed:', e); return; }
        if (performance.now() - t0 < 50) await h.sleep(250);   // a scene swapped mid-round never spins the loop
      }
    }

    return function play(alive) {
      played = true;
      if (LC.REDUCE) { tiles.forEach(function (t) { t.scene.still(); }); return; }
      // staggered, so the four tiles never move in step
      tiles.forEach(function (t, i) { run(t, alive, 200 + i * 700); });
    };
  });
})();
