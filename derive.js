#!/usr/bin/env node
// Derive every platform variant from one master draft.
//
// The discipline this encodes: variants are derived, never re-typed. A re-typed variant is
// where numbers drift apart between platforms, and it is invisible until someone compares
// them. One master, one slice marker, mechanical output.
//
//   node derive.js --config derive.example.json
//
// The master keeps the audit trail (absolute timestamps, internal row ids, sources). The
// slice from `fromSection` down is the publishable body, shared verbatim by every platform;
// each platform only prepends its own header. verify-derivation.js proves the tail stayed
// byte-identical.

const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const cfgPath = argv[argv.indexOf('--config') + 1];
if (!cfgPath || cfgPath.startsWith('--')) { console.error('usage: node derive.js --config <file.json>'); process.exit(2); }

const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const base = path.dirname(path.resolve(cfgPath));
const resolve = p => path.isAbsolute(p) ? p : path.join(base, p);

const src = fs.readFileSync(resolve(cfg.master), 'utf8');
const cut = src.indexOf(cfg.fromSection);
if (cut < 0) { console.error('fromSection not found in master: ' + cfg.fromSection); process.exit(2); }
const body = src.slice(cut);

const lead = cfg.zhihu.leadFile
  ? fs.readFileSync(resolve(cfg.zhihu.leadFile), 'utf8').replace(/\s+$/, '')
  : cfg.zhihu.lead;
const outDir = resolve(cfg.outDir || '.');
fs.mkdirSync(outDir, { recursive: true });

const zhihu = '# ' + cfg.zhihu.title + '\n\n'
  + cfg.zhihu.deck + '\n\n'
  + lead + '\n\n---\n\n' + body;
const zhihuOut = path.join(outDir, cfg.zhihu.file);
fs.writeFileSync(zhihuOut, zhihu, 'utf8');

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = s => esc(s)
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/(^|\| )\[\[?([^\]|]+)\]\]?(?= |$)/g, '$1$2');

let html = '', inCode = false, inTbl = false, inList = false, inQuote = false;
const closeAll = () => {
  if (inTbl) { html += '</table>\n'; inTbl = false; }
  if (inList) { html += '</ul>\n'; inList = false; }
  if (inQuote) { html += '</blockquote>\n'; inQuote = false; }
};
for (const raw of body.split(/\r?\n/)) {
  const l = raw.trimEnd();
  if (/^```/.test(l)) {
    closeAll();
    if (inCode) { html += '</code></pre>\n'; inCode = false; }
    else { html += '<pre style="background:#f6f6f6;padding:12px;border-radius:6px;overflow:auto;font-size:14px"><code>'; inCode = true; }
    continue;
  }
  if (inCode) { html += esc(l) + '\n'; continue; }
  if (/^##\s/.test(l)) { closeAll(); html += '<h3 style="font-size:19px;margin:26px 0 10px;color:#222">' + inline(l.replace(/^##\s*/, '')) + '</h3>\n'; continue; }
  if (/^###\s/.test(l)) { closeAll(); html += '<h4 style="font-size:17px;margin:22px 0 8px;color:#333">' + inline(l.replace(/^###\s*/, '')) + '</h4>\n'; continue; }
  if (/^---\s*$/.test(l)) { closeAll(); html += '<hr style="border:0;border-top:1px solid #e5e5e5;margin:22px 0">\n'; continue; }
  if (/^&gt;/.test(l) || /^>/.test(l)) {
    if (inList) { html += '</ul>\n'; inList = false; }
    if (!inQuote) { html += '<blockquote style="margin:14px 0;padding:10px 14px;background:#fafafa;border-left:3px solid #ddd;color:#555;font-size:15px">'; inQuote = true; }
    html += inline(l.replace(/^>\s?/, '')) + '<br>\n';
    continue;
  }
  if (inQuote) { html += '</blockquote>\n'; inQuote = false; }
  if (/^\|/.test(l)) {
    if (/^\|[ :\-|]+\|$/.test(l)) continue;
    if (!inTbl) { html += '<table style="border-collapse:collapse;width:100%;font-size:14px;margin:12px 0"><tbody>'; inTbl = true; }
    const cells = l.replace(/^\|/, '').replace(/\|$/, '').split('|');
    html += '<tr>' + cells.map(c => '<td style="border:1px solid #e3e3e3;padding:6px 8px;vertical-align:top">' + inline(c.trim()) + '</td>').join('') + '</tr>\n';
    continue;
  }
  if (inTbl) { html += '</tbody></table>\n'; inTbl = false; }
  if (/^[-*]\s+/.test(l)) {
    if (!inList) { html += '<ul style="padding-left:22px;font-size:16px;line-height:1.75">'; inList = true; }
    html += '<li style="margin:6px 0">' + inline(l.replace(/^[-*]\s+/, '')) + '</li>\n';
    continue;
  }
  if (/^\d+\.\s+/.test(l)) {
    if (!inList) { html += '<ul style="padding-left:22px;font-size:16px;line-height:1.75">'; inList = true; }
    html += '<li style="margin:6px 0">' + inline(l.replace(/^\d+\.\s+/, '')) + '</li>\n';
    continue;
  }
  if (inList) { html += '</ul>\n'; inList = false; }
  if (l === '') continue;
  html += '<p style="font-size:16px;line-height:1.85;margin:12px 0;color:#222">' + inline(l) + '</p>\n';
}
closeAll();

const wrap = '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>'
  + esc(cfg.wechat.title) + '</title></head>'
  + '<body style="max-width:677px;margin:0 auto;padding:20px;font-family:-apple-system,BlinkMacSystemFont,&quot;PingFang SC&quot;,&quot;Microsoft YaHei&quot;,sans-serif;background:#fff">'
  + '<h2 style="font-size:22px;line-height:1.5;color:#111">' + esc(cfg.wechat.title) + '</h2>'
  + '<p style="font-size:15px;color:#666;margin:6px 0 18px">' + esc(cfg.wechat.subtitle) + '</p>'
  + '<p style="font-size:13px;color:#999;border:1px dashed #ddd;padding:8px 10px">' + esc(cfg.wechat.usage) + '</p>'
  + html + '</body></html>';
const wechatOut = path.join(outDir, cfg.wechat.file);
fs.writeFileSync(wechatOut, wrap, 'utf8');

console.log(JSON.stringify({
  master: cfg.master,
  body_chars: [...body].length,
  sections_h2: (body.match(/## /g) || []).length,
  zhihu: { out: zhihuOut, chars: [...zhihu].length },
  wechat: { out: wechatOut, chars: [...wrap].length, bytes: Buffer.byteLength(wrap, 'utf8') },
}, null, 1));
