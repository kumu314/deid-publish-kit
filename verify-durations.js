#!/usr/bin/env node
// Recompute every relative-duration claim from raw row times, mechanically.
//
// A de-identified draft replaces absolute timestamps with durations (T+22h, 第 31 天).
// That conversion is arithmetic done by hand at least once, and hand arithmetic on
// timestamps is where a published number goes wrong while still looking plausible. So
// the durations are not typed into the draft: they are emitted here and pasted.
//
//   node verify-durations.js --fixture fixtures/rows.json      # dependency-free demo
//   node verify-durations.js --fixture fixtures/rows-bad.json  # negative control, exits 1
//
// The fixture is a plain dump of your own rows table: any store that can return
// { seq, at } works; see fixtures/dump-rows.example.sql for the query shape. `at` must be
// an ISO string with Z. Add --json to dump the whole recomputed table instead of only the
// claim verdicts.
//
// Rounding口径 is part of the claim: min is kept to one decimal, days to two, and the
// human form switches unit at 60 minutes and at 1440 minutes. Change a threshold here and
// every previously published figure needs re-checking, so the function is single-sourced.

const fs = require('fs');

const argv = process.argv.slice(2);
const flags = {};
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) flags[argv[i].slice(2)] = argv[++i];
if (!flags.fixture) { console.error('usage: node verify-durations.js --fixture <rows.json> [--json]'); process.exit(2); }

const fx = JSON.parse(fs.readFileSync(flags.fixture, 'utf8'));
const anchorMs = Date.parse(fx.anchor);
if (!Number.isFinite(anchorMs)) { console.error('bad anchor in fixture: ' + fx.anchor); process.exit(2); }

const bySeq = new Map(fx.rows.map(r => [r.seq, r]));
const row = s => {
  const r = bySeq.get(s);
  if (!r) { console.error('fixture has no row with seq ' + s); process.exit(2); }
  return r;
};
const dayOf = r => Math.floor((Date.parse(r.at) - anchorMs) / 864e5) + 1;
const minutes = (x, y) => (Date.parse(row(y).at) - Date.parse(row(x).at)) / 6e4;
const human = m => m >= 1440 ? (m / 1440).toFixed(2) + 'd'
  : m >= 60 ? Math.floor(m / 60) + 'h' + Math.round(m % 60) + 'm'
    : Math.round(m) + 'm';

const durationClaims = (fx.claims || []).map(c => {
  const m = +minutes(c.seqs[0], c.seqs[1]).toFixed(1);
  const got = human(m);
  return { label: c.label, pair: c.seqs.join('->'), min: m, recomputed: got, published: c.published, ok: got === c.published };
});
const dayClaims = (fx.day_claims || []).map(c => {
  const got = String(dayOf(row(c.seq)));
  return { label: c.label, seq: c.seq, recomputed: got, published: String(c.published), ok: got === String(c.published) };
});

const all = [...durationClaims, ...dayClaims];
const bad = all.filter(c => !c.ok);

if (flags.json) {
  console.log(JSON.stringify({
    anchor: fx.anchor,
    rows: fx.rows.map(r => ({ seq: r.seq, at: r.at, day: dayOf(r) })),
    claims: all,
    verdict: bad.length ? 'FAIL' : 'PASS',
  }, null, 1));
} else {
  console.log(JSON.stringify({
    checked: all.length,
    mismatches: bad,
    rows_available: fx.rows.length,
    verdict: bad.length ? 'FAIL' : 'PASS',
  }, null, 1));
}
console.error('duration claims: ' + (bad.length ? bad.length + ' MISMATCH' : all.length + ' recomputed clean'));
process.exit(bad.length ? 1 : 0);
