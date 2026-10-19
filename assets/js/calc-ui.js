// Calculator UI: reads the form, runs calculator.js on prices.json, renders the "sponge".
import { calculate } from './calculator.js';

const P = JSON.parse(document.getElementById('prices-data').textContent);
const root = document.querySelector('[data-calc]');
const form = root.querySelector('form');
const out = (k) => root.querySelector(`[data-out="${k}"]`);
const fmt = (n) => (Math.round(n * 100) / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' руб.';
let used = false;
let lastText = '';
let calcText = '';
const rf = document.getElementById('request-form');
const dlg = document.querySelector('[data-send-dlg]');
const holidays = (root.dataset.holidays || '').split(' ');
// No «Когда» field: the Sunday/holiday surcharge follows the day picked in the request form (18 §1.5)
function when() {
  const d = rf && rf.elements.date.value;
  return d && (new Date(d + 'T12:00').getDay() === 0 || holidays.includes(d)) ? 'sunday' : 'normal';
}

// The launch discount disappears after launchUntil
const launch = form.querySelector('option[value="LAUNCH"]');
if (launch && new Date() > new Date(launch.dataset.until + 'T23:59:59')) launch.remove();

function read() {
  const f = form.elements;
  const extras = {};
  form.querySelectorAll('[data-extra]').forEach((c) => { if (c.checked) extras[c.dataset.extra] = 1; });
  form.querySelectorAll('input[name^="EXTRA_"], input[name^="UPH_"]').forEach((i) => { extras[i.name] = Number(i.value) || 0; });
  return {
    type: f.type.value,
    area: f.area.value,
    sashes: f.sashes.value,
    balconySashes: f.balcony.value,
    heavy: f.heavy.checked,
    zone: f.zone.value,
    when: when(),
    discount: f.discount.value || null,
    extras,
  };
}

function render() {
  const input = read();
  // Controls that do not apply to the chosen type are hidden
  root.querySelectorAll('[data-only]').forEach((el) => { el.hidden = !el.dataset.only.split(' ').includes(input.type); });
  const r = calculate(P, input);
  out('what').textContent = r.what;
  out('total').textContent = '≈ ' + r.total.toLocaleString('ru-RU');
  // Feedback (TZ19 §3.5): the total flashes on every change; breakdown rows that come or go fade, kept rows stay put
  const first = !render.done;
  render.done = true;
  const tot = out('total').parentNode;
  if (!first) { tot.classList.remove('is-pulse'); void tot.offsetWidth; tot.classList.add('is-pulse'); }
  const dl = out('rows'), kept = new Map();
  dl.querySelectorAll('dt:not(.row-out)').forEach((dt) => kept.set(dt.textContent, dt));
  let prev = null;
  for (const row of r.rows) {
    let dt = kept.get(row.label), dd;
    if (dt) { kept.delete(row.label); dd = dt.nextElementSibling; }
    else {
      dt = document.createElement('dt'); dt.textContent = row.label; dd = document.createElement('dd');
      if (!first) dt.className = dd.className = 'row-in';
    }
    dd.textContent = (row.amount < 0 ? '−' : '') + fmt(Math.abs(row.amount));
    if ((prev ? prev.nextElementSibling : dl.firstElementChild) !== dt) { if (prev) prev.after(dt, dd); else dl.prepend(dt, dd); }
    prev = dd;
  }
  kept.forEach((dt) => {
    const dd = dt.nextElementSibling;
    dt.className = dd.className = 'row-out';
    setTimeout(() => { dt.remove(); dd.remove(); }, 220);
  });
  out('notes').innerHTML = '';
  for (const n of r.notes) { const li = document.createElement('li'); li.textContent = n; out('notes').append(li); }
  lastText = `Здравствуйте! Мой расчёт на сайте: ${r.what}` +
    (input.sashes > 0 ? `, ${input.sashes} створок` : '') +
    r.rows.filter((x) => x.key).map((x) => `, ${x.label.toLowerCase()}`).join('') +
    `. Итого ≈ ${r.total} руб.`;
  // Full breakdown for the request form (goes to the master's Telegram)
  const opt = (sel) => sel.selectedOptions[0].textContent.trim().replace(/\s*\([^)]*\)$/, '');
  calcText = [
    r.what[0].toUpperCase() + r.what.slice(1) + (input.heavy && r.base ? ', сильное загрязнение' : ''),
    `Где: ${opt(form.zone)}.`,
    ...(input.discount ? [`Скидка: ${opt(form.discount)}.`] : []),
    ...r.rows.map((x) => `— ${x.label}: ${(x.amount < 0 ? '−' : '') + fmt(Math.abs(x.amount))}`),
    ...r.notes,
    `Итого ≈ ${r.total} руб.`,
  ].join('\n');
  if (used) attach();
  if (dlg) summary(r, opt(form.zone).split(':')[0]);
}

