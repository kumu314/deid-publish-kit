#!/usr/bin/env node
// Extract reader-visible text from an HTML artifact so the leak gate runs on content
// instead of on markup.
//
// Without this, a gate applied to a paste-ready HTML page reports the stylesheet: CSS
// colour tokens look like hash tokens, font-stack names look like identifiers, and the
// real prose is buried under tags. Strip first, then judge.
//
//   node html2text.js <file.html>
// Writes <file>.VISIBLE-TEXT.txt next to the input; feed that to leakcheck.js.
// The original HTML is not modified, so the artifact you paste and the artifact you
// audited stay the same bytes.

const fs = require('fs');
const file = process.argv[2];
if (!file) { console.error('usage: node html2text.js <file.html>'); process.exit(2); }

let s = fs.readFileSync(file, 'utf8');
s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ');
s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
s = s.replace(/<[^>]+>/g, ' ');
s = s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
s = s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n');

const out = file.replace(/\.html?$/i, '') + '.VISIBLE-TEXT.txt';
fs.writeFileSync(out, s.trim() + '\n', 'utf8');
console.log(JSON.stringify({ src: file, out, chars: [...s.trim()].length }));
