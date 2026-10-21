// In-page fit guard. Paste (or template) this into every cover/poster HTML, then run
// fit.js to read the mark back out of the rendered DOM.
//
// Contract with fit.js: exactly one of these strings must appear in the document —
//   OVERFLOW_OK                 nothing sticks out of the sheet
//   OVERFLOW_BAD <offenders>    each offender is "<class or tag>:<px past bottom>"
//                               or "<class or tag>#w:<px past right>"
// 1px tolerance absorbs sub-pixel rounding; a height of 0 is an empty wrapper, not a spill.
//
// Adjust the two selectors to your page: .sheet is the fixed-size canvas, .layer is the
// content subtree measured against it. If you forget to include this script, fit.js reports
// NO-MARKER and fails, which is the intended outcome.
(function () {
  var s = document.querySelector('.sheet'), r = s.getBoundingClientRect(), bad = [];
  document.querySelectorAll('.layer *').forEach(function (e) {
    var b = e.getBoundingClientRect();
    if (b.height && b.bottom > r.bottom + 1) bad.push((e.className || e.tagName) + ':' + Math.round(b.bottom - r.bottom));
    if (b.right > r.right + 1) bad.push((e.className || e.tagName) + '#w:' + Math.round(b.right - r.right));
  });
  var d = document.createElement('div');
  d.id = 'fit';
  d.textContent = bad.length ? 'OVERFLOW_BAD ' + bad.join(',') : 'OVERFLOW_OK';
  document.head.appendChild(d);
})();