// The card in the request dialog, drawn from the same rows as the sponge (18 §1.3)
function summary(r, zone) {
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
  const head = el('p', 'send-sum__head');
  const edit = el('button', 'send-sum__edit', 'Изменить');
  edit.type = 'button';
  edit.addEventListener('click', () => { dlg.close(); root.scrollIntoView({ behavior: 'smooth' }); });
  head.append(el('b', '', (r.what[0].toUpperCase() + r.what.slice(1).replace(', ', ' · ') + ' · ' + zone).replace(' м²', ' м²')), edit);
  const dl = el('dl');
  for (const row of r.rows) dl.append(el('dt', '', row.label), el('dd', '', (row.amount < 0 ? '−' : '') + fmt(Math.abs(row.amount))));
  const total = el('p', 'send-sum__total', 'Предварительно ');
  total.append(el('b', '', '≈ ' + r.total.toLocaleString('ru-RU') + ' руб.'));
  dlg.querySelector('[data-send-calc]').replaceChildren(head, dl, ...r.notes.map((n) => el('p', 'hint', n)), total);
}

// Put the breakdown into the request form, so it is sent with the request
function attach() {
  if (!rf) return;
  rf.elements.calc.value = calcText;
  const note = rf.querySelector('[data-calc-attached]');
  note.textContent = `К заявке приложен ваш расчёт: ${calcText.slice(calcText.lastIndexOf('\n') + 1)}`;
  note.hidden = false;
}

form.addEventListener('input', () => { if (!used) { used = true; window.goal && window.goal('calc_used'); } render(); });
form.addEventListener('change', render);
root.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
  const inp = document.getElementById(b.dataset.step);
  const v = (Number(inp.value) || 0) + Number(b.dataset.d);
  inp.value = Math.min(Number(inp.max), Math.max(Number(inp.min), v));
  form.dispatchEvent(new Event('input'));
}));
// TZ22 §8: the master takes objects up to 300 m²; say so instead of a silent clamp
const areaHint = document.getElementById('area-hint');
const areaMax = () => { if (areaHint) areaHint.hidden = !(Number(form.area.value) > 300); };
form.area.addEventListener('input', areaMax);
form.area.addEventListener('blur', () => { const big = Number(form.area.value) > 300; form.area.value = Math.min(300, Math.max(10, Number(form.area.value) || 50)); render(); if (areaHint) areaHint.hidden = !big; });

