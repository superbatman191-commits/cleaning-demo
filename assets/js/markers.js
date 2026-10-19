// Price markers: the template build (PRICE_TEMPLATES=1) writes ⟦expr⟧ wherever a page shows a price.
// expr = "op~op~source": source is a price key or "calc:<base64url JSON>" (calculator total);
// ops apply right to left, e.g. "rub~mul:50~MAINT_RATE" = rub(mul(MAINT_RATE, 50)).
// The admin panel evaluates every marker with the new prices; PHP only pastes the resulting strings.
import { num, rub, pct, mul } from './filters.js';
import { calculate } from './calculator.js';

export const MARKER = /⟦([^⟦⟧]+)⟧/g;
// sp: NBSP -> space (text that went through striptags)
const OPS = { num, rub, pct, mul, sp: (x) => String(x).replace(/ /g, ' ') };

const b64 = (s) => (typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(s))) : Buffer.from(s).toString('base64'))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s) => {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  return typeof atob === 'function' ? decodeURIComponent(escape(atob(t))) : Buffer.from(t, 'base64').toString();
};

const unwrap = (x) => (typeof x === 'string' && /^⟦[^⟦⟧]+⟧$/.test(x) ? x.slice(1, -1) : null);

// Build side: wrap a filter so that a marker input gives a marker output
export const markerFilter = (name, fn) => (x, ...args) => {
  const inner = unwrap(x);
  return inner === null ? fn(x, ...args) : `⟦${[name, ...args].join(':')}~${inner}⟧`;
};
export const keyMarker = (key) => `⟦${key}⟧`;
export const calcMarker = (o) => `⟦calc:${b64(JSON.stringify(o))}⟧`;

export function evalMarker(expr, P) {
  const parts = expr.split('~');
  const src = parts.pop();
  let v;
  if (src.startsWith('calc:')) v = calculate(P, JSON.parse(unb64(src.slice(5)))).total;
  else if (P[src]) v = P[src].value;
  else throw new Error(`unknown price key ${src}`);
  for (const op of parts.reverse()) {
    const [name, ...args] = op.split(':');
    if (!OPS[name]) throw new Error(`unknown op ${name}`);
    v = OPS[name](v, ...args.map(Number));
  }
  return String(v);
}
