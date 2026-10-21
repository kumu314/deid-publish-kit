#!/usr/bin/env node
// Prove the derived variants are what the master said, and nothing is left unparsed.
//
// Two distinct failure faces, both silent:
//   A. Markdown the paste pipeline did not convert (**, backticks, table pipes, [[links]])
//      reaches the reader as raw syntax. Looks finished; renders wrong.
//   B. A "platform version" someone edited by hand has drifted from the master, so the
//      same claim now reads differently on two platforms.
//
//   node verify-derivation.js --master <md> --from-section "<marker>" \
//                             --zhihu <md> --wechat <html>
// exit 0 both faces clean, 1 otherwise.

const fs = require('fs');

const argv = process.argv.slice(2);
const flags = {};
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) flags[argv[i].slice(2)] = argv[++i];
for (const k of ['master', 'from-section', 'zhihu', 'wechat']) {
  if (!flags[k]) { console.error('usage error: --' + k + ' is required'); process.exit(2); }
}

const h = fs.readFileSync(flags.wechat, 'utf8');
const z = fs.readFileSync(flags.zhihu, 'utf8');
const src = fs.readFileSync(flags.master, 'utf8');

const smells = [
  ['bold-leftover', /\*\*/g],
  ['backtick-leftover', /`/g],
  ['double-escaped', /&amp;(lt|gt|amp);/g],
  ['wikilink-leftover', /\[\[/g],
];
const leaks = {};
for (const [name, re] of smells) {
  const m = [...h.matchAll(re)];
  if (m.length) leaks[name] = m.slice(0, 3).map(x => h.slice(Math.max(0, x.index - 50), x.index + 50).replace(/\s+/g, ' '));
}
// table pipes are the common legitimate case (a cell that never opened a table row);
// reported, not failed, so a human reads the context.
const pipes = [...h.matchAll(/\|/g)];

const counts = {
  table: (h.match(/<table/g) || []).length,
  tr: (h.match(/<tr>/g) || []).length,
  p: (h.match(/<p /g) || []).length,
  h3: (h.match(/<h3/g) || []).length,
  h4: (h.match(/<h4/g) || []).length,
  pre: (h.match(/<pre/g) || []).length,
  li: (h.match(/<li/g) || []).length,
};

const cut = src.indexOf(flags['from-section']);
if (cut < 0) { console.error('from-section marker not found in master'); process.exit(2); }
const body = src.slice(cut);
const zhihuVerbatim = z.endsWith(body);
const wechatHasBodyWords = (() => {
  // Tag-stripped containment check: every 40-character window of the body must appear in
  // the HTML. Catches a silently truncated or hand-edited variant, which element counts
  // alone will not.
  //
  // The comparison is content, not layout, so the markdown side is normalized exactly the
  // way the converter consumes it: fence lines vanish, list markers are eaten by the
  // <li>/<ol> wrapper, table separator rows are dropped. Without those three steps a
  // faithful variant reports missing windows for every list it converted correctly —
  // which is the failure mode this function was written to catch, faked by a bug in itself.
  const eaten = s => s.replace(/^```.*$/gm, ' ').replace(/^\s*(?:\d+\.|[-*+])\s+/gm, ' ')
    .replace(/^\|[ :\-|]+\|\s*$/gm, ' ');
  const strip = s => s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[*`|>#\[\]]/g, '').replace(/\s+/g, '');
  const flat = strip(h);
  const norm = strip(eaten(body));
  let missing = 0;
  const windows = Math.max(1, Math.floor((norm.length - 40) / 40) + 1);
  for (let i = 0; i + 40 <= norm.length; i += 40) if (!flat.includes(norm.slice(i, i + 40))) missing++;
  return { windows, missing };
})();

const fail = Object.keys(leaks).length || !zhihuVerbatim || wechatHasBodyWords.missing;
console.log(JSON.stringify({
  wechat_unparsed: leaks,
  wechat_stray_pipes: pipes.length,
  counts,
  zhihu_tail_verbatim: zhihuVerbatim,
  wechat_body_containment: wechatHasBodyWords,
  verdict: fail ? 'FAIL' : 'PASS',
}, null, 1));
process.exit(fail ? 1 : 0);
