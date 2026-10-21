#!/usr/bin/env node
// Honest size of a markdown/text file plus a timestamp audit.
//
// Two reasons this exists:
//   1. Platform caps are counted in characters, not bytes and not words. Counting code
//      points ([...s].length) is the only口径 that survives emoji, CJK and full-width
//      punctuation; a byte count inflates, a .length count undercounts surrogate pairs.
//   2. Every ISO timestamp left in a "de-identified" draft is a live anchor. This lists
//      each one and rewrites it as its distance from a chain start, which is the form you
//      are actually allowed to publish. If the draft claims "day N", read the day column.
//
//   node measure.js <file> [--anchor 1999-01-04T08:00:00.000Z]
// The anchor itself is a date from your private window; never paste it into the draft.

const fs = require('fs');

const argv = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) { flags[argv[i].slice(2)] = argv[++i]; continue; }
  positional.push(argv[i]);
}
if (!positional.length) { console.error('usage: node measure.js <file> [--anchor ISO]'); process.exit(2); }

const file = positional[0];
const anchorArg = flags.anchor || positional[1];
const anchorMs = anchorArg ? Date.parse(anchorArg) : NaN;
const txt = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
const chars = [...txt].length;
const lines = txt.split('\n').length;
const bytes = Buffer.byteLength(txt, 'utf8');
const iso = [...txt.matchAll(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z/g)];

const map = iso.map(m => {
  const off = Date.parse(m[0]) - anchorMs;
  return Number.isFinite(off)
    ? { stamp: m[0], day: Math.floor(off / 864e5) + 1, hhmm: new Date(off).toISOString().slice(11, 16) }
    : { stamp: m[0], day: null, hhmm: null };
});
const uniq = [...new Map(map.map(x => [x.stamp, x])).values()];

console.log(JSON.stringify({
  file, chars, lines, bytes,
  iso_total: map.length,
  iso_distinct: uniq.length,
  anchor_given: Number.isFinite(anchorMs),
  note: Number.isFinite(anchorMs)
    ? 'day is 1-based from the anchor: a row 30 days later reads as day 31, not day 30'
    : 'no anchor: day column unavailable, only the count of surviving timestamps',
  uniq,
}, null, 1));
