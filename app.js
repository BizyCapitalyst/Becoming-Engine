/* Becoming Engine — mobile day-view PWA.
 *
 * Loads schedule.json (exported from the desktop app), renders one day
 * at a time, swipe left/right or tap arrows to navigate days. Falls
 * back to the architectural template (daily + day-of-week slots) when
 * a date has no explicit blocks.
 *
 * No runtime dependencies. Vanilla DOM + touch events.
 */

(() => {
  const DOW_ABBR = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const DOW_FULL = {
    Mon: "Monday",   Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday",
    Fri: "Friday",   Sat: "Saturday", Sun: "Sunday",
  };

  const $stage      = document.getElementById('stage');
  const $prev       = document.getElementById('prev-day');
  const $next       = document.getElementById('next-day');
  const $today      = document.getElementById('today-btn');
  const $dow        = document.getElementById('dow');
  const $iso        = document.getElementById('iso');
  const $todayTag   = document.getElementById('today-tag');
  const $exported   = document.getElementById('exported-at');

  let schedule = { blocks_by_date: {}, architecture: { daily: [], by_dow: {} }, exported_at: null };
  let currentDate = todayISO();

  // --- Data loading -----------------------------------------------
  async function loadSchedule() {
    try {
      // Cache-bust so updates pushed to GitHub propagate faster.
      const res = await fetch(`schedule.json?v=${Date.now()}`, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      schedule = await res.json();
      if (schedule.exported_at) {
        const d = new Date(schedule.exported_at);
        $exported.textContent = `Updated ${d.toLocaleString()}`;
      } else {
        $exported.textContent = 'Schedule loaded.';
      }
    } catch (err) {
      $exported.textContent = `No schedule (${err.message}).`;
      schedule = { blocks_by_date: {}, architecture: { daily: [], by_dow: {} }, exported_at: null };
    }
    render();
    // Anchor the scroll so the now-marker shows with one block of
    // context above it. We fire at multiple delays because layout
    // can be still computing when the first rAF runs (especially on
    // cold launches with web fonts loading) — each call is a cheap
    // idempotent scrollTo, so re-firing is harmless.
    requestAnimationFrame(() =>
      requestAnimationFrame(scrollToNowContext)
    );
    [80, 250, 600].forEach(t => setTimeout(scrollToNowContext, t));
  }

  // --- Rendering --------------------------------------------------
  function todayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }
  function shiftDate(iso, deltaDays) {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + deltaDays);
    const yy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  }
  function dowFor(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    // JS Sunday=0 .. Saturday=6 → remap to Mon=0..Sun=6
    const js = new Date(y, m - 1, d).getDay();
    return DOW_ABBR[(js + 6) % 7];
  }

  function blocksForDate(iso) {
    // Prefer explicit blocks for the date; fall back to architectural
    // template (daily + matching day-of-week) so future / unscheduled
    // days still show the canonical shape of the day.
    const explicit = schedule.blocks_by_date && schedule.blocks_by_date[iso];
    if (explicit && explicit.length) {
      return explicit.map(b => ({ ...b, _from_template: false }));
    }
    const arch = schedule.architecture || {};
    const dow = dowFor(iso);
    const merged = [
      ...(arch.daily || []),
      ...((arch.by_dow && arch.by_dow[dow]) || []),
    ];
    return merged.map(b => ({ ...b, _from_template: true }));
  }

  function fmtTime(t) {
    if (!t) return '—';
    const m = /^(\d{1,2}):(\d{2})/.exec(t);
    return m ? `${m[1].padStart(2, '0')}:${m[2]}` : t;
  }

  function renderDay(iso) {
    const card = document.createElement('div');
    card.className = 'day-card';
    card.dataset.date = iso;

    const blocks = blocksForDate(iso)
      .filter(b => b.start)                              // need a start time
      .sort((a, b) => (a.start || '').localeCompare(b.start || ''));

    if (!blocks.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'Nothing scheduled for this day.';
      card.appendChild(empty);
      return card;
    }

    // --- Helpers for buffer rendering -----------------------------
    // Match the desktop calendar:
    //   - Pre-buffer  : gradient BUFFER_COLOR (top) -> block colour (bottom)
    //   - Post-buffer : gradient block colour (top) -> BUFFER_COLOR (bottom)
    //   - 1px BUFFER_COLOR divider on the edge touching the block
    // Height scales with buffer minutes so longer buffers feel longer.
    const BUFFER_COLOR = '#1d212a';
    const bufferHeight = (mins) => Math.min(40, Math.max(8, mins * 0.8 + 6));

    blocks.forEach(b => {
      const blockCol = b.color || '#3a3d44';
      const bb = b.buffer_before || 0;
      const ba = b.buffer_after  || 0;

      // Pre-buffer bar (above the block, gradient toward block colour)
      if (bb > 0) {
        const r = document.createElement('div');
        r.className = 'block-row';
        const t = document.createElement('div');
        t.className = 'block-time block-time-buf';
        t.textContent = `−${bb}m`;
        r.appendChild(t);
        const bar = document.createElement('div');
        bar.className = 'block-buffer block-buffer-before';
        bar.style.height = bufferHeight(bb) + 'px';
        bar.style.background =
          `linear-gradient(to bottom, ${BUFFER_COLOR} 0%, ${blockCol} 100%)`;
        bar.style.borderBottom = `1px solid ${BUFFER_COLOR}`;
        r.appendChild(bar);
        card.appendChild(r);
      }

      // Main block row
      const row = document.createElement('div');
      row.className = 'block-row';

      const t = document.createElement('div');
      t.className = 'block-time';
      t.textContent = fmtTime(b.start);
      row.appendChild(t);

      const c = document.createElement('div');
      c.className = 'block-card' +
        (b.status === 'lived' ? ' lived' : '') +
        (b.status === 'skipped' ? ' skipped' : '') +
        (b._from_template ? ' from-template' : '');
      // Square the corners on edges that meet a buffer so the gradient
      // reads as one continuous shoulder.
      if (bb > 0) c.classList.add('block-card-no-top');
      if (ba > 0) c.classList.add('block-card-no-bot');
      if (b.color) {
        c.style.boxShadow = `inset 3px 0 0 0 ${b.color}`;
      }

      const name = document.createElement('div');
      name.className = 'block-name';
      name.textContent = b.name || '(untitled)';
      c.appendChild(name);

      if (b.objective) {
        const obj = document.createElement('div');
        obj.className = 'block-objective';
        obj.textContent = b.objective;
        c.appendChild(obj);
      }

      const meta = [];
      if (b.duration) meta.push(`${b.duration} min`);
      if (b.status && b.status !== 'planned') meta.push(b.status);
      if (b.alert_target) {
        // Surface both lead time + target so the user can scan a day
        // and see exactly which events will ping where.
        const lead = Math.max(0, (b.alert | 0));
        const when = (lead === 0) ? 'at start' : `${lead}m`;
        const where = (b.alert_target === 'both')
          ? 'phone+desktop'
          : b.alert_target;
        meta.push(`alert · ${when} · ${where}`);
      }
      if (meta.length) {
        const m = document.createElement('div');
        m.className = 'block-meta';
        m.textContent = meta.join('  ·  ');
        c.appendChild(m);
      }

      row.appendChild(c);
      card.appendChild(row);

      // Post-buffer bar (below the block, gradient back to BUFFER_COLOR)
      if (ba > 0) {
        const r = document.createElement('div');
        r.className = 'block-row';
        const t2 = document.createElement('div');
        t2.className = 'block-time block-time-buf';
        t2.textContent = `+${ba}m`;
        r.appendChild(t2);
        const bar = document.createElement('div');
        bar.className = 'block-buffer block-buffer-after';
        bar.style.height = bufferHeight(ba) + 'px';
        bar.style.background =
          `linear-gradient(to bottom, ${blockCol} 0%, ${BUFFER_COLOR} 100%)`;
        bar.style.borderTop = `1px solid ${BUFFER_COLOR}`;
        r.appendChild(bar);
        card.appendChild(r);
      }
    });

    // --- Now-marker: cool-gray breathing arrow + line at current time
    // (only on today's card). Inserts before the first block whose
    // start is >= now, or appends if all blocks are already in the
    // past for today.
    if (iso === todayISO()) {
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const blockMin = (s) => {
        const m = /^(\d{1,2}):(\d{2})/.exec(s);
        return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : 0;
      };
      const marker = document.createElement('div');
      marker.className = 'now-marker';
      marker.innerHTML =
        '<div class="now-arrow"></div>' +
        '<div class="now-line"></div>' +
        '<div class="now-time">' +
        String(now.getHours()).padStart(2, '0') + ':' +
        String(now.getMinutes()).padStart(2, '0') +
        '</div>';

      let inserted = false;
      const rows = Array.from(card.children);
      for (const row of rows) {
        const timeEl = row.querySelector('.block-time:not(.block-time-buf)');
        if (!timeEl) continue;
        const t = timeEl.textContent;
        if (blockMin(t) >= nowMin) {
          card.insertBefore(marker, row);
          inserted = true;
          break;
        }
      }
      if (!inserted) card.appendChild(marker);
    }

    return card;
  }

  function dayDelta(iso) {
    // Days between iso and today, signed. UTC midnight anchoring so
    // DST transitions don't cause off-by-one errors.
    const today = todayISO();
    if (iso === today) return 0;
    const a = new Date(today + 'T00:00:00Z');
    const b = new Date(iso   + 'T00:00:00Z');
    return Math.round((b - a) / (1000 * 60 * 60 * 24));
  }

  function deltaLabel(delta) {
    if (delta === 0)   return 'today';
    if (delta ===  1)  return 'tomorrow';
    if (delta === -1)  return 'yesterday';
    if (delta >   0)   return `+${delta} days`;
    return `${delta} days`;            // already negative-prefixed
  }

  function renderHeader(iso) {
    const dow = dowFor(iso);
    $dow.textContent = DOW_FULL[dow] || dow;
    $iso.textContent = iso;
    // Always show a relative-to-today indicator so users always know
    // how far they've navigated from today, not just a binary
    // today/not-today flag that goes stale across midnight.
    $todayTag.textContent = deltaLabel(dayDelta(iso));
    $todayTag.hidden = false;
  }

  function render() {
    $stage.innerHTML = '';
    const card = renderDay(currentDate);
    card.style.transform = 'translateX(0)';
    $stage.appendChild(card);
    renderHeader(currentDate);
  }

  // Scroll today's card so the now-marker sits with exactly one
  // block of context above it. Opens you onto "what just finished"
  // and "what's now / next" without making you scroll to find them.
  // Only meaningful on today's card; no-op on past / future days.
  function scrollToNowContext() {
    const card = $stage.querySelector('.day-card');
    if (!card) return;
    if (card.dataset.date !== todayISO()) return;
    const marker = card.querySelector('.now-marker');
    if (!marker) return;
    // Walk back from the marker to find the nearest block-row that
    // came before "now". One block of context is plenty.
    let prev = marker.previousElementSibling;
    while (prev && !prev.classList.contains('block-row')) {
      prev = prev.previousElementSibling;
    }
    const target = prev || marker;
    // Compute target's offset inside the scroll container, then
    // back off a few px so it doesn't kiss the top edge.
    const cardRect   = card.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const targetOffset =
      targetRect.top - cardRect.top + card.scrollTop;
    card.scrollTo({
      top: Math.max(0, targetOffset - 8),
      behavior: 'auto',
    });
  }

  // --- Navigation -------------------------------------------------
  function go(deltaDays) {
    if (!deltaDays) return;
    const newDate = shiftDate(currentDate, deltaDays);
    const newCard = renderDay(newDate);
    const oldCard = $stage.querySelector('.day-card');

    // Slide animation
    const w = $stage.clientWidth;
    newCard.style.transform = `translateX(${deltaDays > 0 ? w : -w}px)`;
    $stage.appendChild(newCard);

    // Force reflow then animate
    void newCard.offsetWidth;
    oldCard.classList.add('transition');
    newCard.classList.add('transition');
    oldCard.style.transform = `translateX(${deltaDays > 0 ? -w : w}px)`;
    newCard.style.transform = 'translateX(0)';

    setTimeout(() => {
      if (oldCard.parentNode) oldCard.parentNode.removeChild(oldCard);
      newCard.classList.remove('transition');
    }, 240);

    currentDate = newDate;
    renderHeader(currentDate);
  }

  $prev.addEventListener('click', () => go(-1));
  $next.addEventListener('click', () => go(+1));
  $today.addEventListener('click', () => {
    const t = todayISO();
    if (t === currentDate) {
      // Already on today's card — re-snap the scroll position to
      // the now-context so the button doubles as "scroll back to
      // now" when the user has scrolled away from it.
      scrollToNowContext();
      return;
    }
    const delta = (new Date(t) - new Date(currentDate)) / (1000 * 60 * 60 * 24);
    go(delta > 0 ? +1 : -1);
    // Snap to today exactly (multi-day jump renders just one transition;
    // re-render the final state) and re-anchor the scroll.
    setTimeout(() => {
      currentDate = t;
      render();
      requestAnimationFrame(() =>
        requestAnimationFrame(scrollToNowContext)
      );
    }, 250);
  });

  // --- Swipe ------------------------------------------------------
  // Horizontal touch drag with snap-to-day. Vertical movement defers
  // to native scroll inside the card.
  let touchStartX = 0;
  let touchStartY = 0;
  let touchMoveX = 0;
  let dragging = false;
  let direction = 0;     // 0 unknown, 1 horizontal, 2 vertical

  $stage.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchMoveX = 0;
    dragging = true;
    direction = 0;
  }, { passive: true });

  $stage.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    const dx = e.touches[0].clientX - touchStartX;
    const dy = e.touches[0].clientY - touchStartY;
    if (direction === 0) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        direction = Math.abs(dx) > Math.abs(dy) ? 1 : 2;
      }
    }
    if (direction === 1) {
      touchMoveX = dx;
      const card = $stage.querySelector('.day-card');
      if (card) card.style.transform = `translateX(${dx}px)`;
    }
  }, { passive: true });

  $stage.addEventListener('touchend', () => {
    if (!dragging) return;
    dragging = false;
    if (direction !== 1) return;
    const w = $stage.clientWidth;
    const card = $stage.querySelector('.day-card');
    if (!card) return;
    const threshold = Math.max(60, w * 0.18);
    if (touchMoveX <= -threshold) {
      // swiped left → next day
      card.style.transform = '';
      go(+1);
    } else if (touchMoveX >= threshold) {
      // swiped right → previous day
      card.style.transform = '';
      go(-1);
    } else {
      // snap back
      card.classList.add('transition');
      card.style.transform = 'translateX(0)';
      setTimeout(() => card.classList.remove('transition'), 240);
    }
    touchMoveX = 0;
  });

  // --- Keyboard (desktop testing) --------------------------------
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft')  go(-1);
    if (e.key === 'ArrowRight') go(+1);
    if (e.key === 't' || e.key === 'T') $today.click();
  });

  // --- Notifications ----------------------------------------------
  // Per-block alerts. While the PWA is open in any tab / standalone
  // window, fire a Notification + soft chime when (now >= block.start
  // - alert_minutes). True closed-app push needs a server endpoint
  // and is out of scope for the local-first model.
  //
  // Fired-block bookkeeping: localStorage key `_be_fired_alerts` holds
  // a JSON list of `${date}|${start}|${name}` strings so reopening
  // the app doesn't re-fire alerts. Pruned to today on every load so
  // the list never grows unbounded.

  const ALERT_FIRED_KEY = '_be_fired_alerts';
  const ALERT_BANNER_KEY = '_be_alert_banner_seen';

  function loadFiredAlerts() {
    try { return new Set(JSON.parse(localStorage.getItem(ALERT_FIRED_KEY) || '[]')); }
    catch { return new Set(); }
  }
  function saveFiredAlerts(set) {
    try { localStorage.setItem(ALERT_FIRED_KEY, JSON.stringify([...set])); }
    catch {}
  }
  function pruneFiredAlerts() {
    const today = todayISO();
    const fired = loadFiredAlerts();
    const kept  = new Set([...fired].filter(k => k.startsWith(today + '|')));
    if (kept.size !== fired.size) saveFiredAlerts(kept);
  }

  function alertKey(iso, b) {
    return `${iso}|${b.start}|${b.name}`;
  }

  // Soft chime — Web Audio sine pulse at ~660 Hz for 220 ms with a
  // gentle envelope so it reads as a chime, not a beep.
  let _audioCtx = null;
  function chime() {
    try {
      _audioCtx = _audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const ctx = _audioCtx;
      if (ctx.state === 'suspended') ctx.resume();
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, t0);
      osc.frequency.exponentialRampToValueAtTime(880, t0 + 0.18);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.30);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.32);
    } catch {}
  }

  function fireBlockAlert(iso, b) {
    const lead = (b.alert == null) ? null : Math.max(0, b.alert | 0);
    const heading = (lead === 0)
      ? `Now: ${b.name}`
      : `In ${lead} min: ${b.name}`;
    const body = b.objective || b.description || `${b.start} · ${b.duration || ''} min`;
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        new Notification(heading, {
          body,
          icon: 'icon.svg',
          tag:  alertKey(iso, b),     // collapses dupes if any
          silent: false,
        });
      } catch {}
    }
    chime();
  }

  function checkAlerts() {
    const today = todayISO();
    // Only blocks whose alert_target opted-in mobile fire here.
    // Desktop-only or no-alert blocks are skipped entirely so the
    // user can route some events to phone, others to laptop.
    const ANDROID_TARGETS = new Set(['android', 'both']);
    const blocks = blocksForDate(today).filter(b =>
      b.start && b.alert != null && ANDROID_TARGETS.has(b.alert_target)
    );
    if (!blocks.length) return;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const fired = loadFiredAlerts();
    let mutated = false;
    for (const b of blocks) {
      const m = /^(\d{1,2}):(\d{2})/.exec(b.start);
      if (!m) continue;
      const startMin = parseInt(m[1]) * 60 + parseInt(m[2]);
      const fireAtMin = startMin - Math.max(0, b.alert | 0);
      // Window: fire if we're past fireAt but not more than 30 min
      // late (so a desktop tab that sat closed all morning doesn't
      // dump every alert at once when it wakes).
      if (nowMin >= fireAtMin && nowMin - fireAtMin <= 30) {
        const key = alertKey(today, b);
        if (!fired.has(key)) {
          fireBlockAlert(today, b);
          fired.add(key);
          mutated = true;
        }
      }
    }
    if (mutated) saveFiredAlerts(fired);
  }

  // --- Permission banner ------------------------------------------
  // First-launch only: a small dismissible row offering to enable
  // notifications. The browser's prompt requires a user gesture, so
  // this can't be auto-requested on page load.
  function maybeShowAlertBanner() {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'default') return;
    if (localStorage.getItem(ALERT_BANNER_KEY) === '1') return;
    const bar = document.createElement('div');
    bar.className = 'alert-banner';
    bar.innerHTML =
      '<span class="ab-msg">Enable alerts for upcoming blocks?</span>' +
      '<button class="ab-yes">Enable</button>' +
      '<button class="ab-no">Not now</button>';
    document.body.appendChild(bar);
    bar.querySelector('.ab-yes').addEventListener('click', async () => {
      try { await Notification.requestPermission(); } catch {}
      bar.remove();
      localStorage.setItem(ALERT_BANNER_KEY, '1');
    });
    bar.querySelector('.ab-no').addEventListener('click', () => {
      bar.remove();
      localStorage.setItem(ALERT_BANNER_KEY, '1');
    });
  }

  // --- Boot -------------------------------------------------------
  loadSchedule();
  pruneFiredAlerts();
  maybeShowAlertBanner();

  // Refresh the header every minute so the relative-day indicator
  // (today / tomorrow / +N days …) self-corrects when the system
  // clock crosses midnight while the app is open.
  setInterval(() => renderHeader(currentDate), 60_000);

  // Check alerts every 30 s. We check more often than the alert
  // resolution (which is per-minute) so we catch the window even if
  // the tab was throttled or the clock jumped.
  checkAlerts();
  setInterval(checkAlerts, 30_000);
})();
