#!/usr/bin/env node
/* Layout checks and screenshots for index.html, in headless Chrome.

   node tools/qa.mjs [--widths 1440,390] [--fig hero,dp] [--query style=pixel]
                     [--out qa-out] [--sections] [--full] [--text copy.txt]

   Serves the site from its root, loads index.html?qa (every figure jumps to its
   final frame) at each width, and reports for every figure:
     small     SVG text rendered below 14px (13px when the page is under 600px wide)
     overlaps  two visible texts whose boxes intersect
     hits      a visible line, wire or shape running through a text
     clipped   text that sticks out of its <svg>
     canvas    for <canvas> figures, the CSS-to-backing scale (pixel art wants whole numbers)
   plus page-level horizontal overflow and console errors. Screenshots of each
   figure (and each section with --sections, the full page with --full) go to
   --out. Exit code 1 if any check fails. Needs Node 22+ and Google Chrome. */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, extname, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => {
  if (v.startsWith('--')) a.push([v.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
  return a;
}, []));
const WIDTHS = String(args.widths || '1440,390').split(',').map(Number);
const ONLY = args.fig ? String(args.fig).split(',') : null;
const OUT = resolve(String(args.out || join(ROOT, 'qa-out')));
const QUERY = args.query ? '&' + String(args.query) : '';
const ONLYQ = ONLY && !args.all ? '&only=' + encodeURIComponent(ONLY.join(',')) : '';   // --all mounts every figure
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.woff2': 'font/woff2', '.webp': 'image/webp' };

function serve() {
  const srv = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = join(ROOT, path === '/' ? 'index.html' : path);
    if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(500); res.end(); }
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}

async function launch() {
  const dir = await mkdtemp(join(tmpdir(), 'qa-chrome-'));
  const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + dir, 'about:blank'],
    { stdio: 'ignore' });
  const portFile = join(dir, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !existsSync(portFile); i++) await new Promise(r => setTimeout(r, 100));
  const [port] = (await readFile(portFile, 'utf8')).split('\n');
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = list.find(t => t.type === 'page');
  return { proc, dir, ws: page.webSocketDebuggerUrl };
}

function cdp(url) {
  const ws = new WebSocket(url);
  let id = 0; const waits = new Map(); const listeners = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && waits.has(m.id)) { const w = waits.get(m.id); waits.delete(m.id); m.error ? w.rej(new Error(m.error.message)) : w.res(m.result); }
    else listeners.forEach(f => f(m));
  };
  const ready = new Promise(r => { ws.onopen = r; });
  return {
    ready,
    send: (method, params = {}) => new Promise((res, rej) => { const i = ++id; waits.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); }),
    on: f => listeners.push(f),
    close: () => ws.close()
  };
}

