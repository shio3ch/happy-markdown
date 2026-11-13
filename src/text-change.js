'use strict';
// One contiguous replacement keeps unrelated text and line endings intact.
function textChange(before, after) {
  if (before === after) return;
  let start = 0, end = before.length, nextEnd = after.length;
  while (start < end && start < nextEnd && before[start] === after[start]) start++;
  // Do not split a UTF-16 surrogate pair at the replacement boundary.
  if (start && /[\uD800-\uDBFF]/.test(before[start - 1])) start--;
  while (end > start && nextEnd > start && before[end - 1] === after[nextEnd - 1]) { end--; nextEnd--; }
  if (end < before.length && /[\uDC00-\uDFFF]/.test(before[end])) { end++; nextEnd++; }
  return { start, end, text: after.slice(start, nextEnd) };
}
module.exports = { textChange };
