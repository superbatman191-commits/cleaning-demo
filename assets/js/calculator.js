// Price calculator: project/10-price-list.md §11, steps 1–12.
// One module for the browser and for scripts/check-floors.mjs. No price numbers here:
// every value comes from prices.json (rows of 10-price-list.md).

export const TYPES = ['MAINT', 'GENERAL', 'RENOV', 'WINDOWS', 'STR'];
export const DISCOUNTS = ['REG_FREQUENT', 'REG_MONTHLY', 'REFERRAL', 'LAUNCH'];
const TYPE_NAMES = { MAINT: 'поддерживающая', GENERAL: 'генеральная', RENOV: 'после ремонта', WINDOWS: 'только окна', STR: 'посуточная квартира' };

// Money is rounded to kopecks before ceil so 2.8 × 50 gives 140, not 141.
const kop = (x) => Math.round(x * 100) / 100;
const ceilRub = (x) => Math.ceil(kop(x));

export function workDays(P, type, area) {
  const v = (k) => P[k].value;
  if (type === 'GENERAL') return area > v('GEN_DAY_MAX_AREA') ? 2 : 1;
  if (type === 'RENOV') return area > v('RENOV_3DAY_MAX_AREA') ? 3 : area > v('RENOV_DAY_MAX_AREA') ? 2 : 1;
  return 1;
}

// FLOOR_<TYPE>_A = FIX + PER_M2 × A + FLOOR_EXTRA_DAY × (days − 1)
export function floorFor(P, type, area) {
  const v = (k) => P[k].value;
  return v(`FLOOR_${type}_A_FIX`) + v(`FLOOR_${type}_A_PER_M2`) * area + v('FLOOR_EXTRA_DAY') * (workDays(P, type, area) - 1);
}

/**
 * @param P prices.json object ({KEY: {value}})
 * @param o { type, area, heavy, sashes, balconySashes, extras: {EXTRA_*|UPH_*: qty}, zone: 0..3, when: 'normal'|'sunday'|'urgent', discount: null|DISCOUNTS[i] }
 */
export function calculate(P, o) {
  const v = (k) => {
    if (!P[k]) throw new Error(`calculator: missing price key ${k}`);
    return P[k].value;
  };
  const type = TYPES.includes(o.type) ? o.type : 'MAINT';
  const area = Math.min(300, Math.max(10, Math.round(Number(o.area) || 0)));
  const sashes = Math.max(0, Math.round(Number(o.sashes) || 0));
  const balcony = Math.max(0, Math.round(Number(o.balconySashes) || 0));
  const extras = o.extras || {};
  const rows = [];
  const notes = [];
  let base = 0;

  // 1–2, 12. Cleaning
  if (type === 'STR') {
    if (area <= 40) base = v('STR_TURNOVER_1');
    else if (area <= 60) base = v('STR_TURNOVER_2');
    else base = Math.max(v('MAINT_RATE') * area, v('MAINT_MIN')) + v('STR_LINEN');
    rows.push({ label: `Уборка между гостями, ${area} м²`, amount: base });
  } else if (type !== 'WINDOWS') {
    base = Math.max(v(`${type}_RATE`) * area, v(`${type}_MIN`));
    rows.push({ label: `Уборка, ${area} м²`, amount: base });
    if (o.heavy) {
      const h = base * v('HEAVY_SOIL') / 100;
      rows.push({ label: 'Сильное загрязнение', amount: h });
      base += h;
    }
  }

  // 4. Extras (EXTRA_* and UPH_*), computed before windows to know whether windows are the only order
  let extraSum = 0, uphSum = 0;
  for (const [k, qRaw] of Object.entries(extras)) {
    const q = Math.max(0, Math.round(Number(qRaw) || 0));
    if (!q || !/^(EXTRA|UPH)_/.test(k) || k === 'UPH_MIN') continue;
    const a = v(k) * q;
    if (k.startsWith('UPH_')) uphSum += a; else extraSum += a;
    rows.push({ label: P[k].label + (q > 1 ? ` × ${q}` : ''), amount: a, key: k });
  }

  // 3. Windows
  let windows = v('WINDOW_SASH') * sashes + v('BALCONY_SASH') * balcony;
  if (windows > 0) {
    // ponytail: WINDOW_MIN applies whenever there is no cleaning (base = 0), also with extras — protects FLOOR_TRIP
    if (base === 0 && windows < v('WINDOW_MIN')) {
      notes.push(`Минимальный заказ только окон — ${v('WINDOW_MIN')} руб.`);
      windows = v('WINDOW_MIN');
    }
    rows.push({ label: `Окна, ${sashes + balcony} ${plural(sashes + balcony, 'створка', 'створки', 'створок')}`, amount: windows });
  }
  if (base === 0 && windows === 0 && extraSum === 0 && uphSum > 0 && uphSum < v('UPH_MIN')) {
    rows.push({ label: 'До минимального заказа химчистки', amount: v('UPH_MIN') - uphSum });
    uphSum = v('UPH_MIN');
  }

  // 5. Services
  let services = base + windows + extraSum + uphSum;

  // 6. Surcharges
  if (o.when === 'urgent' || o.when === 'sunday') {
    const key = o.when === 'urgent' ? 'URGENT' : 'SUNDAY';
    const s = services * v(key) / 100;
    rows.push({ label: (key === 'URGENT' ? 'Срочно, сегодня' : 'Воскресенье или праздник') + `, +${v(key)} %`, amount: s });
    services += s;
  }

  // 7. Minimum order in zones 2–3 (before discount)
  const zone = [0, 1, 2, 3].includes(Number(o.zone)) ? Number(o.zone) : 0;
  if (zone >= 2 && services > 0 && services < v('ZONE_MIN_ORDER')) {
    rows.push({ label: 'До минимального заказа в зоне выезда', amount: v('ZONE_MIN_ORDER') - services });
    services = v('ZONE_MIN_ORDER');
  }

  // 8. One discount, on base only, clamped to the floor
  let discount = 0;
  const canDiscount = ['MAINT', 'GENERAL', 'RENOV'].includes(type);
  if (o.discount && DISCOUNTS.includes(o.discount)) {
    if (!canDiscount) notes.push('Скидки не действуют на окна отдельно и на уборку между гостями.');
    else if (base < v('DISCOUNT_THRESHOLD')) notes.push(`Скидка действует, если стоимость уборки — от ${v('DISCOUNT_THRESHOLD')} руб.`);
    else {
      discount = base * v(o.discount) / 100;
      const floor = floorFor(P, type, area);
      if (base - discount < floor) discount = Math.max(0, base - floor);
      rows.push({ label: `Скидка ${v(o.discount)} %` + (kop(discount) < kop(base * v(o.discount) / 100) ? ' (урезана для большого объёма)' : ''), amount: -discount });
      services -= discount;
    }
  }

  // 9. Travel
  if (zone > 0) {
    rows.push({ label: 'Выезд за пределы Бреста', amount: v(`ZONE_${zone}`) });
    services += v(`ZONE_${zone}`);
  }

  // 10–11. Rounding and notes
  const total = ceilRub(services);
  const days = canDiscount ? workDays(P, type, area) : 1;
  if (days > 1) notes.push(`Такой объём мастер делает за ${days} дня подряд.`);

  const what = type === 'WINDOWS' ? TYPE_NAMES.WINDOWS : `${TYPE_NAMES[type]}, ${area} м²`;
  return { total, base, discount, services, days, rows, notes, what, type, area };
}

export function plural(n, one, few, many) {
  const n10 = n % 10, n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return few;
  return many;
}
