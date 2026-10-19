// Site-wide behaviour: menu, hero ticks, cookie consent + Yandex Metrica, goals, request form.
(function () {
  var script = document.currentScript;
  var METRIKA = script && script.getAttribute('data-metrika');
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var store = {
    get: function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };

  // Errors go to the admin journal (/admin/?a=errors) via api/log.php; at most 5 per page view
  var reported = 0;
  function report(message, where) {
    if (!message || reported++ >= 5 || !navigator.sendBeacon) return;
    try { navigator.sendBeacon('/api/log.php', JSON.stringify({ message: String(message).slice(0, 500), url: location.pathname, where: where || '' })); } catch (e) { /* ignore */ }
  }
  window.addEventListener('error', function (e) {
    // "Script error." = a cross-origin script (Metrica) with the details hidden: nothing to act on
    if (e.message && e.message !== 'Script error.') report(e.message, (e.filename || '').split('/').pop() + ':' + e.lineno);
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    // A page transition the browser skipped (hidden tab, open dialog, quick second click, back from cache) rejects
    // with AbortError/InvalidStateError; the page still opens, so this is not an error (TZ20 §15)
    if (r && /^(AbortError|InvalidStateError)$/.test(r.name) && /transition/i.test(r.message)) return;
    report(r && r.message || r);
  });
  // Cross-document view transitions (components.css): quiet the expected rejections, and skip the
  // transition while a dialog is open, or its top-layer snapshot breaks it
  var quiet = function (vt) {
    if (!vt) return;
    ['ready', 'finished', 'updateCallbackDone'].forEach(function (k) { if (vt[k]) vt[k].catch(function () {}); });
  };
  window.addEventListener('pageswap', function (e) {
    quiet(e.viewTransition);
    if (e.viewTransition && document.querySelector('dialog[open]')) e.viewTransition.skipTransition();
  });
  window.addEventListener('pagereveal', function (e) { quiet(e.viewTransition); });

  // Sheets (TZ19 §3.3–3.4): modal dialogs that slide in by CSS and leave with .is-closing; Esc plays the same exit
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.closeSheet = function (dlg) {
    if (!dlg.open || dlg.classList.contains('is-closing')) return;
    dlg.classList.add('is-closing');
    setTimeout(function () {
      dlg.close();
      dlg.classList.remove('is-closing');
      dlg.style.transform = dlg.style.transition = dlg.style.opacity = '';
    }, reduce ? 0 : 290);
  };
  // Touch drag towards the edge closes the sheet: past 30 % of its size or a quick flick, otherwise it springs back.
  // Mouse never drags (Q13). grip limits where a drag may start (the bottom sheet: handle and title only).
  function swipeToClose(dlg, axis, grip, when) {
    var from = null, t0 = 0, d = 0;
    var pos = function (e) { return axis === 'x' ? e.clientX : e.clientY; };
    dlg.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' || (grip && !e.target.closest(grip)) || (when && !when())) return;
      from = pos(e); t0 = e.timeStamp; d = 0;
    });
    dlg.addEventListener('pointermove', function (e) {
      if (from === null) return;
      d = Math.max(0, pos(e) - from);
      dlg.style.transition = 'none';
      dlg.style.transform = axis === 'x' ? 'translateX(' + d + 'px)' : 'translateY(' + d + 'px)';
      if (axis === 'x') dlg.style.opacity = String(1 - Math.min(d / dlg.offsetWidth, 1) * 0.6);
    });
    var end = function (e) {
      if (from === null) return;
      from = null;
      var size = axis === 'x' ? dlg.offsetWidth : dlg.offsetHeight;
      var flick = d > 24 && d / (e.timeStamp - t0) > 0.6;
      if (e.type === 'pointerup' && (d > size * 0.3 || flick)) window.closeSheet(dlg);
      else dlg.style.transform = dlg.style.transition = dlg.style.opacity = '';
    };
    dlg.addEventListener('pointerup', end);
    dlg.addEventListener('pointercancel', end);
  }
  // Every sheet: Esc and a click on the backdrop (press and release outside the box) play the exit
  $$('dialog.menu, dialog.send-dlg').forEach(function (dlg) {
    dlg.addEventListener('cancel', function (e) { e.preventDefault(); window.closeSheet(dlg); });
  });

  // Burger menu: side sheet from the right
  var burger = $('.burger'), menu = $('#menu');
  if (burger && menu && menu.showModal) {
    var setBurger = function (open) {
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
    };
    var sub = $('.menu__sub', menu);
    burger.addEventListener('click', function () { if (sub) sub.open = false; menu.showModal(); setBurger(true); });
    menu.addEventListener('close', function () { setBurger(false); burger.focus(); });
    $('.menu__close', menu).addEventListener('click', function () { window.closeSheet(menu); });
    menu.addEventListener('click', function (e) {
      if (e.target === menu) window.closeSheet(menu);
      // A link leaves the page: close at once, the page change carries the rest (TZ20 §5, §15)
      else if (e.target.closest('a')) menu.close();
    });
    swipeToClose(menu, 'x');
  }
  var sendDlg = $('[data-send-dlg]');
  if (sendDlg) swipeToClose(sendDlg, 'y', '.send-dlg__grip, .send-dlg h2', function () { return innerWidth < 760; });

  // Before/after slider (TZ19 §3.6): the range input moves the split
  $$('.ba').forEach(function (ba) {
    var r = $('.ba__range', ba);
    r.addEventListener('input', function () { ba.classList.remove('is-hint'); ba.style.setProperty('--pos', r.value + '%'); });
  });

  // Reviews ribbon dots (TZ19 §3.7): one per card, the most visible card is lit
  $$('[data-rv]').forEach(function (rv) {
    var list = $('.rv__list', rv), cards = $$('.rv__card', rv), dots = $('.rv__dots', rv);
    if (cards.length < 2 || !window.IntersectionObserver) return;
    dots.innerHTML = cards.map(function () { return '<span></span>'; }).join('');
    var spans = $$('span', dots);
    var io = new IntersectionObserver(function (en) {
      en.forEach(function (e) { if (e.isIntersecting) spans.forEach(function (d, i) { d.classList.toggle('is-on', cards[i] === e.target); }); });
    }, { root: list, threshold: 0.6 });
    cards.forEach(function (c) { io.observe(c); });
  });

  // Scroll motion (TZ19 §4): the slider nudges itself once («потяни»), price rows come in one by one,
  // every section rises in once, the reviews ribbon turns itself. Never with reduced motion.
  if (!reduce && window.IntersectionObserver) {
    $$('.offer__list').forEach(function (l) { $$('li', l).forEach(function (li, i) { li.style.setProperty('--i', i); }); });
    var sections = $$('main > section');
    // What is already on screen stays as it is: no flash of the first screen
    sections.forEach(function (el) { if (el.getBoundingClientRect().top < innerHeight) el.classList.add('is-in'); });
    document.documentElement.classList.add('reveal-on');
    var once = new IntersectionObserver(function (en) {
      en.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-in'); once.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -10% 0px' });
    $$('.offer__list').concat(sections.filter(function (el) { return !el.classList.contains('is-in'); })).forEach(function (el) { once.observe(el); });
    var nudge = new IntersectionObserver(function (en) {
      en.forEach(function (e) {
        if (!e.isIntersecting) return;
        nudge.unobserve(e.target);
        var ba = e.target;
        ba.classList.add('is-hint');
        [[0, 36], [650, 62], [1300, 50]].forEach(function (s) {
          setTimeout(function () { if (ba.classList.contains('is-hint')) ba.style.setProperty('--pos', s[1] + '%'); }, s[0]);
        });
        setTimeout(function () { ba.classList.remove('is-hint'); }, 2000);
      });
    }, { threshold: 0.6 });
    $$('.ba').forEach(function (ba) { nudge.observe(ba); });
  }
  // The ribbon turns every 6.5 s while on screen; any touch, hover or focus stops it for good
  if (!reduce && window.IntersectionObserver) $$('.rv__list').forEach(function (list) {
    var timer = null, stopped = false;
    var stop = function () { stopped = true; clearInterval(timer); };
    ['pointerdown', 'mouseenter', 'focusin', 'wheel'].forEach(function (t) { list.addEventListener(t, stop, { passive: true }); });
    new IntersectionObserver(function (en) {
      clearInterval(timer);
      if (stopped || !en[0].isIntersecting || list.scrollWidth <= list.clientWidth) return;
      timer = setInterval(function () {
        var end = list.scrollLeft + list.clientWidth >= list.scrollWidth - 4;
        list.scrollBy({ left: end ? -list.scrollWidth : list.firstElementChild.offsetWidth, behavior: 'smooth' });
      }, 6500);
    }).observe(list);
  });

  // Full-screen photos (TZ19 §3.8): buttons, arrow keys and Esc everywhere; on touch swipe left/right to page, down to close
  var lb = $('[data-lb-dlg]');
  if (lb && lb.showModal) {
    var items = $$('[data-lb]'), at = 0;
    var img = $('.lb__img', lb), cap = $('.lb__cap', lb), count = $('.lb__count', lb);
    var show = function (i) {
      at = (i + items.length) % items.length;
      var a = items[at];
      img.src = a.getAttribute('href'); img.alt = a.dataset.alt || '';
      cap.textContent = a.dataset.caption || '';
      count.textContent = (at + 1) + ' из ' + items.length;
    };
    var page = function (dir) {
      if (reduce) return show(at + dir);
      img.style.transition = ''; img.style.opacity = '0'; img.style.transform = 'translateX(' + (-dir * 40) + 'px)';
      setTimeout(function () {
        show(at + dir);
        img.style.transition = 'none'; img.style.transform = 'translateX(' + (dir * 40) + 'px)';
        void img.offsetWidth;
        img.style.transition = ''; img.style.opacity = ''; img.style.transform = '';
      }, 160);
    };
    items.forEach(function (a, i) {
      a.addEventListener('click', function (e) { e.preventDefault(); show(i); lb.showModal(); });
    });
    $('.lb__prev', lb).addEventListener('click', function () { page(-1); });
    $('.lb__next', lb).addEventListener('click', function () { page(1); });
    $('.lb__close', lb).addEventListener('click', function () { window.closeSheet(lb); });
    lb.addEventListener('cancel', function (e) { e.preventDefault(); window.closeSheet(lb); });
    lb.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') page(-1);
      if (e.key === 'ArrowRight') page(1);
    });
    lb.addEventListener('click', function (e) { if (e.target === lb || e.target.classList.contains('lb__fig')) window.closeSheet(lb); });
    // Touch: the first 10 px decide the axis; past 30 % of the screen or a flick pages/closes, otherwise it springs back
    var x0 = null, y0 = 0, t0 = 0, axis = '', dx = 0, dy = 0;
    lb.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' || e.target.closest('button')) return;
      x0 = e.clientX; y0 = e.clientY; t0 = e.timeStamp; axis = ''; dx = dy = 0;
    });
    lb.addEventListener('pointermove', function (e) {
      if (x0 === null) return;
      dx = e.clientX - x0; dy = e.clientY - y0;
      if (!axis && Math.abs(dx) + Math.abs(dy) > 10) axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (axis === 'x') { img.style.transition = 'none'; img.style.transform = 'translateX(' + dx + 'px)'; }
      if (axis === 'y' && dy > 0) { lb.style.transition = 'none'; lb.style.transform = 'translateY(' + dy + 'px)'; }
    });
    var lbEnd = function (e) {
      if (x0 === null) return;
      x0 = null;
      var v = (axis === 'x' ? Math.abs(dx) : dy) / Math.max(1, e.timeStamp - t0);
      var ok = e.type === 'pointerup' && (v > 0.6 || (axis === 'x' ? Math.abs(dx) > innerWidth * 0.3 : dy > innerHeight * 0.3));
      if (axis === 'y' && dy > 24 && ok) return window.closeSheet(lb);
      lb.style.transform = lb.style.transition = '';
      if (axis === 'x' && Math.abs(dx) > 24 && ok) page(dx < 0 ? 1 : -1);
      else { img.style.transition = ''; img.style.transform = ''; }
    };
    lb.addEventListener('pointerup', lbEnd);
    lb.addEventListener('pointercancel', lbEnd);
  }

  // Header band turns into a floating capsule once the page is scrolled ~40 px (TZ19 §3.2a)
  var header = $('.header'), sentinel = $('.top-sentinel');
  if (header && sentinel && window.IntersectionObserver) new IntersectionObserver(function (en) {
    header.classList.toggle('is-island', !en[0].isIntersecting);
  }).observe(sentinel);

  // Dock on phones (TZ21 §12): hidden while the hero buttons (or the H1) are on screen, over the calculator or the
  // request form (its main button points there), and while a text field has the focus (keyboard open)
  var dock = $('.dock');
  if (dock && window.IntersectionObserver) {
    var dockSeen = new Map(), typing = false;
    var dockSync = function () {
      var on = !typing && !Array.from(dockSeen.values()).some(Boolean);
      dock.classList.toggle('is-on', on);
      document.documentElement.classList.toggle('dock-on', on);
    };
    var dockIo = new IntersectionObserver(function (en) {
      en.forEach(function (e) { dockSeen.set(e.target, e.isIntersecting); });
      dockSync();
    });
    [$('main .hero__ctas') || $('main h1'), $('#raschet'), $('#zayavka')].forEach(function (el) { if (el) dockIo.observe(el); });
    document.addEventListener('focusin', function (e) { typing = e.target.matches('input:not([type=checkbox]):not([type=radio]), textarea, select'); dockSync(); });
    document.addEventListener('focusout', function () { typing = false; dockSync(); });
  } else if (dock) dock.classList.add('is-on');

  // Hero checklist ticks itself each time it comes into view and clears once it leaves (TZ21 §7);
  // reduced motion: all ticked at once; no IntersectionObserver: ticks once on load
  $$('[data-ticks]').forEach(function (list) {
    var lis = $$('li', list), timers = [];
    var tick = function () {
      lis.forEach(function (li, i) { timers.push(setTimeout(function () { li.classList.add('done'); }, 700 + i * 420)); });
    };
    if (reduce) return lis.forEach(function (li) { li.classList.add('done'); });
    if (!window.IntersectionObserver) return tick();
    new IntersectionObserver(function (en) {
      var e = en[en.length - 1];
      if (e.isIntersecting && e.intersectionRatio >= 0.35) { if (!timers.length) tick(); }
      else if (!e.isIntersecting) {
        timers.forEach(clearTimeout); timers = [];
        lis.forEach(function (li) { li.classList.remove('done'); });
      }
    }, { threshold: [0, 0.35] }).observe(list);
  });

  // Consent (03 §8.6): Metrica only after «Принять»; choice kept for 6 months
  var SIX_MONTHS = 182 * 24 * 3600 * 1000;
  // Theme switch in the footer (18 part 8): «auto» follows the device; the choice is applied before paint by base.njk
  // The header button (TZ22 §13) cycles auto → light → dark; both controls stay in sync
  var themePick = $('[data-theme-pick]'), themeBtn = $('[data-theme-cycle]');
  var THEME_NAMES = { light: 'светлая', dark: 'тёмная', auto: 'как в телефоне' };
  var THEME_NEXT = { auto: 'light', light: 'dark', dark: 'auto' };
  var themeMetas = $$('meta[name="theme-color"]');
  var showTheme = function (t) {
    if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
    themeMetas.forEach(function (m) {
      if (!m.dataset.media) m.dataset.media = m.media;
      m.media = t === 'auto' ? m.dataset.media : (m.dataset.media.indexOf(t) !== -1 ? 'all' : 'not all');
    });
    $$('[data-theme-set]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.themeSet === t)); });
    if (themeBtn) { themeBtn.setAttribute('aria-label', 'Тема: ' + THEME_NAMES[t] + '. Сменить'); themeBtn.title = 'Тема: ' + THEME_NAMES[t]; }
  };
  var setTheme = function (t) {
    try { if (t === 'auto') localStorage.removeItem('vc-theme'); else localStorage.setItem('vc-theme', t); } catch (err) { /* private mode */ }
    showTheme(t);
  };
  showTheme(document.documentElement.dataset.theme || 'auto');
  if (themePick) themePick.hidden = false;
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-theme-set]');
    if (b) setTheme(b.dataset.themeSet);
    if (e.target.closest('[data-theme-cycle]')) { themeBtn.classList.add('is-turn'); setTheme(THEME_NEXT[document.documentElement.dataset.theme || 'auto']); }
  });

  var consent = store.get('consent');
  if (consent && Date.now() - consent.t > SIX_MONTHS) consent = null;
  var queue = [];
  window.goal = function (name) {
    if (window.ym && METRIKA) window.ym(METRIKA, 'reachGoal', name); else queue.push(name);
  };
  function loadMetrika() {
    if (!METRIKA || window.ym) return;
    (function (m, e, t, r, i, k, a) {
      m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
      m[i].l = 1 * new Date();
      k = e.createElement(t); a = e.getElementsByTagName(t)[0]; k.async = 1; k.src = r; a.parentNode.insertBefore(k, a);
    })(window, document, 'script', 'https://mc.invalid/metrika/tag.js', 'ym');
    window.ym(METRIKA, 'init', { clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: false });
    queue.splice(0).forEach(window.goal);
  }
  // Refusal also clears cookies a counter set earlier (_ym*), on the host and its parent domains
  function dropMetrika() {
    var host = location.hostname.split('.'), doms = [''];
    for (var i = 0; i < host.length - 1; i++) doms.push('; domain=' + host.slice(i).join('.'), '; domain=.' + host.slice(i).join('.'));
    document.cookie.split(';').forEach(function (c) {
      var n = c.split('=')[0].trim();
      if (n.indexOf('_ym') === 0) doms.forEach(function (d) { document.cookie = n + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' + d; });
    });
  }
  var banner = $('#cookie');
  if (consent && consent.v === 'no') dropMetrika();
  if (consent && consent.v === 'yes') loadMetrika();
  else if (!consent && banner) banner.hidden = false;
  $$('[data-consent]').forEach(function (b) {
    b.addEventListener('click', function () {
      var v = b.getAttribute('data-consent');
      store.set('consent', { v: v, t: Date.now() });
      banner.classList.add('is-leaving');
      setTimeout(function () { banner.hidden = true; }, 320);
      if (v === 'yes') loadMetrika(); else dropMetrika();
    });
  });

  // Goals (03 §10.2)
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[data-goal]');
    if (a) window.goal(a.getAttribute('data-goal'));
  });
  if (location.pathname === '/cleaning-demo/ceny/') window.goal('ceny_view');
  if (location.pathname === '/cleaning-demo/spasibo/') window.goal('form_sent');

  // Copy prepared text (calculator / certificate) before opening a messenger
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[data-copy]');
    if (!a || !navigator.clipboard) return;
    navigator.clipboard.writeText(a.getAttribute('data-copy')).then(function () {
      // A button with data-copied says so for 2 s (e-mail on /cleaning-demo/kontakty/)
      var t = a.getAttribute('data-copied'), label = t && a.querySelector('span');
      if (!label) return;
      var was = label.textContent;
      label.textContent = t; a.classList.add('is-done');
      setTimeout(function () { label.textContent = was; a.classList.remove('is-done'); }, 2000);
    }).catch(function () {});
  });

  // «Поделиться» (18 §4): share sheet on a phone, copy the link on a desktop.
  // The URL is data-share-url (calculator sets it) or the page itself.
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-share]');
    if (!b) return;
    var url = b.getAttribute('data-share-url') || location.href.split('#')[0];
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      navigator.share({ title: document.title, url: url }).catch(function () {});
      return;
    }
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(url).then(function () {
      var text = b.textContent;
      b.textContent = 'Ссылка скопирована';
      setTimeout(function () { b.textContent = text; }, 2500);
    }).catch(function () {});
  });

  // UTM tags of the landing visit
  var utm = location.search.match(/utm_[a-z]+=[^&]*/g);
  if (utm) try { sessionStorage.setItem('utm', utm.join('&')); } catch (e) { /* ignore */ }

  // Request form (03 §7)
  var form = $('#request-form');
  if (!form) return;
  var started = Date.now();
  var tel = form.elements.phone, nickToggle = $('[data-nick-toggle]', form), telLabel = $('[data-tel-label]', form);
  var status = $('.form__status', form);
  // Earliest pickable day is tomorrow (local date); the server checks it again
  var tmr = new Date(); tmr.setDate(tmr.getDate() + 1);
  $('[data-date-min]', form).min = tmr.getFullYear() + '-' + ('0' + (tmr.getMonth() + 1)).slice(-2) + '-' + ('0' + tmr.getDate()).slice(-2);

  // A ✓ inside a field once its value is valid (TZ20 §9, TZ21 §2): wraps the input, returns the mark
  function okMark(input) {
    var mark = document.createElement('span');
    mark.className = 'field-ok';
    mark.setAttribute('aria-hidden', 'true');
    mark.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
    var box = document.createElement('span');
    box.className = 'ok-box';
    input.before(box);
    box.append(input, mark);
    return mark;
  }
  var nameIn = form.elements.name, nameOk = okMark(nameIn);
  var nameValid = function () { var n = nameIn.value.trim().length; return n >= 2 && n <= 50; };
  nameIn.addEventListener('input', function () { nameOk.classList.toggle('is-on', nameValid()); });

  // Phone mask (TZ20 §9, helpers in phone.js): +375 stays, at most 12 digits, the operator code is checked,
  // a complete number moves the focus on to the address. Off in the nick modes.
  var P = window.byPhone, telErr = $('#e-tel');
  // Non-breaking spaces and hyphens: the sample number never wraps inside (TZ21 §5)
  var TEL_ERR = 'Укажите номер в формате +375 (29) 123‑45‑67';
  var telOk = okMark(tel);
  var telDigits = function () { return tel.value.replace(/\D/g, ''); };
  var telSay = function (t) { telErr.textContent = t || KINDS[kind].error; showError('e-tel', !!t); };
  function setTel(d, caretDigits) {
    var was = P.complete(telDigits());
    if (!P.codeOk(d)) d = d.slice(0, 5); // nothing more until the code is fixed
    tel.value = P.format(d);
    if (caretDigits != null && document.activeElement === tel) { var c = P.caretAt(tel.value, caretDigits); tel.setSelectionRange(c, c); }
    telSay(P.codeOk(d) ? '' : 'Проверьте код: 25, 29, 33, 44 или городской');
    telOk.classList.toggle('is-on', P.complete(d));
    // Typed or pasted up to the last digit: on to the next field
    if (P.complete(d) && !was) form.elements.address.focus();
  }
  var phoneMode = function () { return P && kind === 'phone'; };
  tel.addEventListener('focus', function () {
    if (phoneMode() && !tel.value) { tel.value = '+375 '; tel.setSelectionRange(5, 5); }
  });
  tel.addEventListener('blur', function () { if (phoneMode() && tel.value.trim() === '+375') tel.value = ''; });
  tel.addEventListener('beforeinput', function (e) {
    if (!phoneMode()) return;
    var v = tel.value, a = tel.selectionStart, b = tel.selectionEnd;
    if (e.inputType === 'insertText' && e.data) {
      var add = e.data.replace(/\D/g, '');
      var left = telDigits().length - v.slice(a, b).replace(/\D/g, '').length + add.length;
      if (!add || left > (P.codeOk(telDigits()) ? 12 : 5)) e.preventDefault();
    } else if (e.inputType === 'deleteContentBackward' && a === b) {
      // The prefix stays; right after a separator the digit before it goes
      if (a <= 5) return e.preventDefault();
      if (/\D/.test(v.charAt(a - 1))) {
        e.preventDefault();
        var n = v.slice(0, a).replace(/\D/g, '').length;
        var d = telDigits();
        if (n > 3) setTel(d.slice(0, n - 1) + d.slice(n), n - 1);
      }
    }
  });
  tel.addEventListener('paste', function (e) {
    if (!phoneMode() || !e.clipboardData) return;
    e.preventDefault();
    var d = P.normalize(e.clipboardData.getData('text'));
    if (d === null) { tel.value = '+375 '; telOk.classList.remove('is-on'); return telSay('Принимаю только белорусские номера'); }
    setTel(d, 12);
  });
  tel.addEventListener('input', function (e) {
    if (!phoneMode()) return nickInput();
    var raw = tel.value;
    // Autofill replaces the whole value: read it as a pasted number
    if (!e.inputType || e.inputType === 'insertReplacementText') {
      var d = P.normalize(raw);
      if (d === null) { tel.value = '+375 '; telOk.classList.remove('is-on'); return telSay('Принимаю только белорусские номера'); }
      return setTel(d, 12);
    }
    var dg = raw.replace(/\D/g, ''), typed = dg.indexOf('375') === 0;
    setTel((typed ? dg : '375' + dg).slice(0, 12), typed ? raw.slice(0, tel.selectionStart).replace(/\D/g, '').length : 12);
  });

  // The channel decides the contact field (TZ21 §1): Telegram — phone, or a nick with «Нет номера»;
  // Instagram — its nick; Viber, WhatsApp, call — phone. The field is cleared only when phone <-> nick.
  var KINDS = {
    phone: { label: 'Телефон', type: 'tel', ph: '+375 (__) ___-__-__', error: TEL_ERR },
    tg: { label: 'Ник в Telegram', type: 'text', ph: '@username', error: 'Укажите ник в Telegram, например @anna_brest' },
    ig: { label: 'Ник в Instagram', type: 'text', ph: '@username', error: 'Укажите ник в Instagram, например @anna.brest' }
  };
  // Same rules as tg_nick() and ig_nick() in api/lib.php
  var NICK_OK = {
    tg: function (n) { return /^[A-Za-z_][A-Za-z0-9_]{4,31}$/.test(n); },
    ig: function (n) { return /^[A-Za-z0-9._]{1,30}$/.test(n) && !/^\.|\.$|\.\./.test(n); }
  };
  var nickRow = $('[data-nick-row]', form), kind = 'phone';
  var nickOf = function () { return tel.value.trim().replace(/^@/, ''); };
  function setContactMode() {
    var ch = form.elements.channel.value;
    if (ch !== 'telegram') nickToggle.checked = false;
    nickRow.classList.toggle('is-shut', ch !== 'telegram');
    nickRow.inert = ch !== 'telegram';
    var k = P.contactKind(ch, nickToggle.checked), m = KINDS[k];
    if (k === kind) return;
    if ((k === 'phone') !== (kind === 'phone')) tel.value = '';
    kind = k;
    telLabel.textContent = m.label;
    tel.type = m.type;
    tel.inputMode = m.type;
    tel.placeholder = m.ph;
    telSay('');
    nickInput();
  }
  $('[data-channels]', form).addEventListener('change', setContactMode);
  nickToggle.addEventListener('change', setContactMode);

  // Telegram nick: does it exist (api/tg-check.php reads t.me, TZ21 §1.3). One request per value; a spinner only
  // after 600 ms; any failure counts as «exists», so the form never blocks a real client. Instagram: format only.
  var NO_NICK = 'Такого ника в Telegram нет — проверьте написание';
  var nickSeen = {};
  function nickInput() {
    telOk.classList.remove('is-wait');
    if (kind === 'phone') return telOk.classList.toggle('is-on', P.complete(telDigits()));
    var n = nickOf();
    telOk.classList.toggle('is-on', NICK_OK[kind](n) && (kind === 'ig' || nickSeen[n.toLowerCase()] === true));
    if (!telErr.hidden) telSay('');
  }
  function checkNick() {
    var n = nickOf(), key = n.toLowerCase();
    if (kind !== 'tg' || !NICK_OK.tg(n)) return Promise.resolve(true);
    if (!(key in nickSeen)) {
      var wait = setTimeout(function () { if (nickOf().toLowerCase() === key) telOk.classList.add('is-wait'); }, 600);
      nickSeen[key] = fetch('/api/tg-check.php?u=' + encodeURIComponent(n), { headers: { Accept: 'application/json' } })
        .then(function (r) { return r.json(); })
        .then(function (r) { return r.ok !== false; }, function () { return true; })
        .then(function (ok) { clearTimeout(wait); nickSeen[key] = ok; return ok; });
    }
    return Promise.resolve(nickSeen[key]).then(function (ok) {
      if (kind === 'tg' && nickOf().toLowerCase() === key) {
        telOk.classList.remove('is-wait');
        telOk.classList.toggle('is-on', ok);
        if (!ok) telSay(NO_NICK);
      }
      return ok;
    });
  }
  tel.addEventListener('blur', function () { if (kind === 'tg') checkNick(); });

  // Times the master already booked stay visible but struck through and disabled (api/busy.php, 18 §1.2); the server checks again on submit
  var timeSel = form.elements.time, dayFull = $('[data-day-full]', form), busyHint = $('[data-busy-hint]', form);
  // Time chips over the hidden select (the select stays the sent value and the no-JS fallback); shown once a day is picked
  var tp = document.createElement('div');
  tp.className = 'tp';
  tp.setAttribute('role', 'group');
  tp.setAttribute('aria-label', 'Время');
  timeSel.after(tp);
  timeSel.classList.add('sr-only');
  timeSel.tabIndex = -1;
  timeSel.setAttribute('aria-hidden', 'true');
  var chip = function (o) {
    return '<button type="button" class="tp__chip" data-v="' + o.value + '"' + (o.disabled ? ' disabled aria-disabled="true"' : '') +
      ' aria-pressed="' + (o.value === timeSel.value) + '">' + o.text + (o.disabled ? '<span class="sr-only">, занято</span>' : '') + '</button>';
  };
  function renderTimes() {
    tp.hidden = !form.elements.date.value;
    tp.innerHTML = [].map.call(timeSel.children, function (el) {
      return el.tagName === 'OPTGROUP'
        ? '<p class="tp__part">' + el.label + '</p><div class="tp__row">' + [].map.call(el.children, chip).join('') + '</div>'
        : '<div class="tp__row">' + chip(el) + '</div>';
    }).join('');
  }
  tp.addEventListener('click', function (e) {
    var b = e.target.closest('.tp__chip');
    if (b) { timeSel.value = b.dataset.v; renderTimes(); }
  });
  function loadBusy() {
    var d = form.elements.date.value;
    var apply = function (busy, full) {
      $$('option', timeSel).forEach(function (o) { o.disabled = !!o.value && busy.indexOf(o.value) !== -1; });
      if (timeSel.selectedOptions[0].disabled) timeSel.value = '';
      dayFull.hidden = !full;
      busyHint.hidden = !busy.length || full;
      renderTimes();
    };
    apply([], false);
    if (!d) return;
    fetch('/api/busy.php?date=' + d, { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (res) { if (form.elements.date.value === d && res.busy) apply(res.busy, res.full); })
      .catch(function () { /* the form works as before; request.php still checks */ });
  }
  form.elements.date.addEventListener('change', function () {
    if (!form.elements.date.value) timeSel.value = ''; // no day, no time (TZ20 §1.4)
    loadBusy();
  });
  renderTimes();

  // Photos of the premises (18 part 3): each is redrawn on a canvas to 1600 px JPEG, which also drops EXIF (geolocation).
  // One at a time, so a phone does not decode five 12 MP photos at once; submit waits for photosReady.
  var photos = [];
  var photosReady = Promise.resolve();
  var photoBox = form.querySelector('[data-photos]');
  if (photoBox && HTMLCanvasElement.prototype.toBlob && window.URL) {
    photoBox.hidden = false;
    var picker = $('#f-photos');
    var addBtn = photoBox.querySelector('.photos__add');
    var photoErr = photoBox.querySelector('[data-photos-error]');
    var photoMsg = function (t) { photoErr.textContent = t; photoErr.hidden = !t; };
    var shrink = function (file) {
      return new Promise(function (ok, fail) {
        var img = new Image();
        var url = URL.createObjectURL(file);
        img.onload = function () {
          var k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
          var c = document.createElement('canvas');
          c.width = Math.round(img.naturalWidth * k);
          c.height = Math.round(img.naturalHeight * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(url);
          c.toBlob(function (b) { if (b) ok(b); else fail(); }, 'image/jpeg', 0.8);
        };
        img.onerror = function () { URL.revokeObjectURL(url); fail(); };
        img.src = url;
      });
    };
    var renderPhotos = function () {
      $$('.photos__item', photoBox).forEach(function (el) { el.remove(); });
      photos.forEach(function (p, i) {
        var el = document.createElement('div');
        el.className = 'photos__item';
        el.innerHTML = '<img alt="Фото ' + (i + 1) + '"><button type="button" aria-label="Убрать фото ' + (i + 1) + '">×</button>';
        el.firstChild.src = p.url;
        el.lastChild.addEventListener('click', function () {
          URL.revokeObjectURL(p.url);
          photos.splice(photos.indexOf(p), 1);
          photoMsg('');
          renderPhotos();
          addBtn.focus();
        });
        addBtn.before(el);
      });
      addBtn.hidden = photos.length >= 5;
    };
    addBtn.addEventListener('click', function () { picker.click(); });
    picker.addEventListener('change', function () {
      var files = [].slice.call(picker.files);
      var bad = false;
      var over = false;
      picker.value = '';
      photoMsg('');
      files.forEach(function (f) {
        photosReady = photosReady.then(function () {
          if (photos.length >= 5) { over = true; return; }
          return shrink(f).then(function (b) { photos.push({ blob: b, url: URL.createObjectURL(b) }); }, function () { bad = true; });
        });
      });
      photosReady = photosReady.then(function () {
        photoMsg(bad ? 'Это фото не открылось — попробуйте другое' : over ? 'Можно до 5 фото' : '');
        renderPhotos();
      });
    });
  }

  function showError(id, show) {
    var el = $('#' + id);
    if (!el) return;
    el.hidden = !show;
    var input = form.querySelector('[aria-describedby="' + id + '"]');
    if (input) input.setAttribute('aria-invalid', show ? 'true' : 'false');
  }
  function validate() {
    var okName = nameValid();
    var okTel = kind === 'phone' ? P.complete(telDigits()) : NICK_OK[kind](nickOf());
    if (!okTel) telErr.textContent = KINDS[kind].error;
    var okConsent = form.elements.consent.checked;
    // A day alone means «Любое время»; a time needs a day
    var okSlot = !!form.elements.date.value || !form.elements.time.value;
    showError('e-name', !okName); showError('e-tel', !okTel); showError('e-consent', !okConsent); showError('e-date', !okSlot);
    var first = !okName ? form.elements.name : !okTel ? tel : !okSlot ? form.elements.date : !okConsent ? form.elements.consent : null;
    if (first) first.focus();
    return !first;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    status.hidden = true;
    if (!validate()) return;
    form.elements.page.value = location.pathname;
    try { form.elements.utm.value = sessionStorage.getItem('utm') || ''; } catch (err) { /* ignore */ }
    form.elements.ts.value = String(Date.now() - started);
    var btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    // A Telegram nick that does not exist stops here (the server checks again)
    checkNick()
      .then(function (ok) {
        if (!ok) { tel.focus(); throw new Error('validation'); }
        return photosReady;
      })
      .then(function () {
        var data = new FormData(form);
        photos.forEach(function (p, i) { data.append('photos[]', p.blob, 'photo' + (i + 1) + '.jpg'); });
        return fetch(form.action, { method: 'POST', body: data, headers: { Accept: 'application/json' } });
      })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.ok) {
          // Card for the thank-you page (18 §2): no name or phone, read once and deleted there
          var calc = form.elements.calc.value;
          var total = (calc.match(/Итого ≈ ([^\n]+) руб\./) || [])[1] || '';
          try {
            sessionStorage.setItem('vc-last-request', JSON.stringify({
              what: calc ? calc.split('\n')[0] : '', total: total,
              date: form.elements.date.value, time: form.elements.time.value, photos: photos.length,
            }));
          } catch (err) { /* ignore */ }
          location.href = '/cleaning-demo/spasibo/?ch=' + encodeURIComponent(form.elements.channel.value);
          return;
        }
        if (res.errors && res.errors.date) loadBusy();
        Object.keys(res.errors || {}).forEach(function (k) {
          var el = $('#e-' + k); if (el) { el.textContent = res.errors[k]; showError('e-' + k, true); }
        });
        throw new Error('validation');
      })
      .catch(function (err) {
        btn.disabled = false;
        if (err && err.message === 'validation') return;
        report('Заявка не отправилась: ' + (err && err.message || err), 'request.php');
        status.textContent = 'Не получилось отправить заявку. Напишите мне в Telegram или Viber, или позвоните — кнопки рядом.';
        status.hidden = false;
      });
  });
})();
