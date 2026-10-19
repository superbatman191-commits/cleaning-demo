// Inline month grid over the request form's native date input (project/16, part 1; strip dropped 2026-10-11).
// Without JS the native <input type="date"> stays and the form works as before. The picker writes
// YYYY-MM-DD into that input and fires input/change, so site.js updates the free times.
(function () {
  var input = document.querySelector('#request-form [data-date-min]');
  if (!input || !window.Intl) return;

  var MAX_DAYS = 90;
  var fmt = function (o) { return new Intl.DateTimeFormat('ru-RU', o); };
  var fMonth = fmt({ month: 'long' }), fWdShort = fmt({ weekday: 'short' }), fWdLong = fmt({ weekday: 'long' });
  var fDayMonth = fmt({ day: 'numeric', month: 'long' });
  var cap = function (s) { return s.charAt(0).toUpperCase() + s.slice(1); };
  var pad = function (n) { return ('0' + n).slice(-2); };
  var iso = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var ym = function (d) { return iso(d).slice(0, 7); };
  var parse = function (s) { var p = /^(\d{4})-(\d\d)-(\d\d)$/.exec(s); return p ? new Date(+p[1], p[2] - 1, +p[3]) : null; };
  var addDays = function (d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); };
  var dayName = function (d) { return fDayMonth.format(d) + ', ' + fWdLong.format(d); }; // «14 октября, среда»

  var now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var first = addDays(today, 1), last = addDays(today, MAX_DAYS);

  // Busy days from api/busy.php?month=, one request per month, kept for the page's life; on failure no marks
  var full = {}, asked = {};
  function loadMonth(d) {
    var m = ym(d);
    if (asked[m]) return;
    asked[m] = true;
    fetch('/api/busy.php?month=' + m, { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : { full: [] }; })
      .then(function (res) { (res.full || []).forEach(function (s) { full[s] = true; }); render(); })
      .catch(function () { /* no marks; request.php still checks */ });
  }
  // null = can be picked, otherwise why not
  function off(d) {
    if (d < first || d > last) return 'out';
    return full[iso(d)] ? 'full' : null;
  }

  // --- Markup
  var root = document.createElement('div');
  root.className = 'dp';
  root.innerHTML =
    '<div class="dp__head">' +
      '<button type="button" class="dp__step" data-step="-1" aria-label="Предыдущий месяц">‹</button>' +
      '<h3 class="dp__title" id="dp-title" aria-live="polite"></h3>' +
      '<button type="button" class="dp__step" data-step="1" aria-label="Следующий месяц">›</button>' +
    '</div>' +
    '<table class="dp__grid" role="grid" aria-labelledby="dp-title"></table>' +
    '<button type="button" class="dp__picked" hidden></button>';
  var q = function (s) { return root.querySelector(s); };
  var grid = q('.dp__grid'), title = q('.dp__title'), picked = q('.dp__picked');
  var desc = input.getAttribute('aria-describedby');
  if (desc) grid.setAttribute('aria-describedby', desc);

  // The native input stays in the form (it is what gets sent) but is hidden; site.js may focus it on an error
  var slot = input.closest('.slot-pick') || input;
  slot.before(root);
  input.classList.add('sr-only');
  input.tabIndex = -1;
  input.setAttribute('aria-hidden', 'true');
  input.addEventListener('focus', focusCell);

  function pick(d) {
    input.value = d ? iso(d) : '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    render();
  }

  var shown, focusDay; // first day of the shown month; the day that holds focus in the grid
  function render() {
    title.textContent = cap(fMonth.format(shown)) + ' ' + shown.getFullYear();
    q('[data-step="-1"]').disabled = ym(shown) <= ym(today);
    q('[data-step="1"]').disabled = ym(shown) >= ym(last);
    var head = '<tr>' + [0, 1, 2, 3, 4, 5, 6].map(function (i) {
      var d = addDays(new Date(2024, 0, 1), i); // 1 Jan 2024 is a Monday
      return '<th role="columnheader" abbr="' + fWdLong.format(d) + '"><span aria-hidden="true">' + cap(fWdShort.format(d)) + '</span><span class="sr-only">' + fWdLong.format(d) + '</span></th>';
    }).join('') + '</tr>';
    var start = addDays(shown, -((shown.getDay() + 6) % 7)), rows = '';
    for (var w = 0; w < 6; w++) {
      var d0 = addDays(start, w * 7);
      if (w && d0.getMonth() !== shown.getMonth()) break;
      if (addDays(d0, 6) < today) continue; // past weeks are not drawn (TZ20 §1.3); the current week stays whole
      rows += '<tr>';
      for (var i = 0; i < 7; i++) {
        var d = addDays(d0, i);
        if (d.getMonth() !== shown.getMonth()) { rows += '<td role="gridcell"></td>'; continue; }
        var why = off(d), s = iso(d);
        rows += '<td role="gridcell"><button type="button" class="dp__cell' + (s === iso(today) ? ' dp__cell--today' : '') +
          (why === 'full' ? ' dp__cell--full' : '') + '" data-date="' + s + '" tabindex="' + (s === iso(focusDay) ? 0 : -1) + '"' +
          ' aria-pressed="' + (s === input.value) + '"' + (why ? ' aria-disabled="true"' : '') +
          (s === iso(today) ? ' aria-current="date"' : '') +
          ' aria-label="' + dayName(d) + (why === 'full' ? ', мест нет' : '') + '"' + (why === 'full' ? ' title="Мест нет"' : '') + '>' +
          d.getDate() + '</button></td>';
      }
      rows += '</tr>';
    }
    var hadFocus = grid.contains(document.activeElement);
    grid.innerHTML = '<thead>' + head + '</thead><tbody>' + rows + '</tbody>';
    if (hadFocus) focusCell();
    // A picked day folds the grid into one line (TZ20 §1.4); a full day stays folded with its error below
    var value = parse(input.value), folded = !!value && off(value) !== 'out';
    var name = folded ? cap(fWdLong.format(value)) + ', ' + fDayMonth.format(value) : '';
    root.classList.toggle('dp--picked', folded);
    picked.hidden = !folded;
    picked.innerHTML = folded ? name + ' <span class="dp__change">изменить</span>' : '';
    picked.setAttribute('aria-label', 'Выбрано: ' + name.toLowerCase() + '. Нажмите, чтобы выбрать другую дату');
    if (folded && hadFocus) picked.focus();
  }
  function focusCell() { var b = grid.querySelector('[data-date="' + iso(focusDay) + '"]'); if (b) b.focus(); }
  function moveTo(d, focus) {
    focusDay = d < first ? first : d > last ? last : d;
    shown = new Date(focusDay.getFullYear(), focusDay.getMonth(), 1);
    loadMonth(shown);
    render();
    if (focus) focusCell();
  }
  // The folded line clears the day (and site.js the time) and opens the grid on that day
  picked.addEventListener('click', function () {
    var was = parse(input.value);
    if (was) { focusDay = was; shown = new Date(was.getFullYear(), was.getMonth(), 1); }
    pick(null);
    focusCell();
  });
  root.addEventListener('click', function (e) {
    var st = e.target.closest('[data-step]');
    if (st && !st.disabled) {
      var m = new Date(shown.getFullYear(), shown.getMonth() + +st.dataset.step, 1);
      // Keep focus on the arrow; the focus day moves to the new month's first pickable day
      moveTo(m < first ? first : m, false);
      return;
    }
    var c = e.target.closest('.dp__cell');
    if (!c || c.getAttribute('aria-disabled')) return;
    focusDay = parse(c.dataset.date);
    // A second tap clears the day: the field is optional
    pick(c.dataset.date === input.value ? null : focusDay);
  });
  grid.addEventListener('keydown', function (e) {
    var c = e.target.closest('.dp__cell');
    if (!c) return;
    var step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7 }[e.key];
    if (step) { e.preventDefault(); moveTo(addDays(parse(c.dataset.date), step), true); }
  });

  moveTo(parse(input.value) || first, false);
})();
