/**
 * The larger-text browser emulation shared by the large-text checks (see verify-halfway-large-text.mjs for the method, said plainly:
 * an emulation of iOS content-size multipliers in a browser, not Dynamic Type and not a device).
 */

/** Runs in the page: scales text like <Text> on iOS, and keeps doing so as the page changes. */
export function installTextScale({ scale, insets }) {
  const style = document.createElement('style');
  style.textContent = `html { font-size: ${16 * scale}px !important; } div[style*="safe-area-inset"] { padding-top: ${insets.top}px !important; padding-bottom: ${insets.bottom}px !important; }`;
  const hasText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  const apply = () => {
    for (const el of document.body ? document.body.querySelectorAll('*') : []) {
      if (el.closest('svg') || !hasText(el)) continue;
      if (!el.dataset.fp0) {
        const cs = getComputedStyle(el);
        el.dataset.fp0 = cs.fontSize;
        el.dataset.fp1 = cs.lineHeight;
      }
      // Text the app caps (maxFontSizeMultiplier) grows only to its cap, as React Native would: the six tab labels (1.2) and the photo credit (1).
      const cap = el.matches('[data-testid^="tab-label"]') ? 1.2 : el.matches('[data-testid="venue-image-credit"],[data-testid="venue-image-note"],[data-testid="venue-image-note"] *') ? 1 : Infinity;
      const k = Math.min(scale, cap);
      el.style.setProperty('font-size', `${parseFloat(el.dataset.fp0) * k}px`, 'important');
      const lh = parseFloat(el.dataset.fp1);
      if (Number.isFinite(lh)) el.style.setProperty('line-height', `${lh * k}px`, 'important');
    }
  };
  let queued = false;
  const schedule = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; apply(); }); };
  const start = () => { document.head.appendChild(style); new MutationObserver(schedule).observe(document.documentElement, { subtree: true, childList: true, characterData: true }); schedule(); };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
}

