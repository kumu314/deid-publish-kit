#!/usr/bin/env node
// De-identification leak gate.
//
// The rules below are pure form checks and are safe to publish. The identity word list
// and the date window are read from files that stay private (.gitignore). That split is
// the point of this file: a blacklist is the single most identifying artifact in a
// de-identification project, so it must not travel with the tool that enforces it.
//
//   node leakcheck.js <file...> [--wordlist names.txt] [--dates dates.txt]
//                     [--rownum-terms "seq|条目"] [--allow-link] [--word-boundary]
//
// exit 0 clean, 1 at least one hit, 2 usage error.
// Verdict line goes to stderr so stdout stays parseable JSON.

const fs = require('fs');

const argv = process.argv.slice(2);
const files = [];
const flags = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--allow-link' || a === '--word-boundary' || a === '--quiet') { flags[a.slice(2)] = true; continue; }
  if (a.startsWith('--')) {
    const k = a.slice(2);
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) { console.error('usage error: ' + a + ' needs a value'); process.exit(2); }
    flags[k] = v; i++;
    continue;
  }
  files.push(a);
}
if (!files.length) { console.error('usage error: no input file'); process.exit(2); }

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const readList = p => {
  if (!p) return [];
  if (!fs.existsSync(p)) { console.error('usage error: list file not found: ' + p); process.exit(2); }
  return fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)
    .map(s => s.trim()).filter(s => s && !s.startsWith('#'));
};
const names = readList(flags.wordlist);
const dates = readList(flags.dates);
const rownumTerms = flags['rownum-terms'] || 'seq|条目';

const URLISH = /\b(?:https?|ftp):\/\/[^\s"'<>()[\]{}|，。；：、！？（）「」《》]*/gi;
// A file:// URL is not exempt from the path rule — its tail IS a local path, which is
// exactly what the rule exists to catch. Only the "file://" prefix gets blanked, so the
// scheme separator does not read as a drive letter.
const FILEPREFIX = /\bfile:\/+/gi;
const PATHY = /[A-Za-z]:[\\/]/g;

function scan(txt) {
  const hits = {};
  const meta = {};
  const push = (k, v) => { (hits[k] = hits[k] || []).push(v); };
  const lineOf = idx => txt.slice(0, idx).split('\n').length;

  for (const n of names) {
    const re = new RegExp(flags['word-boundary'] ? '\\b' + esc(n) + '\\b' : esc(n), 'gi');
    let m;
    while ((m = re.exec(txt))) {
      const ln = lineOf(m.index);
      push('name:' + n, 'L' + ln + ' ' + txt.split('\n')[ln - 1].trim().slice(0, 60));
      if (hits['name:' + n].length > 3) break;
    }
  }
  for (const d of dates) {
    const re = new RegExp(esc(d), 'g');
    let m;
    while ((m = re.exec(txt))) push('date:' + d, m[0]);
  }

  for (const m of txt.matchAll(/\b\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z\b/g)) push('clockstamp', m[0]);
  for (const m of txt.matchAll(new RegExp('\\b(?:' + rownumTerms + ')\\s*#?\\s*\\d{2,6}', 'gi'))) push('rownum', m[0]);
  for (const m of txt.matchAll(/#[0-9a-f]{3,}/gi)) push('hashtoken', m[0]);

  // The drive-path rule also eats the tail of a URL ("https://" reads as "s:/"), so any
  // text carrying a link trips it. --allow-link blanks URLs out of the path rule only,
  // and everything above still sees the raw text: an identity inside a link never escapes.
  const urlBlanked = txt.replace(URLISH, m => ' '.repeat(m.length)).replace(FILEPREFIX, m => ' '.repeat(m.length));
  const pathSrc = flags['allow-link'] ? urlBlanked : txt;
  const rawPaths = [...txt.matchAll(PATHY)].map(m => m.index);
  for (const m of pathSrc.matchAll(PATHY)) push('path', m[0]);
  if (flags['allow-link']) {
    meta.path_rule_scanned = rawPaths.length;
    meta.path_rule_masked_in_urls = rawPaths.length - [...pathSrc.matchAll(PATHY)].length;
  }

  for (const m of txt.matchAll(/[A-Za-z0-9_.+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/g)) push('email', m[0]);
  for (const m of txt.matchAll(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi)) push('uuid', m[0]);
  for (const m of txt.matchAll(/\b(?:sk|ghp|xox[abp]|AIza)[A-Za-z0-9_-]{6,}\b/g)) push('secret', m[0]);
  for (const m of txt.matchAll(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g)) push('ip', m[0]);

  return { hits, meta };
}

let bad = 0;
const report = files.map(file => {
  const txt = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const { hits, meta } = scan(txt);
  const keys = Object.keys(hits);
  if (keys.length) bad++;
  if (flags.quiet) return { file, leak_keys: keys.length, verdict: keys.length ? 'FAIL' : 'PASS' };
  return {
    file,
    chars: [...txt].length,
    lines: txt.split('\n').length,
    bytes: Buffer.byteLength(txt, 'utf8'),
    rules_loaded: { names: names.length, dates: dates.length },
    ...meta,
    leak_keys: keys,
    detail: keys.reduce((a, k) => (a[k] = hits[k].slice(0, 4), a), {}),
  };
});
console.log(JSON.stringify(report, null, 1));
console.error('verdict: ' + (bad ? 'leaks in ' + bad + ' of ' + files.length : 'clean ' + files.length + ' file(s)'));
process.exit(bad ? 1 : 0);
