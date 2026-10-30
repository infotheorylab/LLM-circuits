/* fig-hero: the cover animation (vector).

   Three prompts in turn, each answered by the circuit it needs: the easy one
   from the prompt alone, the medium one after the small model, the hard one by
   going straight to the large model. Every run is LC.dp.runPrompt, so the cover
   agrees with the figures further down the page.

   Wide: the prompt on top, the three models in a row, the confidence bar with
   the money spent on its left and the answer on its right. Narrow: one column
   (prompt, models, bar, then money spent and answer). It loops while on screen and
   pauses off screen; with reduced motion it shows the hard prompt's last frame.
   The dots under the figure jump to a prompt. */
(function () {
  'use strict';
  var h = LC.h, kit = LC.kit, MODELS = LC.MODELS, PROMPTS = LC.PROMPTS;
  var ORDER = ['easy', 'medium', 'hard'];
  var TASK = 'Is this prompt harmful?';
  var SURE = .12;          // the bar's sure zones: all three runs stop inside them (the hard one at 90%)
  var CHIP_W = [64, 92];   // kit.chip widths of SAFE and HARMFUL

  /* Wrap str into the <text> t at the narrowest width that still needs as few
     lines as `width` allows, so the lines come out about equally long. */
  function balance(t, str, width) {
    var n = h.wrap(t, str, width, 21);
    if (n < 2) return n;
    var lo = width / 2, hi = width;
    for (var k = 0; k < 10; k++) {
      var mid = (lo + hi) / 2;
      if (h.wrap(t, str, mid, 21) > n) lo = mid; else hi = mid;
    }
    return h.wrap(t, str, hi, 21);
  }

  LC.figure('hero', function (fig, ctx) {
    // one unit per pixel; the floor only guards a figure caught mid-layout at a few pixels wide
    var W = Math.round(Math.max(300, Math.min(ctx.width, 760))), narrow = ctx.narrow;
    var el = h.svgEl;
    fig.classList.toggle('hero-still', !!ctx.reduce);
    var svg = h.makeSvg(fig, W, 300);

    /* ---------------------------------------------------------- layout */

    var wireLayer = el('g', {}, svg);

    /* One card per prompt, all as tall as the longest so the layout never jumps.
       Wide, the card is as wide as the bar below it. Lines are balanced (no
       single word left on the last line) and a shorter prompt is centred. */
    var cardW = narrow ? W : Math.max(W - 260, Math.min(W, 440)), cardX = (W - cardW) / 2;
    var cards = {}, lines = {};
    ORDER.forEach(function (n) {
      cards[n] = kit.promptCard(svg, cardX, 0, cardW, PROMPTS[n].text, { title: TASK });
      lines[n] = balance(cards[n].text, '“' + PROMPTS[n].text + '”', cardW - 32);
    });
    var most = Math.max.apply(null, ORDER.map(function (n) { return lines[n]; }));
    var cardH = 48 + (most - 1) * 21 + 15;
    ORDER.forEach(function (n) {
      var g = cards[n].g, dy = (most - lines[n]) * 21 / 2;
      g.querySelector('.pc-body').setAttribute('height', cardH);
      g.querySelector('.pc-title').setAttribute('y', 24 + dy);
      cards[n].text.setAttribute('y', 48 + dy);
      // between prompts only the words fade; the card itself stays put
      g.querySelector('.pc-title').classList.add('hx');
      cards[n].text.classList.add('hx');
    });

    var sh = 52, st = [], wires = [], chipAt = [];
    var jx, barX, barW, barY, meterX, meterY, ansR, ansY, H;
    if (!narrow) {
      // models in a row under the card, wires fanning out from its bottom edge
      var sw = Math.min(200, Math.floor((W - 48) / 3)), sy = cardH + 44, my = cardH + 22;
      jx = W / 2;
      MODELS.forEach(function (m, i) {
        var x = 2 + i * (W - 4 - sw) / 2, cx = x + sw / 2;   // 2px in, so the lit outline is not clipped
        wires.push(el('path', { 'class': 'hw', d: 'M' + jx + ',' + cardH + ' C' + jx + ',' + my + ' ' + cx + ',' + my + ' ' + cx + ',' + sy }, wireLayer));
        st.push(kit.station(svg, x, sy, m, { w: sw, h: sh }));
        chipAt.push(function () { return [cx, sy + sh + 26]; });
      });
      // the bar between two readouts: money spent on the left, the answer on the right
      barX = 130; barW = W - 260; barY = sy + sh + 85;
      meterX = 2; meterY = barY - 12;
      ansR = W - 2; ansY = barY - 12;
      H = barY + 44;
    } else {
      // models in a column, fed by a wire down the left edge
      var spine = 16, stX = 32, gap = 10, y0 = cardH + 22, swn = W - stX - 12 - CHIP_W[1] - 16;
      jx = spine;
      MODELS.forEach(function (m, i) {
        var y = y0 + i * (sh + gap), mid = y + sh / 2;
        wires.push(el('path', { 'class': 'hw', d: 'M' + spine + ',' + cardH + ' V' + (mid - 10) + ' Q' + spine + ',' + mid + ' ' + (spine + 10) + ',' + mid + ' H' + stX }, wireLayer));
        st.push(kit.station(svg, stX, y, m, { w: swn, h: sh }));
        chipAt.push(function (x) { return [stX + swn + 12 + CHIP_W[x] / 2, mid]; });
      });
      barX = 16; barW = W - 32; barY = y0 + 3 * sh + 2 * gap + 46;
      meterX = 16; meterY = barY + 68;
      ansR = W - 17; ansY = meterY;
      H = meterY + 52;
    }
    el('circle', { 'class': 'hj', cx: jx, cy: cardH, r: 3.5 }, svg);

    var chipLayer = el('g', { 'class': 'hx' }, svg);
    var pulseLayer = el('g', {}, svg);

    // confidence bar, with a hollow ring left at the starting guess once it moves
    var bar = kit.beliefBar(svg, barX, barY, barW, { sure: SURE });
    var marker = bar.g.querySelector('.bb-marker'), val = bar.g.querySelector('.bb-val');
    var ghost = el('circle', { 'class': 'hero-ghost hx', cx: 0, cy: 6, r: 6 });
    bar.g.insertBefore(ghost, marker);
    marker.classList.add('hx'); val.classList.add('hx');
    var since = h.label(bar.g, barW / 2, 36, '', 'hero-lbl hx', { 'text-anchor': 'middle' });

    // money spent so far, in dollars per million tokens
    var meter = kit.costMeter(svg, meterX, meterY);
    meter.g.children[1].classList.add('hx');

    // the circuit's answer: an empty slot until it stops
    var ansG = el('g', {}, svg);
    h.label(ansG, ansR + 1, ansY, 'answer', 'hero-lbl', { 'text-anchor': 'end' });
    var slot = el('rect', { 'class': 'ans-slot', x: ansR - CHIP_W[1], y: ansY + 11, width: CHIP_W[1], height: 28, rx: 14 }, ansG);
    var ansChip = el('g', { 'class': 'hx ans' }, ansG);

    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

    /* ------------------------------------------------- the prompt dots */

    var oldNav = fig.querySelector('.hero-dots');
    if (oldNav) oldNav.remove();
    var nav = document.createElement('div');
    nav.className = 'hero-dots';
    nav.setAttribute('role', 'group');
    nav.setAttribute('aria-label', 'Example prompts');
    var dots = ORDER.map(function (n, k) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', 'Prompt ' + (k + 1) + ' of ' + ORDER.length);
      b.innerHTML = '<i></i>';
      b.addEventListener('click', function () { jump(k); });
      nav.appendChild(b);
      return b;
    });
    var host = svg.parentNode;                 // right under the drawing, above any caption
    host.parentNode.insertBefore(nav, host.nextSibling);
    function setDots(k) {
      dots.forEach(function (d, j) {
        if (j === k) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current');
      });
    }

    /* ---------------------------------------------------------- timing */

    // waits that a click on a dot can cut short (including ones that start after the click)
    var wakers = [];
    function wait(ms) {
      if (ctx.reduce || jumpTo !== null) return Promise.resolve();
      return new Promise(function (resolve) {
        var t = setTimeout(done, ms);
        function done() {
          clearTimeout(t);
          var j = wakers.indexOf(done);
          if (j >= 0) wakers.splice(j, 1);
          resolve();
        }
        wakers.push(done);
      });
    }
    function wake() { wakers.slice().forEach(function (f) { f(); }); }

    // pause the loop while the cover is off screen
    var onScreen = true, io = null;
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(function (es) { onScreen = es[es.length - 1].isIntersecting; }, { threshold: 0.1 });
      io.observe(fig);
    }
    async function whenVisible(alive) {
      while (alive() && !onScreen) await new Promise(function (r) { setTimeout(r, 250); });
    }

    /* ------------------------------------------------------------ steps */

    function setWires(i) {   // i: the wire to light, -1 for none
      wires.forEach(function (w, j) { w.setAttribute('class', 'hw ' + (j === i ? 'on' : 'off')); });
    }
    function pop(g, cx, cy) {
      return h.tween(320, function (t) {
        var s = .86 + .14 * t;
        g.setAttribute('transform', 'translate(' + cx + ',' + cy + ') scale(' + s + ') translate(' + (-cx) + ',' + (-cy) + ')');
        g.style.opacity = t;
      });
    }
    function showChip(i, x) {
      var p = chipAt[i](x);
      return pop(kit.chip(chipLayer, p[0], p[1], x), p[0], p[1]);
    }
    function showAnswer(x) {
      slot.setAttribute('visibility', 'hidden');
      var cx = ansR - CHIP_W[x] / 2, cy = ansY + 25;
      return pop(kit.chip(ansChip, cx, cy, x), cx, cy);
    }
    async function pay(x) {
      await meter.add(x, ctx.reduce);
      await wait(220);
    }
    function resetTo(name) {
      ORDER.forEach(function (n) { cards[n].g.style.display = n === name ? '' : 'none'; });
      st.forEach(function (s) { s.state(''); });
      wires.forEach(function (w) { w.setAttribute('class', 'hw'); });
      chipLayer.textContent = '';
      ansChip.textContent = '';
      slot.removeAttribute('visibility');
      meter.reset();
      bar.set(PROMPTS[name].prior, true);
      ghost.setAttribute('visibility', 'hidden');
      since.textContent = 'from the prompt alone';
    }

    /* One prompt from its card to the circuit's answer. ok() turns false when
       the figure is rebuilt or a dot is clicked; the run then stops early. */
    async function runPrompt(name, ok, first) {
      if (first) resetTo(name);
      else {
        svg.classList.add('swap');           // fade out what belongs to the last prompt
        await wait(300);
        if (!ok()) { svg.classList.remove('swap'); return; }
        resetTo(name);
        svg.classList.remove('swap');
      }
      await wait(first ? 1400 : 800);        // on arrival, a moment to see all three models first
      var steps = LC.dp.runPrompt(name);
      for (var k = 0; k < steps.length; k++) {
        if (!ok()) return;
        var s = steps[k];
        if (s.act === 'stop') {
          if (k === 0) {                     // sure from the prompt alone: no model is asked
            st.forEach(function (x) { x.state('dim'); });
            setWires(-1);
            await wait(500);
            if (!ok()) return;
          }
          await showAnswer(s.predict);
          await wait(2000);
          return;
        }
        var i = s.i, m = MODELS[i];
        st.forEach(function (x, j) { x.state(j === i ? 'active' : 'dim'); });
        setWires(i);
        await wait(300);
        if (!ok()) return;
        await h.pulse(pulseLayer, wires[i], 600);
        if (!ok()) return;
        await showChip(i, s.x);
        await wait(200);
        await pay(m.price);
        if (!ok()) return;
        ghost.setAttribute('cx', barW * s.q);
        ghost.removeAttribute('visibility');
        since.textContent = 'after ' + m.name;
        await bar.set(steps[k + 1].q);
        await wait(400);
      }
    }

    // a click on a dot: cut the current run short and play that prompt next
    var epoch = 0, jumpTo = null;
    function jump(k) {
      if (ctx.reduce) {
        var mine = ++epoch;
        setDots(k);
        runPrompt(ORDER[k], function () { return mine === epoch; }, true);
        return;
      }
      jumpTo = k; epoch++; wake();
    }

    // a rebuild (the figure crossed the narrow breakpoint) resumes the prompt it was playing
    var start = fig._heroAt || 0;
    resetTo(ORDER[start]);
    setDots(start);

    return async function play(alive) {
      if (ctx.reduce) {
        var mine = ++epoch;
        setDots(2);
        await runPrompt('hard', function () { return alive() && mine === epoch; }, true);
        return;
      }
      var k = start, first = true;
      try {
        while (alive()) {
          await whenVisible(alive);
          if (!alive()) break;
          if (jumpTo !== null) { k = jumpTo; jumpTo = null; }
          var now = epoch;
          setDots(k);
          fig._heroAt = k;
          await runPrompt(ORDER[k], function () { return alive() && now === epoch; }, first);
          first = false;
          if (now === epoch) k = (k + 1) % ORDER.length;
        }
      } finally {
        if (io) io.disconnect();
      }
    };
  });
})();
