/* Authors: the Photos | 16-bit toggle above the cards.

   It starts on photos, or on 16-bit when the page is in its pixel style (?style=pixel, which
   core.js records as <html data-style="pixel">). Hovering or focusing a card shows the other
   version (CSS). The toggle is a radio group: arrow keys move the choice, as in any radio group.
   Without script the photos show and the toggle stays hidden. */
(function () {
  'use strict';

  function init() {
    var sec = document.getElementById('authors');
    var grid = sec && sec.querySelector('.author-grid');
    var sw = sec && sec.querySelector('[data-portrait-switch]');
    if (!grid || !sw) return;
    var buttons = Array.prototype.slice.call(sw.querySelectorAll('[role="radio"]'));

    function set(view, focus) {
      grid.dataset.view = view;
      buttons.forEach(function (b) {
        var on = b.dataset.view === view;
        b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;   // one tab stop for the group
        if (on && focus) b.focus();
      });
      // screen readers hear only the version that is showing
      grid.querySelectorAll('.portrait').forEach(function (p) {
        var ph = p.querySelector('.ph'), px = p.querySelector('.px');
        if (view === 'pixel') { ph.setAttribute('aria-hidden', 'true'); px.removeAttribute('aria-hidden'); }
        else { px.setAttribute('aria-hidden', 'true'); ph.removeAttribute('aria-hidden'); }
      });
    }

    buttons.forEach(function (b, i) {
      b.addEventListener('click', function () { set(b.dataset.view); });
      b.addEventListener('keydown', function (e) {
        var step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (!step) return;
        e.preventDefault();
        set(buttons[(i + step + buttons.length) % buttons.length].dataset.view, true);
      });
    });

    set(document.documentElement.dataset.style === 'pixel' ? 'pixel' : 'photo');
    sw.hidden = false;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
