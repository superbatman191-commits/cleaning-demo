// Formatting helpers shared by templates and scripts. NBSP keeps numbers and units together.
export const NBSP = ' ';

// 2.8 -> "2,8"; 1500 -> "1 500"
export function num(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) throw new Error(`num: not a number: ${x}`);
  const [int, frac] = String(Math.round(n * 1000) / 1000).split('.');
  const grouped = int.length > 4 ? int.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP) : int;
  return frac ? `${grouped},${frac}` : grouped;
}

export const rub = (x) => `${num(x)}${NBSP}руб.`;
export const pct = (x) => `${num(x)}${NBSP}%`;

// rate × area, rounded up to whole rubles (kopeck-rounded first: 2.8 × 50 = 140)
export const mul = (rate, area) => Math.ceil(Math.round(Number(rate) * Number(area) * 100) / 100);

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
// "2026-11-30" -> "30 ноября" (no year), or with year when asked
export function ruDate(iso, withYear = false) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return `${d.getUTCDate()}${NBSP}${MONTHS[d.getUTCMonth()]}${withYear ? ` ${d.getUTCFullYear()}${NBSP}г.` : ''}`;
}
