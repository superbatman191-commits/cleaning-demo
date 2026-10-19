// 03 §6.4: no price path of the calculator may go below the floor of 10-price-list.md §10.
// Shared by scripts/check-floors.mjs (build) and the admin panel (before saving prices).
import { calculate, floorFor, DISCOUNTS } from './calculator.js';

// Returns a list of failure messages (empty = all price paths >= floor); at most 20 are kept, the count is exact
export function checkFloors(P) {
  const v = (k) => P[k].value;
  const fails = [];
  let count = 0;
  const assert = (ok, msg) => { if (!ok && count++ < 20) fails.push(msg); };
  const EPS = 1e-9;

  // Cleaning types: every area, every discount, both heavy-soil states
  for (const type of ['MAINT', 'GENERAL', 'RENOV']) {
    for (let area = 10; area <= 300; area++) {
      const floor = floorFor(P, type, area);
      for (const heavy of [false, true]) {
        for (const discount of [null, ...DISCOUNTS]) {
          const r = calculate(P, { type, area, heavy, discount });
          assert(r.base - r.discount >= floor - EPS, `${type} ${area} m² heavy=${heavy} ${discount}: ${(r.base - r.discount).toFixed(2)} < floor ${floor.toFixed(2)}`);
        }
      }
    }
  }

  // Windows only, n = 1..40
  for (let n = 1; n <= 40; n++) {
    const r = calculate(P, { type: 'WINDOWS', sashes: n });
    const floor = v('FLOOR_TRIP') + v('FLOOR_WINDOW_SASH') * n;
    assert(r.total >= floor - EPS, `windows only n=${n}: ${r.total} < ${floor.toFixed(2)}`);
  }

  // Upholstery only: every combination of 0..2 of each item
  const items = Object.keys(P).filter((k) => /^UPH_/.test(k) && k !== 'UPH_MIN');
  for (const k of items) assert(P[`FLOOR_${k}`], `no floor row FLOOR_${k}`);
  const combos = (i, acc) => {
    if (i === items.length) {
      if (!Object.values(acc).some(Boolean)) return;
      const r = calculate(P, { type: 'WINDOWS', extras: acc });
      const floor = v('FLOOR_TRIP') + Object.entries(acc).reduce((s, [k, q]) => s + v(`FLOOR_${k}`) * q, 0);
      assert(r.total >= floor - EPS, `upholstery only ${JSON.stringify(acc)}: ${r.total} < ${floor.toFixed(2)}`);
      return;
    }
    for (let q = 0; q <= 2; q++) combos(i + 1, { ...acc, [items[i]]: q });
  };
  combos(0, {});

  // Short-term rental
  assert(v('STR_TURNOVER_1') >= v('FLOOR_STR_1'), 'STR_TURNOVER_1 < FLOOR_STR_1');
  assert(v('STR_TURNOVER_2') >= v('FLOOR_STR_2'), 'STR_TURNOVER_2 < FLOOR_STR_2');
  for (let area = 61; area <= 300; area++) {
    const r = calculate(P, { type: 'STR', area });
    const floor = floorFor(P, 'MAINT', area) + 0.5 * v('FLOOR_HOUR');
    assert(r.base >= floor - EPS, `STR ${area} m²: ${r.base.toFixed(2)} < ${floor.toFixed(2)}`);
  }

  // Single-item rates against their own floors
  assert(v('EXTRA_HOUR') >= v('FLOOR_HOUR'), 'EXTRA_HOUR < FLOOR_HOUR');
  assert(v('WINDOW_SASH') >= v('FLOOR_WINDOW_SASH') && v('BALCONY_SASH') >= v('FLOOR_WINDOW_SASH'), 'sash price < FLOOR_WINDOW_SASH');

  fails.count = count;
  return fails;
}