/* Runs in the page. Returns { page, figs: [...] }. */
const CHECK = String.raw`(function (minPx, only) {
  function visible(el) {
    for (var e = el; e && e.nodeType === 1; e = e.parentNode) {
      var cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return false;
    }
    return true;
  }
  function inter(a, b) {
    var w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return w > 0 && h > 0 ? w * h : 0;
  }
  function contains(o, i) { return o.left <= i.left + 1 && o.right >= i.right - 1 && o.top <= i.top + 1 && o.bottom >= i.bottom - 1; }
  var out = { page: { scrollWidth: document.documentElement.scrollWidth, innerWidth: innerWidth }, figs: [] };
  document.querySelectorAll('[data-fig]').forEach(function (fig) {
    var name = fig.dataset.fig;
    if (only && only.indexOf(name) < 0) return;
    var f = { name: name, width: fig.clientWidth, texts: 0, minFont: null, small: [], overlaps: [], hits: [], clipped: [], htmlSmall: [], canvas: [] };
    fig.querySelectorAll('svg').forEach(function (svg) {
      if (!visible(svg) || svg.closest('.mini-btn')) return;
      var sb = svg.getBoundingClientRect();
      if (sb.width < 2) return;
      var texts = Array.prototype.filter.call(svg.querySelectorAll('text'), function (t) { return t.textContent.trim() && visible(t); });
      var boxes = texts.map(function (t) {
        var ctm = t.getScreenCTM(), r = t.getBoundingClientRect();
        var px = parseFloat(getComputedStyle(t).fontSize) * (ctm ? Math.hypot(ctm.a, ctm.b) : 1);
        return { t: t, r: r, px: px, s: t.textContent.trim().slice(0, 48) };
      });
      f.texts += boxes.length;
      boxes.forEach(function (b) {
        if (f.minFont === null || b.px < f.minFont) f.minFont = Math.round(b.px * 10) / 10;
        if (b.px < minPx - 0.05) f.small.push({ text: b.s, px: Math.round(b.px * 10) / 10 });
        if (b.r.left < sb.left - 1 || b.r.right > sb.right + 1 || b.r.top < sb.top - 1 || b.r.bottom > sb.bottom + 1)
          f.clipped.push({ text: b.s });
      });
      for (var i = 0; i < boxes.length; i++) for (var j = i + 1; j < boxes.length; j++) {
        if (inter(boxes[i].r, boxes[j].r) > 4) f.overlaps.push({ a: boxes[i].s, b: boxes[j].s });
      }
      var shapes = Array.prototype.filter.call(svg.querySelectorAll('path, line, polyline, polygon, circle, ellipse, rect'), function (s) {
        return visible(s) && !s.closest('.qa-ignore') && !s.closest('defs, marker, clipPath, mask');
      });
      boxes.forEach(function (b) {
        // sample the middle of the text box (glyph boxes include ascender and descender space)
        var r = b.r, x0 = r.left + r.width * .08, x1 = r.right - r.width * .08, y0 = r.top + r.height * .3, y1 = r.bottom - r.height * .3;
        shapes.forEach(function (s) {
          var sr = s.getBoundingClientRect();
          if (!inter(sr, r) && !(sr.width === 0 || sr.height === 0)) return;
          if (sr.right < r.left || sr.left > r.right || sr.bottom < r.top || sr.top > r.bottom) return;
          var cs = getComputedStyle(s), ctm = s.getScreenCTM();
          if (!ctm) return;
          var inv = ctm.inverse(), p = svg.createSVGPoint();
          var stroke = cs.stroke !== 'none' && parseFloat(cs.strokeWidth) > 0 && parseFloat(cs.strokeOpacity) > 0.05;
          var fill = cs.fill !== 'none' && parseFloat(cs.fillOpacity) > 0.05 && !contains(sr, r);
          var hit = false;
          for (var gx = 0; gx < 7 && !hit; gx++) for (var gy = 0; gy < 3 && !hit; gy++) {
            p.x = x0 + (x1 - x0) * gx / 6; p.y = y0 + (y1 - y0) * gy / 2;
            var q = p.matrixTransform(inv);
            if ((stroke && s.isPointInStroke && s.isPointInStroke(q)) || (fill && s.isPointInFill && s.isPointInFill(q))) hit = true;
          }
          if (hit) f.hits.push({ text: b.s, shape: s.tagName + (s.getAttribute('class') ? '.' + s.getAttribute('class').split(' ').join('.') : '') });
        });
      });
    });
    // HTML text inside the figure (controls, legends, captions)
    var walker = document.createTreeWalker(fig, NodeFilter.SHOW_TEXT);
    var seen = new Set();
    while (walker.nextNode()) {
      var n = walker.currentNode, el = n.parentElement;
      if (!n.textContent.trim() || !el || el.closest('svg') || seen.has(el) || !visible(el)) continue;
      seen.add(el);
      var px = parseFloat(getComputedStyle(el).fontSize);
      if (px < 13 - 0.05) f.htmlSmall.push({ text: n.textContent.trim().slice(0, 48), px: px });
    }
    fig.querySelectorAll('canvas').forEach(function (c) {
      if (!visible(c)) return;
      var sx = c.getBoundingClientRect().width / c.width;
      f.canvas.push({ backing: c.width + 'x' + c.height, css: Math.round(c.getBoundingClientRect().width) + 'x' + Math.round(c.getBoundingClientRect().height),
        scale: Math.round(sx * 1000) / 1000, wholeScale: Math.abs(sx * devicePixelRatio - Math.round(sx * devicePixelRatio)) < 0.02,
        rendering: getComputedStyle(c).imageRendering });
    });
    out.figs.push(f);
  });
  return JSON.stringify(out);
})`;