// «Отправить расчёт мастеру»: attach the breakdown and open the request form in a dialog
// over the calculator (no jump down the page). The form is moved in and put back on close.
const home = rf && document.createComment('request-form');
if (rf) rf.before(home);
const submitBtn = rf && rf.querySelector('button[type=submit]');
const submitText = submitBtn && submitBtn.textContent;
root.querySelector('[data-calc-send]').addEventListener('click', (e) => {
  used = true;
  attach();
  if (!rf || !dlg.showModal) return; // no form or old browser: follow the #zayavka link
  e.preventDefault();
  dlg.querySelector('[data-send-slot]').append(rf);
  rf.querySelector('[data-calc-attached]').hidden = true; // the breakdown is shown above
  submitBtn.textContent = 'Отправить расчёт';
  // «Ваш расчёт» goes down to the comment and takes it in (TZ20 §10.5); put back on close
  if (sum.childElementCount) { what.before(sum); sum.append(what); }
  dlg.showModal();
  // Touch: no keyboard on open, focus the title; mouse: straight to «Имя» (TZ20 §10.1)
  if (matchMedia('(pointer: coarse)').matches) dlg.querySelector('#sd-h').focus({ preventScroll: true });
  else rf.elements.name.focus({ preventScroll: true });
});
const sum = dlg && dlg.querySelector('[data-send-calc]');
const what = rf && rf.elements.what.closest('.field');
const whatHome = what && document.createComment('what');
if (what) what.before(whatHome);
// The keyboard shrinks the viewport: keep the focused field in sight (TZ20 §10.2)
if (dlg && window.visualViewport) visualViewport.addEventListener('resize', () => {
  const f = document.activeElement;
  if (dlg.open && f && f !== dlg && dlg.contains(f) && f.matches('input, textarea, select')) f.scrollIntoView({ block: 'center' });
});
if (dlg) {
  // closeSheet (site.js) plays the leaving animation first
  const close = () => (window.closeSheet ? window.closeSheet(dlg) : dlg.close());
  dlg.querySelector('[data-send-close]').addEventListener('click', close);
  // Backdrop only: press and release both outside the card (selecting text and releasing outside must not close it)
  const outside = (e) => { const b = dlg.getBoundingClientRect(); return e.target === dlg && (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom); };
  let downOut = false;
  dlg.addEventListener('pointerdown', (e) => { downOut = outside(e); });
  dlg.addEventListener('click', (e) => { if (downOut && outside(e)) close(); downOut = false; });
  dlg.addEventListener('close', () => {
    home.after(rf);
    whatHome.after(what);
    dlg.querySelector('[data-send-slot]').before(sum);
    submitBtn.textContent = submitText;
    rf.querySelector('[data-calc-attached]').hidden = false;
  });
}
// «Обсудить в Telegram»: a plain t.me link cannot prefill a chat, so copy the text for pasting
const copyBtn = root.querySelector('[data-calc-copy]');
copyBtn.addEventListener('click', () => {
  if (!navigator.clipboard) return;
  navigator.clipboard.writeText(lastText).then(() => { out('copied').hidden = false; }).catch(() => {});
});

if (rf) rf.elements.date.addEventListener('change', render);
// Calculation links already sent (18 §4 S2, the share button was removed in TZ20 §12.3): #calc=type:GENERAL,area:65,EXTRA_OVEN:1,...
// still open a filled calculator. Unknown keys and values that no longer exist are skipped.
const fields = () => [...form.querySelectorAll('input[name], select[name], [data-extra]')].map((el) => [el.name || el.dataset.extra, el]);
const m = location.hash.match(/^#calc=([\w.:,-]*)$/);
if (m) {
  const all = fields();
  for (const pair of m[1].split(',')) {
    const [k, v] = pair.split(':');
    for (const [key, el] of all) {
      if (key !== k) continue;
      if (el.type === 'radio') { if (el.value === v) el.checked = true; }
      else if (el.type === 'checkbox') el.checked = v === '1';
      else if (el.tagName === 'SELECT') { if ([...el.options].some((o) => o.value === v)) el.value = v; }
      else if (Number.isFinite(Number(v))) el.value = Math.min(Number(el.max), Math.max(Number(el.min), Number(v)));
    }
  }
  used = true;
  addEventListener('load', () => root.scrollIntoView()); // after images, or the page shifts
}
out('rows').addEventListener('animationend', (e) => e.target.classList.remove('row-in'));
render();
