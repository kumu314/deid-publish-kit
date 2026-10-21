#!/usr/bin/env node
// Render cover/poster HTML to PNG with real Chrome headless.
//
// Why real Chrome and not an image library: the artifact is HTML+CSS (text laid out by the
// browser), and the thing you want to catch is what the browser actually did with it —
// font fallback, wrapping, a clipped last line. A generated bitmap tells you nothing.
//
// Why text is laid out in HTML and never baked into an AI image: image models re-spell
// words. Generate a background without text, then set every glyph in CSS.
//
//   node render.js --spec fit.example.json [--only name] [--out out/png]
// Exits non-zero if any PNG is missing or 0 bytes. It does not check whether the image is
// correct; fit.js checks geometry, and a human still has to look at the encoding.

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const flags = {};
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) flags[argv[i].slice(2)] = argv[++i];
if (!flags.spec) { console.error('usage: node render.js --spec <fit.json> [--only a,b] [--out dir]'); process.exit(2); }

const specPath = path.resolve(flags.spec);
const base = path.dirname(specPath);
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const abs = p => (p && path.isAbsolute(p) ? p : p ? path.join(base, p) : p);
const chrome = spec.chrome;
const htmlDir = abs(spec.htmlDir || '.');
const profile = abs(spec.profile || path.join(base, 'out', 'chrome-profile'));
const outDir = abs(flags.out || spec.outDir || path.join(base, 'out', 'png'));
const only = flags.only ? flags.only.split(',').map(s => s.trim()) : null;
if (!chrome || !fs.existsSync(chrome)) { console.error('chrome binary not found; set "chrome" in the spec'); process.exit(2); }
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(profile, { recursive: true });

const report = [];
let bad = 0;
for (const [name, size] of Object.entries(spec.targets)) {
  if (only && !only.includes(name)) continue;
  const file = path.join(htmlDir, name + '.html');
  if (!fs.existsSync(file)) { report.push({ name, verdict: 'NO-FILE' }); bad++; continue; }
  const png = path.join(outDir, name + '.png');
  const [w, h] = size.split(',');
  const args = [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--allow-file-access-from-files', '--virtual-time-budget=' + (spec.virtualTimeBudget || 8000),
    '--no-first-run', '--no-default-browser-check', '--user-data-dir=' + profile,
    '--window-size=' + w + ',' + h,
  ];
  if (spec.background) args.push('--default-background-color=' + spec.background);
  args.push('--screenshot=' + png, 'file:///' + file.replace(/\\/g, '/'));
  const r = spawnSync(chrome, args, { encoding: 'utf8', timeout: spec.timeoutMs || 120000 });
  const size2 = fs.existsSync(png) ? fs.statSync(png).size : 0;
  const ok = r.status === 0 && size2 > 0;
  if (!ok) bad++;
  report.push({ name, png, bytes: size2, exit: r.status, verdict: ok ? 'PASS' : 'FAIL' });
}
console.log(JSON.stringify({ outDir, targets: report, verdict: bad ? 'FAIL' : 'PASS' }, null, 1));
console.error('render: ' + (bad ? bad + ' failed' : report.length + ' png written'));
process.exit(bad ? 1 : 0);