async function main() {
  await mkdir(OUT, { recursive: true });
  const srv = await serve();
  const port = srv.address().port;
  const chrome = await launch();
  const c = cdp(chrome.ws);
  await c.ready;
  const errors = [];
  c.on(m => {
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning'))
      errors.push(m.params.type + ': ' + m.params.args.map(a => a.value ?? a.description).join(' '));
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(m.params.entry.text + ' ' + (m.params.entry.url || ''));
  });
  await c.send('Runtime.enable'); await c.send('Page.enable'); await c.send('Log.enable');
  const report = { widths: {}, errors };
  let failed = false;
  for (const w of WIDTHS) {
    const h = w < 600 ? 844 : 900;
    await c.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
    await c.send('Page.navigate', { url: `http://127.0.0.1:${port}/index.html?qa${QUERY}${ONLYQ}` });
    let done = false;
    for (let i = 0; i < 200 && !done; i++) {
      await new Promise(r => setTimeout(r, 100));
      const r = await c.send('Runtime.evaluate', { expression: 'document.readyState === "complete" && window.LC_QA_DONE === true', returnByValue: true }).catch(() => null);
      done = r?.result?.value === true;
    }
    if (!done) errors.push(`width ${w}: figures did not finish (window.LC_QA_DONE never set)`);
    await new Promise(r => setTimeout(r, 400));
    const minPx = w < 600 ? 13 : 14;
    const r = await c.send('Runtime.evaluate', { expression: `${CHECK}(${minPx}, ${JSON.stringify(ONLY)})`, returnByValue: true });
    const res = JSON.parse(r.result.value);
    report.widths[w] = res;
    if (res.page.scrollWidth > res.page.innerWidth + 1) failed = true;
    for (const f of res.figs) {
      if (f.small.length || f.overlaps.length || f.hits.length || f.clipped.length || f.htmlSmall.length) failed = true;
      if (f.canvas.some(cv => !cv.wholeScale)) failed = true;
      const box = await c.send('Runtime.evaluate', { expression: `(function(){var e=document.querySelector('[data-fig="${f.name}"]');var r=e.getBoundingClientRect();return JSON.stringify({x:r.left+scrollX,y:r.top+scrollY,w:r.width,h:r.height});})()`, returnByValue: true });
      const b = JSON.parse(box.result.value);
      if (b.w > 0 && b.h > 0) {
        const shot = await c.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: b.x, y: b.y, width: b.w, height: b.h, scale: 1 } });
        const file = join(OUT, `fig-${f.name}-${w}${QUERY ? '-' + QUERY.slice(1).replace(/[^a-z0-9]+/gi, '_') : ''}.png`);
        await writeFile(file, Buffer.from(shot.data, 'base64'));
        f.screenshot = file;
      }
    }
    if (args.sections) {
      const ids = await c.send('Runtime.evaluate', { expression: `JSON.stringify(Array.from(document.querySelectorAll('[data-title]')).map(function(s){var r=s.getBoundingClientRect();return {id:s.id,x:0,y:r.top+scrollY,w:innerWidth,h:r.height};}))`, returnByValue: true });
      for (const s of JSON.parse(ids.result.value)) {
        const shot = await c.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: s.y, width: s.w, height: Math.min(s.h, 4000), scale: 1 } });
        await writeFile(join(OUT, `section-${s.id}-${w}.png`), Buffer.from(shot.data, 'base64'));
      }
    }
    if (args.text && w === WIDTHS[0]) {
      // every word a reader can meet: each screen, the words inside its figures
      // (final state), the figures' screen-reader labels, and the sheets
      const r = await c.send('Runtime.evaluate', { returnByValue: true, expression: `(function () {
        var out = [];
        document.querySelectorAll('[data-title]').forEach(function (s) {
          out.push('## ' + s.dataset.title + ' (#' + s.id + ')', s.innerText.trim());
          s.querySelectorAll('[data-fig]').forEach(function (f) {
            var t = Array.from(f.querySelectorAll('svg text')).map(function (n) { return n.textContent.trim(); }).filter(Boolean);
            if (t.length) out.push('[figure ' + f.dataset.fig + ', words in the drawing] ' + t.join(' | '));
            if (f.getAttribute('aria-label')) out.push('[figure ' + f.dataset.fig + ', screen-reader label] ' + f.getAttribute('aria-label'));
          });
          out.push('');
        });
        document.querySelectorAll('dialog.sheet').forEach(function (d) {
          d.show(); out.push('## Sheet: ' + d.id, d.innerText.trim(), ''); d.close();
        });
        return out.join('\\n');
      })()` });
      await writeFile(resolve(String(args.text)), r.result.value + '\n');
    }
    if (args.full) {
      const m = await c.send('Page.getLayoutMetrics');
      const shot = await c.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: Math.min(m.cssContentSize.height, 16000), scale: 1 } });
      await writeFile(join(OUT, `page-${w}.png`), Buffer.from(shot.data, 'base64'));
    }
  }
  const realErrors = errors.filter(e => !/favicon\.ico/.test(e));
  if (realErrors.length) failed = true;
  await writeFile(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  for (const [w, res] of Object.entries(report.widths)) {
    console.log(`\n== width ${w}: page scrollWidth ${res.page.scrollWidth} / ${res.page.innerWidth}`);
    for (const f of res.figs) {
      const bad = ['small', 'overlaps', 'hits', 'clipped', 'htmlSmall'].filter(k => f[k].length).map(k => `${k} ${f[k].length}`);
      console.log(`  ${f.name.padEnd(12)} texts ${String(f.texts).padStart(3)}  min ${f.minFont ?? '-'}px  ${bad.length ? 'FAIL ' + bad.join(', ') : 'ok'}${f.canvas.length ? '  canvas ' + f.canvas.map(cv => cv.backing + '→' + cv.css + (cv.wholeScale ? '' : ' (not whole scale)')).join(' ') : ''}`);
      for (const k of ['small', 'overlaps', 'hits', 'clipped', 'htmlSmall']) for (const it of f[k].slice(0, 8)) console.log(`      ${k}: ${JSON.stringify(it)}`);
    }
  }
  if (errors.length) { console.log('\n== console errors'); errors.forEach(e => console.log('  ' + e)); }
  console.log(`\nreport: ${join(OUT, 'report.json')}\n${failed ? 'FAILED' : 'PASSED'}`);
  c.close(); chrome.proc.kill(); srv.close();
  await rm(chrome.dir, { recursive: true, force: true }).catch(() => {});
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(2); });
