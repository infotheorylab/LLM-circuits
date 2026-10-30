/* fig-hero-pixel: the 16-bit version of the cover animation (?style=pixel).

   Same story as the vector cover: three prompts in turn, each run through the
   circuit that LC.dp.runPrompt picks for it. The prompt card appears, the bar
   shows the prompt classifier's first guess, then each model the circuit asks
   lights up, answers in a bubble, moves the bar and is paid for at its price
   per million tokens; at the stop the answer appears with the money spent.

   The scene is drawn on a <canvas> at a small logical resolution with whole
   rectangles only, then scaled by a whole number, so every pixel stays square.
   Text uses a hand-made bitmap font (caps 7 px, descenders 2 px) so glyphs sit
   on the grid; at the minimum scale of 2 a capital is 14 CSS px tall. Colours
   come from one 16-colour palette built from the page tokens; dimming swaps
   palette entries instead of using transparency, so no in-between colours
   appear. Drawing is a pure function of the state S, so a resize just redraws. */
(function () {
  'use strict';

  /* ------------------------------------------------------------- palette
     16 colours: the page's white, surface, line, muted and ink; each tier
     colour with one highlight; amber in three shades (prices and the belief);
     and pale green and red for the ends of the bar and the answer bubbles. */
  var P = {
    white: '#FFFFFF', surf2: '#EDF0F5', line: '#CBD2DD', muted: '#687089', ink: '#17284D',
    g: '#2E7D57', gHi: '#7DB89A', b: '#2A4BD0', bHi: '#8D9FEB', r: '#B4472F', rHi: '#DE9A87',
    amb: '#C08A1A', ambHi: '#F3D58A', ambLo: '#8A6212', gPale: '#DCEDE4', rPale: '#F6E0DA'
  };
  var TIER = [{ base: P.g, hi: P.gHi }, { base: P.b, hi: P.bHi }, { base: P.r, hi: P.rHi }];

  /* ---------------------------------------------------------- bitmap font
     One string per glyph, rows split by '|'. Row 0 is the top of a capital,
     row 6 sits on the baseline, rows 7-8 are descenders. */
  var FONT_SRC = {
    'A': '.###.|#...#|#...#|#####|#...#|#...#|#...#',
    'B': '####.|#...#|#...#|####.|#...#|#...#|####.',
    'C': '.###.|#...#|#....|#....|#....|#...#|.###.',
    'D': '####.|#...#|#...#|#...#|#...#|#...#|####.',
    'E': '#####|#....|#....|####.|#....|#....|#####',
    'F': '#####|#....|#....|####.|#....|#....|#....',
    'G': '.###.|#...#|#....|#.###|#...#|#...#|.####',
    'H': '#...#|#...#|#...#|#####|#...#|#...#|#...#',
    'I': '###|.#.|.#.|.#.|.#.|.#.|###',
    'J': '....#|....#|....#|....#|#...#|#...#|.###.',
    'K': '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#',
    'L': '#....|#....|#....|#....|#....|#....|#####',
    'M': '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#',
    'N': '#...#|#...#|##..#|#.#.#|#..##|#...#|#...#',
    'O': '.###.|#...#|#...#|#...#|#...#|#...#|.###.',
    'P': '####.|#...#|#...#|####.|#....|#....|#....',
    'Q': '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#',
    'R': '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
    'S': '.###.|#...#|#....|.###.|....#|#...#|.###.',
    'T': '#####|..#..|..#..|..#..|..#..|..#..|..#..',
    'U': '#...#|#...#|#...#|#...#|#...#|#...#|.###.',
    'V': '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..',
    'W': '#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#.',
    'X': '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
    'Y': '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..',
    'Z': '#####|....#|...#.|..#..|.#...|#....|#####',
    'a': '.....|.....|.###.|....#|.####|#...#|.####',
    'b': '#....|#....|####.|#...#|#...#|#...#|####.',
    'c': '....|....|.###|#...|#...|#...|.###',
    'd': '....#|....#|.####|#...#|#...#|#...#|.####',
    'e': '.....|.....|.###.|#...#|#####|#....|.###.',
    'f': '..##|.#..|####|.#..|.#..|.#..|.#..',
    'g': '.....|.....|.####|#...#|#...#|#...#|.####|....#|.###.',
    'h': '#....|#....|####.|#...#|#...#|#...#|#...#',
    'i': '#|.|#|#|#|#|#',
    'j': '..#|...|..#|..#|..#|..#|..#|..#|##.',
    'k': '#...|#...|#..#|#.#.|##..|#.#.|#..#',
    'l': '#.|#.|#.|#.|#.|#.|.#',
    'm': '.....|.....|####.|#.#.#|#.#.#|#.#.#|#.#.#',
    'n': '.....|.....|####.|#...#|#...#|#...#|#...#',
    'o': '.....|.....|.###.|#...#|#...#|#...#|.###.',
    'p': '.....|.....|####.|#...#|#...#|#...#|####.|#....|#....',
    'q': '.....|.....|.####|#...#|#...#|#...#|.####|....#|....#',
    'r': '....|....|#.##|##..|#...|#...|#...',
    's': '.....|.....|.####|#....|.###.|....#|####.',
    't': '...|.#.|###|.#.|.#.|.#.|..#',
    'u': '.....|.....|#...#|#...#|#...#|#...#|.####',
    'v': '.....|.....|#...#|#...#|#...#|.#.#.|..#..',
    'w': '.....|.....|#...#|#...#|#.#.#|#.#.#|.#.#.',
    'x': '.....|.....|#...#|.#.#.|..#..|.#.#.|#...#',
    'y': '.....|.....|#...#|#...#|#...#|#...#|.####|....#|.###.',
    'z': '.....|.....|#####|...#.|..#..|.#...|#####',
    '0': '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.',
    '1': '..#..|.##..|..#..|..#..|..#..|..#..|.###.',
    '2': '.###.|#...#|....#|...#.|..#..|.#...|#####',
    '3': '.###.|#...#|....#|..##.|....#|#...#|.###.',
    '4': '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.',
    '5': '#####|#....|####.|....#|....#|#...#|.###.',
    '6': '..##.|.#...|#....|####.|#...#|#...#|.###.',
    '7': '#####|....#|...#.|..#..|..#..|..#..|..#..',
    '8': '.###.|#...#|#...#|.###.|#...#|#...#|.###.',
    '9': '.###.|#...#|#...#|.####|....#|...#.|.##..',
    '%': '##..#|##..#|...#.|..#..|.#...|#..##|#..##',
    '?': '.###.|#...#|....#|...#.|..#..|.....|..#..',
    '.': '.|.|.|.|.|.|#',
    ',': '..|..|..|..|..|..|.#|#.',
    "'": '#|#',
    '-': '...|...|...|###',
    ':': '.|.|#|.|.|.|#',
    '/': '..#|..#|.#.|.#.|.#.|#..|#..',
    '$': '..#..|.####|#.#..|.###.|..#.#|####.|..#..'
  };
  var FONT = {};
  Object.keys(FONT_SRC).forEach(function (ch) {
    var rows = FONT_SRC[ch].split('|'), runs = [];
    // store each row as horizontal runs so a glyph costs a few rectangles
    rows.forEach(function (row, y) {
      var x = 0;
      while (x < row.length) {
        if (row[x] !== '#') { x++; continue; }
        var x0 = x;
        while (x < row.length && row[x] === '#') x++;
        runs.push([x0, y, x - x0]);
      }
    });
    FONT[ch] = { w: rows[0].length, runs: runs };
  });
  FONT[' '] = { w: 3, runs: [] };
  var CAP = 7, LINE = 11;          // capital height and line pitch, in logical px

  function textW(s) {
    var w = 0;
    for (var i = 0; i < s.length; i++) w += (FONT[s[i]] || FONT['?']).w + (i ? 1 : 0);
    return w;
  }
  /* Greedy wrap, then narrow the measure while the line count holds, so the
     lines of a centred block come out about the same length. */
  function wrapText(s, maxW) {
    function greedy(m) {
      var words = s.split(' '), lines = [], cur = '';
      words.forEach(function (wd) {
        var t = cur ? cur + ' ' + wd : wd;
        if (cur && textW(t) > m) { lines.push(cur); cur = wd; } else cur = t;
      });
      if (cur) lines.push(cur);
      return lines;
    }
    var best = greedy(maxW), n = best.length;
    for (var m = maxW - 2; n > 1 && m > maxW / 2; m -= 2) {
      var t = greedy(m);
      if (t.length > n) break;
      best = t;
    }
    return best;
  }

  /* ---------------------------------------------------------------- sprites */
  var SIZE = [{ w: 30, h: 23 }, { w: 37, h: 29 }, { w: 44, h: 35 }];   // body; feet add 2 rows
  // speech-bubble tails, drawn over the bubble's edge: down and to the left, or to the left
  var TAIL_DOWN = ['..#fff#', '.#ff##.', '#f##...', '##.....'];
  var TAIL_LEFT = ['..#f', '.#ff', '#fff', '.#ff', '..#f'];

  LC.figure('hero-pixel', function (fig, ctx) {
    var REDUCE = ctx.reduce;
    if (fig._hpCleanup) fig._hpCleanup();       // the runner rebuilds at the narrow breakpoint

    var KEYS = ['easy', 'medium', 'hard'];
    var PR = KEYS.map(function (k) { return { key: k, p: LC.PROMPTS[k], steps: LC.dp.runPrompt(k) }; });
    var MODELS = LC.MODELS;
    function spentLabel(x) { return LC.h.usd(x) + ' / M tokens'; }
    var PLATE_W = Math.max.apply(null, MODELS.map(function (m) { return Math.max(textW(m.short), textW(LC.h.usd(m.price))); }));

    /* ------------------------------------------------------- DOM: canvas, head */
    fig.querySelectorAll('.hp-stage').forEach(function (n) { n.remove(); });
    var stage = document.createElement('div');
    stage.className = 'hp-stage';
    var cv = document.createElement('canvas');
    cv.className = 'hp-canvas';
    cv.setAttribute('aria-hidden', 'true');
    stage.appendChild(cv);
    fig.insertBefore(stage, fig.firstChild);
    var head = LC.h.head(fig, '');
    head.classList.add('hp-head');
    fig.insertBefore(head, stage.nextSibling);     // controls sit under the picture
    var dotsBox = document.createElement('div');
    dotsBox.className = 'hp-dots';
    dotsBox.setAttribute('role', 'group');
    dotsBox.setAttribute('aria-label', 'Example prompts');
    var dots = PR.map(function (r, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'hp-dot';
      b.setAttribute('aria-label', 'Prompt ' + (i + 1) + ' of 3: ' + r.p.text);
      b.addEventListener('click', function () { jump(i); });
      dotsBox.appendChild(b);
      return b;
    });
    head.replaceChild(dotsBox, head.querySelector('.fig-title'));
    function setDots(i) {
      dots.forEach(function (d, j) {
        if (j === i) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current');
      });
    }

    /* ------------------------------------------------------------- layout */
    var g = cv.getContext('2d'), L = null, k = 2;

    function fit() {
      var avail = Math.max(200, Math.floor(stage.clientWidth || fig.clientWidth || 360));
      var narrow = ctx.narrow || avail < 600;
      var dpr = window.devicePixelRatio || 1;
      var css = Math.max(2, Math.floor(avail / (narrow ? 180 : 320)));   // whole CSS scale, at least 2
      k = Math.max(1, Math.ceil(css * dpr - 0.01));                       // device pixels per logical pixel
      var W = Math.min(narrow ? 240 : 360, Math.floor(avail * dpr / k));
      L = narrow ? layoutNarrow(W) : layoutWide(W);
      cv.width = L.W * k; cv.height = L.H * k;
      cv.style.width = (L.W * k / dpr) + 'px';
      cv.style.height = (L.H * k / dpr) + 'px';
      head.style.maxWidth = (L.W * k / dpr) + 'px';
      g = cv.getContext('2d');
      g.setTransform(k, 0, 0, k, 0, 0);
      g.imageSmoothingEnabled = false;
      draw();
    }

    // card height is set by the longest prompt, so nothing below it moves between prompts
    function cardLines(maxW) {
      var n = 1;
      PR.forEach(function (r) { r.lines = wrapText(r.p.text, maxW); n = Math.max(n, r.lines.length); });
      return n;
    }

    /* Wide: the card on top, a wire down to a bus over the three machines, the
       bar under them, then the answer and the money spent, both centred on the
       trunk. The card is narrow enough that every prompt takes two lines. */
    function layoutWide(W) {
      var L = { W: W, narrow: false }, mid = Math.floor(W / 2);
      var tw = Math.min(W - 40, 220), n = cardLines(tw);
      L.card = { x: mid - Math.floor(tw / 2) - 14, y: 2, w: tw + 28, h: n * LINE + 13 };
      var cb = L.card.y + L.card.h;
      L.trunk = { x: mid, y0: cb + 1 };
      L.busY = cb + 8;
      var floor = L.busY + 60;                         // the machines' feet rest here
      var gap = Math.min(106, mid - 70);
      L.m = SIZE.map(function (s, i) {
        var cx = mid + (i - 1) * gap;
        return { cx: cx, x: cx - Math.floor(s.w / 2), y: floor - 2 - s.h, w: s.w, h: s.h,
          nameY: floor + 5, priceY: floor + 15 };
      });
      // the wire to model i: down the trunk, along the bus, down into the machine
      L.path = L.m.map(function (m) {
        return [[mid, L.trunk.y0], [mid, L.busY], [m.cx, L.busY], [m.cx, m.y - 2]];
      });
      L.bubble = function (i, w, h) {                  // above and to the right of the machine
        var m = L.m[i];
        return { x: m.cx + 4, y: m.y - h - 4, tail: 'down' };
      };
      // the bar, with its two ends named beside it
      L.bar = { n: 20, pitch: 7, inline: true };
      L.bar.w = L.bar.n * L.bar.pitch - 1 + 4;
      L.bar.x = mid - Math.floor(L.bar.w / 2) + Math.floor((textW('safe') - textW('harmful')) / 2);
      L.bar.y = floor + 40;
      // the answer ends at the trunk; the money spent starts just right of it
      var yr = L.bar.y + 20;
      L.verdict = { right: mid - 6, y: yr };
      L.meter = { x: mid + 8, y: yr + 5 };
      L.H = yr + 19;
      return L;
    }

    /* Narrow: the same pieces stacked. The wire runs down the left edge to each
       machine; names, prices and answers read across each row. */
    function layoutNarrow(W) {
      var pad = 4, L = { W: W, narrow: true };
      var n = cardLines(W - 2 * pad - 16);
      L.card = { x: pad, y: 2, w: W - 2 * pad, h: n * LINE + 13 };
      var cb = L.card.y + L.card.h;
      var tx = pad + 8, mx = tx + 7, nameX = mx + SIZE[2].w + 7;
      L.trunk = { x: tx, y0: cb + 1 };
      var y = cb + 11;
      L.m = SIZE.map(function (s) {
        var m = { x: mx, y: y, w: s.w, h: s.h, cx: mx + Math.floor(s.w / 2) };
        m.mid = y + Math.floor(s.h / 2);
        m.nameX = nameX; m.nameY = m.mid - 8; m.priceY = m.mid + 2;
        y += s.h + 2 + 8;
        return m;
      });
      L.path = L.m.map(function (m) { return [[tx, L.trunk.y0], [tx, m.mid], [m.x - 2, m.mid]]; });
      var bw = textW('HARMFUL') + 10;
      L.bubble = function (i, w, h) {
        var m = L.m[i];
        // after the name and price; on the smallest phones, raised beside the name instead
        if (nameX + PLATE_W + 7 + bw <= W - pad) return { x: nameX + PLATE_W + 7, y: m.mid - Math.floor(h / 2), tail: 'left' };
        return { x: nameX + textW(MODELS[i].short) + 6, y: m.nameY + 3 - Math.floor(h / 2) - 3, tail: 'left' };
      };
      L.bar = { n: 20 };
      L.bar.pitch = Math.max(5, Math.min(8, Math.floor((W - 2 * pad - 4 + 1) / 20)));
      L.bar.w = L.bar.n * L.bar.pitch - 1 + 4;
      L.bar.x = Math.floor((W - L.bar.w) / 2); L.bar.y = y + 18;
      var yr = L.bar.y + 10 + 4 + CAP + 11;
      // the answer on the left, the money spent on the right; out to the margins if the bar is too short
      var room = textW('HARMFUL') + 14 + 10 + textW(spentLabel(.276)) <= L.bar.w;
      L.verdict = { left: room ? L.bar.x : pad, y: yr };
      L.meter = { right: room ? L.bar.x + L.bar.w : W - pad, y: yr + 5 };
      L.H = yr + 19;
      return L;
    }

    /* ---------------------------------------------------------- primitives */
    function fill(x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }
    function text(s, x, y, c) {
      g.fillStyle = c;
      for (var i = 0; i < s.length; i++) {
        var gl = FONT[s[i]] || FONT['?'];
        for (var r = 0; r < gl.runs.length; r++) g.fillRect(x + gl.runs[r][0], y + gl.runs[r][1], gl.runs[r][2], 1);
        x += gl.w + 1;
      }
    }
    // a box with a 1px outline and corners rounded by one (r = 1) or two (r = 2) pixels
    function box(x, y, w, h, bg, line, r) {
      r = r || 1;
      if (bg) { fill(x + 1, y + r, w - 2, h - 2 * r, bg); fill(x + r, y + 1, w - 2 * r, h - 2, bg); }
      fill(x + r, y, w - 2 * r, 1, line); fill(x + r, y + h - 1, w - 2 * r, 1, line);
      fill(x, y + r, 1, h - 2 * r, line); fill(x + w - 1, y + r, 1, h - 2 * r, line);
      if (r === 2) {
        fill(x + 1, y + 1, 1, 1, line); fill(x + w - 2, y + 1, 1, 1, line);
        fill(x + 1, y + h - 2, 1, 1, line); fill(x + w - 2, y + h - 2, 1, 1, line);
      }
    }
    function sprite(rows, x, y, map) {
      for (var r = 0; r < rows.length; r++) for (var c = 0; c < rows[r].length; c++) {
        var ch = rows[r][c];
        if (map[ch]) fill(x + c, y + r, 1, 1, map[ch]);
      }
    }

    /* -------------------------------------------------------------- state */
    var S;
    function reset(pi) {
      S = { p: pi, typed: 0, q: null, focus: null, active: -1, path: [], screen: {}, frame: 0,
        bubbles: {}, spent: 0, verdict: null };
    }
    // the final frame of prompt pi, for reduced motion and the jump buttons
    function finalState(pi) {
      reset(pi);
      var st = PR[pi].steps;
      S.typed = Infinity; S.focus = [];
      st.forEach(function (s, j) {
        if (s.act === 'stop') { S.q = s.q; S.verdict = s.predict; return; }
        S.focus.push(s.i); S.path.push({ i: s.i, t: 1 }); S.screen[s.i] = 'done';
        S.bubbles[s.i] = s.x; S.spent += MODELS[s.i].price;
      });
    }

    /* ---------------------------------------------------------------- draw */
    function draw() {
      if (!L || !S) return;
      fill(0, 0, L.W, L.H, P.white);
      drawCard();
      drawWires();
      for (var i = 0; i < 3; i++) drawModel(i);
      for (var j in S.bubbles) drawBubble(+j, S.bubbles[j]);
      drawBar();
      drawMeter();
      if (S.verdict !== null) drawVerdict();
    }

    function drawCard() {
      var c = L.card, r = PR[S.p], f = 6, fx = c.x + c.w - 1 - f;
      box(c.x, c.y, c.w, c.h, P.white, P.ink, 2);
      fill(c.x + 2, c.y + c.h - 2, c.w - 4, 1, P.surf2);           // shade along the bottom
      // the top right corner folded over
      fill(fx + 1, c.y, f, f, P.white);
      for (var d = 0; d <= f; d++) fill(fx + d, c.y + d, 1, 1, P.ink);
      for (var j = 2; j < f; j++) fill(fx + 1, c.y + j, j - 1, 1, P.surf2);
      fill(fx, c.y, 1, f + 1, P.ink); fill(fx, c.y + f, f + 1, 1, P.ink);
      // the prompt, centred line by line, typed out
      var lines = r.lines, left = S.typed;
      var ty = c.y + Math.floor((c.h - 1 - (lines.length * LINE - 2)) / 2);
      lines.forEach(function (ln, li) {
        var shown = ln.slice(0, Math.max(0, left));
        left -= ln.length + 1;
        if (shown) text(shown, c.x + Math.floor((c.w - textW(ln)) / 2), ty + li * LINE, P.ink);
      });
      // the port the wire leaves from
      if (L.narrow) fill(L.trunk.x - 2, c.y + c.h, 5, 1, P.ink);
      else fill(L.trunk.x - 2, c.y + c.h, 5, 1, P.ink);
    }

    function pathPixels(pts) {
      var out = [];
      for (var s = 0; s + 1 < pts.length; s++) {
        var a = pts[s], b = pts[s + 1];
        var dx = Math.sign(b[0] - a[0]), dy = Math.sign(b[1] - a[1]);
        var x = a[0], y = a[1];
        while (x !== b[0] || y !== b[1]) { out.push([x, y]); x += dx; y += dy; }
      }
      out.push(pts[pts.length - 1]);
      return out;
    }
    function drawWires() {
      var i;
      for (i = 0; i < 3; i++) pathPixels(L.path[i]).forEach(function (q) { fill(q[0], q[1], 1, 1, P.line); });
      // the path the circuit takes, drawn in behind a travelling pulse
      S.path.forEach(function (lp) {
        var pix = pathPixels(L.path[lp.i]), n = Math.round(pix.length * lp.t);
        for (var b = 0; b < n; b++) fill(pix[b][0], pix[b][1], 1, 1, P.amb);
        if (lp.t < 1 && n > 0) {
          var hd = pix[n - 1];
          fill(hd[0] - 1, hd[1] - 1, 3, 3, P.amb);
          fill(hd[0], hd[1], 1, 1, P.ambHi);
        }
      });
      // a small connector where each wire meets its machine
      for (i = 0; i < 3; i++) {
        var end = L.path[i][L.path[i].length - 1];
        var lit = S.path.some(function (lp) { return lp.i === i && lp.t >= 1; });
        var col = lit ? P.amb : (dimmed(i) ? P.line : P.muted);
        if (L.narrow) fill(end[0], end[1] - 1, 1, 3, col); else fill(end[0] - 1, end[1], 3, 1, col);
      }
    }

    function dimmed(i) { return S.focus !== null && S.focus.indexOf(i) < 0; }

    /* A model: a small terminal in its tier colour, lit from above. Dimmed,
       it keeps its outline in the line colour so it still reads as there. */
    function drawModel(i) {
      var m = L.m[i], t = TIER[i], dim = dimmed(i), lit = S.active === i;
      var line = dim ? P.line : P.ink, body = dim ? P.surf2 : t.base, hi = dim ? P.white : t.hi;
      var x = m.x, y = m.y, w = m.w, h = m.h;
      box(x, y, w, h, body, line, 2);
      fill(x + 2, y + 1, w - 4, 1, hi);
      fill(x + 1, y + 2, 1, h - 4, hi);
      var sx = x + 3, sy = y + 3, sw = w - 6, sh = h - 9;
      if (dim) box(sx, sy, sw, sh, P.white, P.line, 1);
      else {
        box(sx, sy, sw, sh, P.ink, P.ink, 1);
        var st = S.screen[i];
        if (st === 'think') {                                     // three dots, filling in turn
          for (var d = 0; d < 3; d++) {
            fill(sx + Math.floor(sw / 2) - 4 + d * 3, sy + Math.floor(sh / 2) - 1, 2, 2,
              (S.frame % 4) > d ? t.hi : P.muted);
          }
        } else if (st === 'done') {                               // a few lines of answer
          fill(sx + 3, sy + 3, sw - 8, 1, t.hi);
          fill(sx + 3, sy + 5, sw - 12, 1, t.hi);
          if (sh > 13) fill(sx + 3, sy + 7, sw - 10, 1, t.hi);
        } else fill(sx + 3, sy + sh - 4, 3, 1, t.hi);             // an idle cursor
      }
      fill(x + w - 6, y + h - 4, 2, 1, lit ? P.ambHi : line);     // status light
      fill(x + 3, y + h - 4, 6, 1, line);                         // vent
      fill(x + 4, y + h, 4, 2, line); fill(x + w - 8, y + h, 4, 2, line);
      if (lit) brackets(x - 3, y - 3, w + 6, h + 7);
      // name plate, then the price per million tokens
      var name = MODELS[i].short, pr = LC.h.usd(MODELS[i].price);
      var nx = L.narrow ? m.nameX : m.cx - Math.floor(textW(name) / 2);
      var px0 = L.narrow ? m.nameX : m.cx - Math.floor(textW(pr) / 2);
      text(name, nx, m.nameY, dim ? P.muted : P.ink);
      text(pr, px0, m.priceY, dim ? P.muted : P.ambLo);
    }
    // selection corners around the model being asked
    function brackets(x, y, w, h) {
      var c = P.amb, a = 4;
      fill(x, y, a, 1, c); fill(x, y, 1, a, c);
      fill(x + w - a, y, a, 1, c); fill(x + w - 1, y, 1, a, c);
      fill(x, y + h - 1, a, 1, c); fill(x, y + h - a, 1, a, c);
      fill(x + w - a, y + h - 1, a, 1, c); fill(x + w - 1, y + h - a, 1, a, c);
    }

    function drawBubble(i, x) {
      var s = x ? 'HARMFUL' : 'SAFE', col = x ? P.r : P.g, bg = x ? P.rPale : P.gPale;
      var w = textW(s) + 10, h = CAP + 8, at = L.bubble(i, w, h);
      box(at.x, at.y, w, h, bg, P.ink, 2);
      text(s, at.x + 5, at.y + 4, col);
      var map = { '#': P.ink, f: bg };
      if (at.tail === 'down') sprite(TAIL_DOWN, at.x + 2, at.y + h - 1, map);
      else sprite(TAIL_LEFT, at.x - 3, at.y + Math.floor(h / 2) - 2, map);
    }

    /* The bar: the chance the prompt is harmful, in 20 steps. The three steps
       at each end are tinted: there the circuit is sure enough to stop. */
    function drawBar() {
      var B = L.bar, x = B.x, y = B.y, sw = B.pitch - 1, zone = 3;
      box(x, y, B.w, 10, P.white, P.ink, 1);
      var q = S.q === null ? 0 : S.q, filled = S.q === null ? 0 : Math.round(q * B.n);
      for (var s = 0; s < B.n; s++) {
        var sx = x + 2 + s * B.pitch;
        if (s < filled) { fill(sx, y + 2, sw, 6, P.amb); fill(sx, y + 2, sw, 1, P.ambHi); }
        else fill(sx, y + 2, sw, 6, s < zone ? P.gPale : s >= B.n - zone ? P.rPale : P.surf2);
      }
      if (B.inline) {
        text('safe', x - 6 - textW('safe'), y + 1, P.g);
        text('harmful', x + B.w + 6, y + 1, P.r);
      } else {
        text('safe', x, y + 14, P.g);
        text('harmful', x + B.w - textW('harmful'), y + 14, P.r);
      }
      if (S.q === null) return;
      // pointer and percentage above the bar
      var inner = B.n * B.pitch - 1, px = x + 2 + Math.round(q * (inner - 1));
      fill(px - 2, y - 4, 5, 1, P.ambLo); fill(px - 1, y - 3, 3, 1, P.ambLo); fill(px, y - 2, 1, 1, P.ambLo);
      var lbl = Math.round(q * 100) + '%', lw = textW(lbl);
      text(lbl, Math.max(x, Math.min(x + B.w - lw, px - Math.floor(lw / 2))), y - 13, P.ambLo);
    }

    // money spent so far, in dollars per million tokens
    function drawMeter() {
      var M = L.meter, lbl = spentLabel(S.spent);
      text(lbl, M.x !== undefined ? M.x : M.right - textW(lbl), M.y, P.ink);
    }

    // the answer: white on the answer's colour, lit from above like the models
    function drawVerdict() {
      var s = S.verdict ? 'HARMFUL' : 'SAFE', col = S.verdict ? P.r : P.g, hi = S.verdict ? P.rHi : P.gHi;
      var w = textW(s) + 14, h = CAP + 10, V = L.verdict;
      var x = V.right !== undefined ? V.right - w : V.left, y = V.y;
      box(x, y, w, h, col, P.ink, 2);
      fill(x + 2, y + 1, w - 4, 1, hi);
      text(s, x + 7, y + 5, P.white);
    }

    /* ------------------------------------------------------------ timing */
    var kicks = [];
    function wait(ms) {
      return new Promise(function (res) {
        if (REDUCE) { res(); return; }
        var id = setTimeout(done, ms);
        function done() { clearTimeout(id); res(); }
        kicks.push(done);
      });
    }
    function kick() { var k2 = kicks; kicks = []; k2.forEach(function (f) { f(); }); }
    // a tween that stops drawing once its run is over
    function anim(ms, fn, live) {
      return new Promise(function (res) {
        if (REDUCE || ms <= 0) { fn(1); draw(); res(); return; }
        var t0 = performance.now();
        requestAnimationFrame(function frame(now) {
          if (!live()) { res(); return; }
          var t = Math.min(1, (now - t0) / ms);
          fn(t); draw();
          if (t < 1) requestAnimationFrame(frame); else res();
        });
      });
    }
    // pause while the cover is off screen or the tab is hidden
    var onScreen = true, waiters = [];
    var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
      onScreen = es.some(function (e) { return e.isIntersecting; });
      release();
    }) : null;
    if (io) io.observe(fig);
    function release() {
      if (!onScreen || document.hidden) return;
      var w = waiters; waiters = []; w.forEach(function (f) { f(); });
    }
    document.addEventListener('visibilitychange', release);
    function seen() {
      if (REDUCE || (onScreen && !document.hidden)) return Promise.resolve();
      return new Promise(function (r) { waiters.push(r); });
    }

    /* --------------------------------------------------------- the story
       Every pause goes through go(): once a run is over (Replay, a jump, a
       rebuild) it throws STOP, so an old run never touches the new state. */
    var STOP = {};
    function guard(live) {
      return async function go(p) { await p; if (!live()) throw STOP; };
    }
    async function runOne(pi, live) {
      var go = guard(live), r = PR[pi], steps = r.steps, n = r.p.text.length;
      reset(pi); setDots(pi); draw();
      await go(wait(200));
      await go(anim(Math.min(1100, n * 14), function (t) { S.typed = Math.round(n * t); }, live));
      await go(wait(250));
      var prior = steps[0].q;                          // the prompt classifier's first guess
      await go(anim(500, function (t) { S.q = prior * t; }, live));
      await go(wait(500));
      for (var s = 0; s < steps.length && steps[s].act === 'ask'; s++) {
        await go(seen());
        var st = steps[s];
        S.focus = (S.focus || []).concat([st.i]); S.active = st.i; draw();
        await go(wait(300));
        var lp = { i: st.i, t: 0 };
        S.path.push(lp);
        await go(anim(600, function (t) { lp.t = t; }, live));
        S.screen[st.i] = 'think';
        await go(anim(700, function (t) { S.frame = Math.floor(t * 7); }, live));
        S.screen[st.i] = 'done'; S.bubbles[st.i] = st.x; draw();
        await go(wait(350));
        var from = S.q, to = steps[s + 1].q;
        await go(Promise.all([
          anim(800, function (t) { S.q = from + (to - from) * t; }, live),
          pay(MODELS[st.i].price, live)
        ]));
        await go(wait(300));
      }
      if (S.focus === null) { S.focus = []; draw(); await go(wait(350)); }   // asked no one
      S.active = -1;
      S.verdict = steps[steps.length - 1].predict; draw();
      await go(wait(2000));
    }
    async function pay(x, live) {
      var go = guard(live), from = S.spent;
      await go(anim(600, function (t) { S.spent = from + x * t; }, live));
      S.spent = from + x; draw();
    }

    var aliveNow = null, loopId = 0, jumpTo = null;
    function jump(i) {
      if (REDUCE || !aliveNow || !aliveNow()) { finalState(i); setDots(i); draw(); return; }
      jumpTo = i; loopId++; kick();
    }

    var ro = 'ResizeObserver' in window ? new ResizeObserver(function () { fit(); }) : null;
    if (ro) ro.observe(stage);
    fig._hpCleanup = function () {
      if (ro) ro.disconnect();
      if (io) io.disconnect();
      document.removeEventListener('visibilitychange', release);
      loopId++; kick();
    };

    // before the first play: the easy prompt, typed out, as a quiet still
    finalState(0); S.verdict = null; S.focus = null; S.q = null;
    setDots(0);
    fit();

    /* play() loops through the three prompts while the cover is alive; a jump
       restarts the loop at the chosen prompt. */
    return async function play(alive) {
      aliveNow = alive;
      kick();                            // wake an earlier run so it stops now
      if (REDUCE) { finalState(2); setDots(2); draw(); return; }
      var from = 0;
      while (alive()) {
        var id = ++loopId;
        jumpTo = null;
        var live = function () { return alive() && id === loopId; };
        try {
          for (var pi = from; ; pi = (pi + 1) % 3) {
            await guard(live)(seen());
            await runOne(pi, live);
          }
        } catch (e) { if (e !== STOP) throw e; }
        if (jumpTo === null || !alive()) break;    // Replay or a rebuild ended this run
        from = jumpTo;
      }
    };
  });
})();
