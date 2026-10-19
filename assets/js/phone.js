// Phone mask helpers for the request form (TZ20 §9): Belarusian numbers only, shown as +375 (29) 123-45-67.
// Pure functions on digit strings ('375' + up to 9 digits); site.js wires them to the field. Tested by scripts/phone.test.mjs.
(function (root) {
  // Mobile 25 29 33 44 and the regional city codes. Keep in sync with by_phone() in api/lib.php
  var BY_CODES = ['25', '29', '33', '44', '15', '16', '17', '21', '22', '23'];

  // A pasted or autofilled number -> '375…' digits, or null for a foreign one (+7…, +48…)
  function normalize(raw) {
    var s = String(raw).trim(), d = s.replace(/\D/g, '');
    if (d.indexOf('375') === 0) return d.slice(0, 12);
    if (s.charAt(0) === '+' && d) return null;
    d = /^80/.test(d) ? d.slice(2) : d.replace(/^0/, '');
    return ('375' + d).slice(0, 12);
  }
  // No trailing separators, so Backspace at the end always removes a digit
  function format(d) {
    var out = '+375 ';
    if (d.length > 3) out += '(' + d.slice(3, 5);
    if (d.length > 5) out += ') ' + d.slice(5, 8);
    if (d.length > 8) out += '-' + d.slice(8, 10);
    if (d.length > 10) out += '-' + d.slice(10, 12);
    return out;
  }
  // The code is judged once both of its digits are typed
  function codeOk(d) { return d.length < 5 || BY_CODES.indexOf(d.slice(3, 5)) !== -1; }
  function complete(d) { return d.length === 12 && codeOk(d); }
  // Caret position right after the n-th digit of the formatted text (never inside the +375 prefix)
  function caretAt(text, n) {
    if (n <= 3) return 5;
    for (var i = 0, k = 0; i < text.length; i++) if (/\d/.test(text.charAt(i)) && ++k === n) return i + 1;
    return text.length;
  }

  // Which contact the form asks for (TZ21 §1): the channel decides; «Нет номера» counts only for Telegram.
  // Keep in sync with the $kind rule in api/request.php
  function contactKind(channel, noPhone) {
    return channel === 'instagram' ? 'ig' : channel === 'telegram' && noPhone ? 'tg' : 'phone';
  }

  root.byPhone = { CODES: BY_CODES, normalize: normalize, format: format, codeOk: codeOk, complete: complete, caretAt: caretAt, contactKind: contactKind };
})(this);
