/* fig-cover: the opening circuit board (ported from the upstream cover by Hadi Khalaf).

   One prompt, the hard one: the prompt classifier says it is 54% likely to be harmful,
   and the three Gemma models would answer harmful, safe, harmful. The board cycles
   through three circuit settings; for each, LC.dp.run gives the circuit, and the wires,
   blocks and readouts follow it. The weights below are chosen so that the three settings
   give three different circuits with the page's costs:
     prioritize accuracy   Gemma 4 E4B, then 26B, then 31B   $152 per 1M prompts
     balance               Gemma 4 26B only                   $42
     prioritize cost       no model                           $0
   The markup is static in index.html; this file only animates it. The wiring has paths
   for exactly these circuits (E4B or 26B first, 31B only after 26B). */
(function () {
  'use strict';
  var h = LC.h, M = LC.MODELS;
  var PRIOR = LC.PROMPTS.hard.prior, ANSWERS = LC.PROMPTS.hard.answers;
  var SETTINGS = [
    { name: 'Prioritize accuracy', lam: .0015 },
    { name: 'Balance cost and accuracy', lam: .0024 },
    { name: 'Prioritize cost', lam: .02 }
  ];

  function setup(fig) {
    var el = function (id) { return document.getElementById(id); };
    var diagram = el('cover-diagram'), viewport = fig.querySelector('.circuit-viewport');
    var W = ['cw0', 'cw1', 'cw2', 'cw3', 'cw4', 'cw5', 'cw6'].map(el);
    var N = ['cn0', 'cn1', 'cn2'].map(el);
    var models = ['cover-model-0', 'cover-model-1', 'cover-model-2'].map(el);
    var answers = ['cover-answer-0', 'cover-answer-1', 'cover-answer-2'].map(el);
    var input = el('cover-prompt-wire'), balanced = el('cover-balanced-wire'), prediction = el('cover-predict');
    var out = el('cover-out');
    var stages = W.concat(models, answers, [input, balanced, prediction]);
    stages.forEach(function (n) { n.classList.add('reveal-step'); });
    fig.classList.add('is-animating');

    // the classifier's wire on the left meets the board's input wire at the same height
    function alignSource() {
      var flow = fig.querySelector('.cover-flow'), source = fig.querySelector('.cover-source svg');
      var matrix = diagram.getScreenCTM();
      if (!matrix) return;
      var entry = new DOMPoint(0, 172).matrixTransform(matrix);
      flow.style.setProperty('--entry-y', (entry.y - flow.getBoundingClientRect().top) + 'px');
      var border = new DOMPoint(el('cover-board').getBoundingClientRect().left, entry.y).matrixTransform(matrix.inverse());
      input.setAttribute('d', 'M' + Math.min(0, border.x) + ',172 H48');
      var name = models[0].querySelector('.model-name');
      if (source.getScreenCTM()) {
        var base = new DOMPoint(+name.getAttribute('x'), +name.getAttribute('y')).matrixTransform(name.getScreenCTM());
        el('cover-prior').setAttribute('y', base.matrixTransform(source.getScreenCTM().inverse()).y);
      }
    }
    alignSource();
    addEventListener('resize', alignSource);
    if ('ResizeObserver' in window) new ResizeObserver(alignSource).observe(el('cover-board'));

    // on a phone the board scrolls sideways; keep the block being asked in view
    function reveal(n, follow) {
      n.classList.add('is-visible');
      if (follow && !LC.REDUCE && viewport.scrollWidth > viewport.clientWidth) {
        var r = n.getBoundingClientRect(), v = viewport.getBoundingClientRect();
        viewport.scrollTo({ left: viewport.scrollLeft + r.left - v.left - (viewport.clientWidth - r.width) / 2, behavior: 'smooth' });
      }
    }

    var inView = !('IntersectionObserver' in window);
    if (!inView) new IntersectionObserver(function (es) {
      inView = es.some(function (e) { return e.isIntersecting && e.intersectionRatio >= .25; });
    }, { threshold: [0, .25] }).observe(diagram);

    // one setting, from the prompt to the prediction; false if it was cut short
    async function run(k, alive) {
      var s = SETTINGS[k], steps = LC.dp.run(PRIOR, ANSWERS, s.lam, LC.POOLED);
      var asks = steps.filter(function (st) { return st.act === 'ask'; });
      var state = { q: PRIOR, calls: 0, cost: 0 };
      el('cover-setting').innerHTML = 'Circuit setting: <b>' + s.name + '</b>';
      stages.forEach(function (n) { n.classList.remove('is-visible'); });
      W.concat([input, balanced]).forEach(function (w) { w.classList.remove('live'); });
      N.forEach(function (n) { n.classList.remove('lit'); });
      answers.forEach(function (a) { a.textContent = ''; });
      out.textContent = '';
      viewport.scrollLeft = 0;
      function numbers() {
        el('cover-belief').textContent = h.pct(state.q);
        el('cover-calls').textContent = state.calls;
        el('cover-cost').textContent = h.usd(state.cost);
      }
      async function pause(ms) { await h.sleep(ms); return alive(); }
      async function send(w) {
        if (!alive()) return false;
        reveal(w); w.classList.add('live');
        return pause(650);
      }
      numbers();
      if (!await pause(300) || !await send(input)) return false;
      if (!asks.length) {
        if (!await send(W[3])) return false;
      } else {
        if (!await send(asks[0].i === 1 ? balanced : W[0])) return false;
        for (var j = 0; j < asks.length; j++) {
          var i = asks[j].i;
          reveal(models[i], true); N[i].classList.add('lit');
          if (!await pause(850)) return false;
          state.q = steps[steps.indexOf(asks[j]) + 1].q;
          state.calls++; state.cost += M[i].cost; numbers();
          answers[i].textContent = asks[j].x ? 'says harmful' : 'says safe';
          reveal(answers[i]);
          if (!await pause(400)) return false;
          if (j < asks.length - 1 && !await send(asks[j + 1].i === 1 ? W[1] : W[2])) return false;
        }
        if (!await send(asks[asks.length - 1].i === 1 ? W[4] : W[5]) || !await send(W[6])) return false;
      }
      out.textContent = 'P(harmful)=' + h.pct(state.q);
      reveal(prediction, true);
      return true;
    }

    // play every setting in turn while the board is on screen; reduced motion shows the first
    return async function play(alive) {
      var k = 0;
      while (alive()) {
        while (alive() && !inView && !LC.REDUCE) await new Promise(function (r) { setTimeout(r, 250); });
        if (!alive()) return;
        var ok = await run(k, function () { return alive() && (inView || LC.REDUCE); });
        if (LC.REDUCE) return;
        if (ok) { await new Promise(function (r) { setTimeout(r, 2200); }); k = (k + 1) % SETTINGS.length; }
      }
    };
  }

  LC.figure('cover', function (fig) {
    if (!fig._coverPlay) fig._coverPlay = setup(fig);
    return fig._coverPlay;
  });
})();