/** Runs in the page: every measurable problem on the current screen. */
export function analyse({ width, height, tabbar }) {
  const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.02; };
  const findings = [];
  // With a dialog open, only the dialog is on screen as far as a person (or a screen reader) is concerned.
  const modal = document.querySelector('[aria-modal="true"]') ?? document.querySelector('[data-testid="halfway-edit-sheet"] [aria-label="Edit meeting details"]') ?? document.querySelector('[data-testid="halfway-sheet-expanded"] [aria-label$="recommendation details"]');
  const scope = modal ?? document.body;
  const within = (el) => scope.contains(el);
  const label = (el) => `${el.tagName.toLowerCase()}${el.getAttribute('data-testid') ? `[${el.getAttribute('data-testid')}]` : ''} "${(el.getAttribute('aria-label') || el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 36)}"`;
  const inScroller = (el) => { for (let n = el.parentElement; n; n = n.parentElement) { const cs = getComputedStyle(n); if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 1) return n; } return null; };

  // horizontal overflow
  if (document.documentElement.scrollWidth > width + 1) findings.push(`page scrolls sideways (${document.documentElement.scrollWidth} in ${width})`);
  for (const el of scope.querySelectorAll('*')) {
    if (!visible(el) || el.closest('svg')) continue;
    const r = el.getBoundingClientRect();
    if (r.right > width + 1 && r.left < width) findings.push(`reaches past the right edge: ${label(el)} (to ${Math.round(r.right)})`);
  }
  // clipped text: text cut off by an ancestor that hides overflow, in either direction, unless that ancestor is a scroller
  for (const el of scope.querySelectorAll('*')) {
    if (!visible(el) || el.closest('svg')) continue;
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const r = el.getBoundingClientRect();
    // truncated by its own line limit
    const cs = getComputedStyle(el);
    if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) findings.push(`text truncated with an ellipsis: ${label(el)}`);
    if (/-webkit-box/.test(cs.display) && el.scrollHeight > el.clientHeight + 1) findings.push(`text cut at its line limit: ${label(el)}`);
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const ncs = getComputedStyle(n);
      if (!/(hidden|clip)/.test(`${ncs.overflowX} ${ncs.overflowY}`)) continue;
      const nr = n.getBoundingClientRect();
      if (nr.width === 0 || nr.height === 0) continue;
      // Off-screen below/above a scroller is not clipping; only text cut by a box that is itself on screen counts.
      if (nr.bottom < 0 || nr.top > height) continue;
      const cutX = r.left < nr.left - 1 || r.right > nr.right + 1;
      const cutY = r.top < nr.top - 1 || r.bottom > nr.bottom + 1;
      if ((cutX || cutY) && !inScroller(el)) { findings.push(`text clipped by ${label(n)}: ${label(el)}`); break; }
    }
  }
  // controls
  const CONTROLS = 'button,a[href],[role="button"],[role="tab"],[role="radio"],[role="link"],input';
  const isTab = (el) => el.getAttribute('role') === 'tab';
  // A control is "on screen" only where its scroller shows it: one scrolled out of its list is not under anything.
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    if (!(r.bottom > 0 && r.top < height && r.right > 0 && r.left < width)) return false;
    const sc = inScroller(el);
    if (sc) { const sr = sc.getBoundingClientRect(); if (r.top + r.height / 2 < sr.top || r.top + r.height / 2 > sr.bottom) return false; }
    return true;
  };
  // A scrim behind a sheet is a control the size of the screen by design; it is not content.
  const backdrop = (el) => { const r = el.getBoundingClientRect(); return r.width * r.height > 0.5 * width * height; };
  // Map pins are drawn small on purpose (crowded places must not overlap) and each place is also a full-size card in the List; the sheet's grabber is a swipe handle with the 44 pt Details / Close button beside it. All are checked for being covered, not for 44 pt.
  const isPin = (el) => /^halfway-map-(pin-|venue)/.test(el.getAttribute('data-testid') || '') || /^(Show details|Collapse details)$/.test(el.getAttribute('aria-label') || '');
  const controls = [...scope.querySelectorAll(CONTROLS)].filter(visible).filter(shown).filter((el) => !backdrop(el));
  for (const el of controls) {
    const r = el.getBoundingClientRect();
    // The tap target is what answers a pointer: a thin-drawn control may have a bigger target (hit slop). Walk out from the centre.
    const reach = (dx, dy) => { let n = 0; while (n < 60) { const x = Math.min(width - 1, Math.max(0, r.left + r.width / 2 + dx * (n + 1))); const y = Math.min(height - 1, Math.max(0, r.top + r.height / 2 + dy * (n + 1))); const hit = document.elementFromPoint(x, y); if (!hit || !(el === hit || el.contains(hit))) break; n += 1; } return n; };
    const w = reach(1, 0) + reach(-1, 0) + 1; const h = reach(0, 1) + reach(0, -1) + 1;
    if (!isPin(el) && (Math.max(r.width, w) < 44 - 1 || Math.max(r.height, h) < 44 - 1)) findings.push(`target under 44 pt: ${label(el)} (${Math.round(Math.max(r.width, w))}x${Math.round(Math.max(r.height, h))})`);
    // covered at its centre by something that is not it
    const cx = Math.min(width - 1, Math.max(0, r.left + r.width / 2)); const cy = Math.min(height - 1, Math.max(0, r.top + r.height / 2));
    const top = document.elementFromPoint(cx, cy);
    // The floating navigation is a layer over scrolling content by design: content passes under it and scrolls clear (checked separately).
    if (top && !(el === top || el.contains(top) || top.contains(el)) && !top.closest('[role="tab"],[role="tablist"]') && !isTab(el)) findings.push(`covered at its centre by ${label(top)}: ${label(el)}`);
  }
  for (let i = 0; i < controls.length; i += 1) for (let j = i + 1; j < controls.length; j += 1) {
    const a = controls[i]; const b = controls[j];
    if (a.contains(b) || b.contains(a) || isTab(a) || isTab(b)) continue;
    // Only the part of a control its scroller shows is on screen.
    const seen = (el) => { const r = el.getBoundingClientRect(); const sc = inScroller(el); if (!sc) return r; const q = sc.getBoundingClientRect(); return { left: Math.max(r.left, q.left), right: Math.min(r.right, q.right), top: Math.max(r.top, q.top), bottom: Math.min(r.bottom, q.bottom), width: Math.max(0, Math.min(r.right, q.right) - Math.max(r.left, q.left)), height: Math.max(0, Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top)) }; };
    const ra = seen(a); const rb = seen(b);
    if (ra.width * ra.height === 0 || rb.width * rb.height === 0) continue;
    const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left); const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (ox > 4 && oy > 4 && (ox * oy) / Math.min(ra.width * ra.height, rb.width * rb.height) > 0.2) findings.push(`controls overlap: ${label(a)} and ${label(b)}`);
  }
  // navigation
  if (tabbar) {
    const tabs = [...document.querySelectorAll('[role="tab"]')].filter(visible);
    if (tabs.length !== 6) findings.push(`navigation shows ${tabs.length} tabs, not 6`);
    for (const tab of tabs) {
      const r = tab.getBoundingClientRect();
      if (r.bottom > height + 1) findings.push(`tab below the screen edge: ${label(tab)}`);
      const text = tab.querySelector('[data-testid^="tab-label"]');
      if (text && text.scrollWidth > text.clientWidth + 1) findings.push(`tab label truncated: ${label(tab)}`);
    }
  }
  return [...new Set(findings)];
}

