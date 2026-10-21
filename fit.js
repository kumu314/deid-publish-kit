#!/usr/bin/env node
// Read the in-page fit guard back from a headless render, before trusting the PNG.
//
// A cover image is an artifact a human will look at and a machine will not: nothing in the
// pipeline notices that the last line was clipped. The cover HTML therefore carries a
// measuring script (see cover-guard.js) that writes OVERFLOW_OK / OVERFLOW_BAD into the DOM,
// and this file dumps that DOM and reads the mark. No mark at all is a failure too — a guard
// that never ran is indistinguishable from a page that fits.
//
//   node fit.js --spec fit.example.json [--only cover-ok,cover-bad]
// exit 0 every target OVERFLOW_OK, 1 otherwise.
//
// This checks geometry only. It cannot tell you that a bar chart's encoding is a lie
// (percentage heights squeezed by sibling label rows render at the same height for 80 and
// 37); that check is "look at the PNG", and it has to happen.

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const flags = {};
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) flags[argv[i].slice(2)] = argv[++i];
if (!flags.spec) { console.error('usage: node fit.js --spec <fit.json> [--only a,b]'); process.exit(2); }

const specPath = path.resolve(flags.spec);
const base = path.dirname(specPath);
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const abs = p => (p && path.isAbsolute(p) ? p : p ? path.join(base, p) : p);
const chrome = spec.chrome;
const htmlDir = abs(spec.htmlDir || '.');
const profile = abs(spec.profile || path.join(base, 'out', 'chrome-profile'));
const only = flags.only ? flags.only.split(',').map(s => s.trim()) : null;
if (!chrome || !fs.existsSync(chrome)) { console.error('chrome binary not found; set "chrome" in the spec'); process.exit(2); }

const out = [];
let bad = 0;
for (const [name, size] of Object.entries(spec.targets)) {
  if (only && !only.includes(name)) continue;
  const file = path.join(htmlDir, name + '.html');
  if (!fs.existsSync(file)) { out.push({ file: name, fit: 'NO-FILE' }); bad++; continue; }
  const r = spawnSync(chrome, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--allow-file-access-from-files', '--virtual-time-budget=' + (spec.virtualTimeBudget || 6000),
    '--no-first-run', '--no-default-browser-check', '--user-data-dir=' + profile,
    '--window-size=' + size, '--dump-dom', 'file:///' + file.replace(/\\/g, '/'),
  ], { encoding: 'utf8', timeout: spec.timeoutMs || 60000 });
  const m = /OVERFLOW_[A-Z]+[^<]*/.exec(r.stdout || '');
  const mark = m ? m[0].slice(0, 200) : 'NO-MARKER';
  if (mark !== 'OVERFLOW_OK') bad++;
  out.push({ file: name, exit: r.status, fit: mark });
}
console.log(JSON.stringify({ htmlDir, profile, targets: out, verdict: bad ? 'FAIL' : 'PASS' }, null, 1));
console.error('fit: ' + (bad ? bad + ' target(s) not OK' : 'all OVERFLOW_OK'));
process.exit(bad ? 1 : 0);
