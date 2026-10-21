#!/usr/bin/env node
// One command that proves the kit's own claims. Run it before you trust a green gate.
//
//   node selfcheck.js
//
// Every expectation below is a hard assertion: the clean sample MUST pass, the dirty sample
// MUST fail and each failure MUST be attributable to a named rule, the duration fixture MUST
// recompute clean and its near-miss twin MUST go red, the derived variants MUST stay verbatim
// and MUST contain no unparsed markdown. Exit 0 only if all of that holds.
//
// This is the part most tooling of this kind skips: a gate has never been shown to catch
// anything is not a gate, it is a placebo with an exit code.

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const here = p => path.join(__dirname, p);
const node = process.execPath;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'deid-kit-'));
const results = [];

const run = (name, args, wantExit) => {
  const r = spawnSync(node, args, { encoding: 'utf8', cwd: __dirname });
  let parsed = null;
  try { parsed = JSON.parse(r.stdout); } catch (e) { /* verdict text below still explains */ }
  const ok = wantExit === null ? r.status === 0 : r.status === wantExit;
  results.push({ check: name, exit: r.status, want: wantExit, ok, stdout: r.stdout, stderr: (r.stderr || '').trim(), parsed });
  return parsed;
};

const W = ['--wordlist', here('wordlist.example.txt')];
const D = ['--dates', here('dates.example.txt')];

// 1. clean sample passes
run('gate:sample-clean must pass', [here('leakcheck.js'), here('fixtures/sample-clean.md'), ...W, ...D, '--quiet'], 0);

// 2. dirty sample fails, and every expected rule faces it
const dirty = run('gate:sample-dirty must fail', [here('leakcheck.js'), here('fixtures/sample-dirty.md'), ...W, ...D], 1);
const expectKeys = ['name:alice-lab', 'name:bobsdesk', 'name:carol-corp', 'name:northwind-repo',
  'date:1999-01', 'date:1999-02', 'date:1999-03', 'date:1999-01-04',
  'clockstamp', 'rownum', 'hashtoken', 'path', 'email', 'uuid', 'secret', 'ip'];
const gotKeys = new Set((dirty && dirty[0] && dirty[0].leak_keys) || []);
const missed = expectKeys.filter(k => !gotKeys.has(k));
const surprise = [...gotKeys].filter(k => !expectKeys.includes(k));
results.push({ check: 'gate:sample-dirty explains all 16 rule faces', ok: !missed.length && !surprise.length, missed, surprise });

// 3. --allow-link masks the URL tail and nothing else
const linked = run('gate:sample-dirty with --allow-link still fails',
  [here('leakcheck.js'), here('fixtures/sample-dirty.md'), ...W, ...D, '--allow-link'], 1);
const m = linked && linked[0];
results.push({
  check: 'allow-link masks only drive letters inside URLs',
  ok: !!(m && m.path_rule_masked_in_urls >= 1 && m.leak_keys.includes('name:alice-lab') && m.leak_keys.includes('path')),
  masked_in_urls: m && m.path_rule_masked_in_urls, scanned: m && m.path_rule_scanned,
});

// 4. durations: fixture recomputes clean, near-miss control goes red
run('durations:fixture claims recompute clean', [here('verify-durations.js'), '--fixture', here('fixtures/rows.json')], 0);
const bad = run('durations:near-miss control must fail', [here('verify-durations.js'), '--fixture', here('fixtures/rows-bad.json')], 1);
const bm = bad && bad.mismatches;
results.push({ check: 'durations:exactly the planted near-miss is reported', ok: !!bm && bm.length === 1 && bm[0].label.startsWith('F '), mismatches: bm });

// 5. end-to-end derivation
const cfg = {
  master: here('fixtures/master-sample.md'),
  fromSection: '## 0. 一句话结论',
  outDir: path.join(tmp, 'out'),
  zhihu: { file: 'zhihu.md', title: '示例标题', deck: '示例导语。', leadFile: here('fixtures/lead.example.md') },
  wechat: { file: 'wechat.html', title: '示例标题', subtitle: '示例副标题', usage: '示例用法说明。' },
};
fs.writeFileSync(path.join(tmp, 'derive.json'), JSON.stringify(cfg, null, 2));
run('derive:runs', [here('derive.js'), '--config', path.join(tmp, 'derive.json')], 0);
run('derive:variants faithful and unparsed-clean',
  [here('verify-derivation.js'), '--master', here('fixtures/master-sample.md'), '--from-section', '## 0. 一句话结论',
    '--zhihu', path.join(tmp, 'out', 'zhihu.md'), '--wechat', path.join(tmp, 'out', 'wechat.html')], 0);
run('html2text:runs', [here('html2text.js'), path.join(tmp, 'out', 'wechat.html')], 0);
run('gate:derived zhihu passes', [here('leakcheck.js'), path.join(tmp, 'out', 'zhihu.md'), ...W, ...D, '--quiet'], 0);
run('gate:derived wechat visible text passes',
  [here('leakcheck.js'), path.join(tmp, 'out', 'wechat.VISIBLE-TEXT.txt'), ...W, ...D, '--quiet'], 0);

// 6. a planted leak in a derived variant must not survive the gate
const dirtyZ = path.join(tmp, 'out', 'zhihu-dirty.md');
fs.writeFileSync(dirtyZ, fs.readFileSync(path.join(tmp, 'out', 'zhihu.md'), 'utf8')
  + '\n\n补一句：这条更正写于 1999-01-05T09:00:00.000Z，原文见 C:\\Users\\alice-lab\\x。\n', 'utf8');
run('gate:planted leak in a variant is caught', [here('leakcheck.js'), dirtyZ, ...W, ...D, '--quiet'], 1);

// 7. geometry guard reads back its own marker
if (fs.existsSync(JSON.parse(fs.readFileSync(here('fit.example.json'), 'utf8')).chrome)) {
  run('fit:ok cover reports OVERFLOW_OK',
    [here('fit.js'), '--spec', here('fit.example.json'), '--only', 'cover-ok'], 0);
  run('fit:bad cover reports overflow',
    [here('fit.js'), '--spec', here('fit.example.json'), '--only', 'cover-bad'], 1);
} else {
  results.push({ check: 'fit:skipped (no chrome at spec path)', ok: true });
}

fs.rmSync(tmp, { recursive: true, force: true });

const failed = results.filter(r => !r.ok);
console.log(JSON.stringify({
  sandbox: 'created under os.tmpdir(), removed again; path not printed on purpose',
  checks: results.length,
  failed: failed.map(f => ({ check: f.check, missed: f.missed, surprise: f.surprise, mismatches: f.mismatches, exit: f.exit, want: f.want, stderr: f.stderr })),
  verdict: failed.length ? 'FAIL' : 'PASS',
}, null, 1));
console.error('selfcheck: ' + (failed.length ? failed.length + ' of ' + results.length + ' FAILED' : results.length + ' PASS'));
process.exit(failed.length ? 1 : 0);
